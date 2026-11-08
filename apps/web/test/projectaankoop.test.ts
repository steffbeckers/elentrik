// Betalen per project (spec 4.5): een project vrijgeven met een eenmalige Checkout-betaling, de
// verwerking via de webhook en via /vrijgave/synchroniseer, en het doorsturen van de factuur. De
// routebestanden draaien in een echte h3-app op 127.0.0.1 met Better Auth en de database op
// PGlite (zoals test/abonnement-api.test.ts); Stripe is de nep-poort en de webhooks worden
// getekend met de offline testhelper van de SDK. Er gaat niets over het netwerk.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type Auth, maakAuth, zetAuth } from "../server/auth";
import { type AbonnementConfig, zetAbonnementen } from "../server/abonnementen/config";
import { type Db, zetDb } from "../server/db";
import {
  abonnementen,
  doorgestuurdeFacturen,
  member,
  organization,
  projectaankopen,
  projecten,
  stripeEvents,
  user,
} from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { maakProject } from "../server/projecten/repo";
import { VRIJGAVE_LOOPT, type AbonnementOverzicht } from "../shared/abonnement";
import { maakTestDb } from "./db";
import { maakNepStripe, type NepStripe } from "./nep-stripe";
import { beveiligdeRoutebestanden, routeUit } from "./routes";

const WACHTWOORD = "lang-genoeg-1";
const GEHEIM = "whsec_test_projectaankoop";
const INBOX = "boekhouding@voorbeeld.be";
const DAG_MS = 24 * 3600 * 1000;
const BASIS_URL = "http://127.0.0.1:3000";

const CONFIG: AbonnementConfig = {
  ingeschakeld: true,
  sleutel: "sk_test_nep",
  webhookGeheim: GEHEIM,
  prijzen: { maand: "price_maand", jaar: "price_jaar", project: "price_project" },
  limieten: { kringen: 5, situatieschemas: 1 },
  boekhoudingInbox: INBOX,
  apiBasis: null,
};

let db: Db;
let auth: Auth;
let server: Server;
let basis: string;
let stripe: NepStripe;

let mails: Mail[] = [];
const verzamelaar: Verzender = {
  async verstuur(mail) {
    mails.push(mail);
  },
};

// --- Hulp ------------------------------------------------------------------------------------

function authHeaders(): Headers {
  return new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" });
}

async function registreer(email: string, bedrijf?: string): Promise<string> {
  await auth.api.signUpEmail({
    body: {
      name: email.split("@")[0]!,
      email,
      password: WACHTWOORD,
      ...(bedrijf !== undefined ? { wachtendeBedrijfsnaam: bedrijf } : {}),
    },
    headers: authHeaders(),
  });
  await new Promise((klaar) => setTimeout(klaar, 0));
  const mail = mails.find((m) => m.aan === email);
  const token = new URL(mail!.tekst.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  await auth.api.verifyEmail({ query: { token }, headers: authHeaders() });
  const [rij] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return rij!.id;
}

async function inloggen(email: string): Promise<string> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: WACHTWOORD },
    headers: authHeaders(),
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function organisatieVan(userId: string): Promise<string> {
  const [rij] = await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, userId));
  return rij!.id;
}

async function post(pad: string, cookie: string, json?: unknown): Promise<Response> {
  const headers = new Headers({ cookie });
  if (json !== undefined) headers.set("content-type", "application/json");
  return fetch(`${basis}${pad}`, {
    method: "POST",
    headers,
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });
}

const vrijgeven = (cookie: string, projectId: string) => post(`/api/projecten/${projectId}/vrijgeven`, cookie);
const synchroniseer = (cookie: string, projectId: string, sessie: string) =>
  post(`/api/projecten/${projectId}/vrijgave/synchroniseer`, cookie, { sessie });

async function code(antwoord: Response): Promise<string | undefined> {
  return ((await antwoord.json()) as { data?: { code?: string } }).data?.code;
}

let teller = 0;

/** Levert een getekend Stripe-event aan de webhook en geeft de statuscode. */
async function lever(type: string, object: Record<string, unknown>): Promise<number> {
  const body = JSON.stringify({ id: `evt_pa_${++teller}`, object: "event", type, data: { object } });
  const antwoord = await fetch(`${basis}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload: body, secret: GEHEIM }),
    },
    body,
  });
  await antwoord.arrayBuffer();
  return antwoord.status;
}

/** Het checkout.session-object zoals Stripe het in een webhook stuurt, uit de nep-Stripe. */
function sessieObject(id: string): Record<string, unknown> {
  const c = stripe.checkouts.get(id)!;
  return {
    id,
    object: "checkout.session",
    customer: c.klantId,
    subscription: null,
    payment_status: c.betaalstatus,
    metadata: c.metadata,
  };
}

const aanroepen = (methode: string) => stripe.aanroepen.filter((a) => a.methode === methode);

async function aankopen(projectId: string) {
  return db.select().from(projectaankopen).where(eq(projectaankopen.projectId, projectId));
}

async function gekochtOp(projectId: string): Promise<Date | null> {
  const [rij] = await db.select({ gekochtOp: projecten.gekochtOp }).from(projecten).where(eq(projecten.id, projectId));
  return rij!.gekochtOp;
}

async function nieuwProject(organisatieId: string): Promise<string> {
  return (await maakProject(db, organisatieId, { naam: "Woning", klantnaam: "", stroomtype: "3N400V" })).id;
}

/** Start een vrijgave als eigenaar A en geeft de id van de Checkout-sessie. */
async function start(projectId: string): Promise<string> {
  const antwoord = await vrijgeven(eigenaarA.cookie, projectId);
  expect(antwoord.status).toBe(200);
  await antwoord.arrayBuffer();
  return [...stripe.checkouts.keys()].at(-1)!;
}

// --- Opzet -----------------------------------------------------------------------------------

let eigenaarA: { cookie: string; organisatieId: string };
let eigenaarB: { cookie: string; organisatieId: string };
let lidA: { cookie: string };
let project: string;

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", BASIS_URL);
  zetVerzender(verzamelaar);
  db = await maakTestDb();
  auth = maakAuth(db);
  zetDb(db);
  zetAuth(auth);

  const app = createApp();
  const router = createRouter();
  for (const route of beveiligdeRoutebestanden().map(routeUit)) {
    const module = (await import(route.bestand)) as { default: EventHandler };
    router.use(route.pad, module.default, route.methode);
  }
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const idA = await registreer("pa-eigenaar-a@voorbeeld.be", "Bedrijf A");
  const idB = await registreer("pa-eigenaar-b@voorbeeld.be", "Bedrijf B");
  const idLid = await registreer("pa-lid-a@voorbeeld.be");
  const orgA = await organisatieVan(idA);
  await db
    .insert(member)
    .values({ id: crypto.randomUUID(), organizationId: orgA, userId: idLid, role: "member", createdAt: new Date() });
  eigenaarA = { cookie: await inloggen("pa-eigenaar-a@voorbeeld.be"), organisatieId: orgA };
  eigenaarB = { cookie: await inloggen("pa-eigenaar-b@voorbeeld.be"), organisatieId: await organisatieVan(idB) };
  lidA = { cookie: await inloggen("pa-lid-a@voorbeeld.be") };
}, 120_000);

beforeEach(async () => {
  stripe = maakNepStripe();
  stripe.prijzen.set("price_maand", { id: "price_maand", bedrag: 1500, munt: "eur", interval: "month" });
  stripe.prijzen.set("price_jaar", { id: "price_jaar", bedrag: 15000, munt: "eur", interval: "year" });
  stripe.prijzen.set("price_project", { id: "price_project", bedrag: 4900, munt: "eur", interval: "eenmalig" });
  zetAbonnementen({ config: CONFIG, stripe });
  mails = [];
  await db.delete(stripeEvents);
  await db.delete(doorgestuurdeFacturen);
  await db.delete(projectaankopen);
  await db.delete(abonnementen);
  // Geen proef, geen onderwijs, geen vrijstelling: beide bedrijven staan op `gratis`.
  await db
    .update(organization)
    .set({ proefEinde: new Date(Date.now() - DAG_MS), onderwijs: false, vrijgesteld: false });
  project = await nieuwProject(eigenaarA.organisatieId);
});

afterEach(() => {
  vi.restoreAllMocks();
  zetAbonnementen(undefined);
});

afterAll(async () => {
  await new Promise((klaar) => server?.close(klaar));
  zetAbonnementen(undefined);
  vi.unstubAllEnvs();
});

// --- Starten ---------------------------------------------------------------------------------

describe("vrijgeven", () => {
  test("eigenaar start vrijgave: checkout in modus payment met metadata", async () => {
    const antwoord = await vrijgeven(eigenaarA.cookie, project);
    expect(antwoord.status).toBe(200);
    const { url } = (await antwoord.json()) as { url: string };
    const [sessie] = [...stripe.checkouts.keys()];
    expect(url).toBe(`https://checkout.nep/${sessie}`);

    // De klant komt er via dezelfde weg als bij het abonnement, met een rij in `abonnementen`.
    expect(aanroepen("maakKlant")).toHaveLength(1);
    const [rij] = await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, eigenaarA.organisatieId));
    expect(rij).toMatchObject({ stripeKlantId: "cus_nep_1", status: null, openCheckoutSessie: null });

    expect(aanroepen("maakCheckout")).toEqual([]);
    expect(aanroepen("maakProjectCheckout").map((a) => a.invoer)).toEqual([
      {
        klantId: "cus_nep_1",
        prijsId: "price_project",
        organisatieId: eigenaarA.organisatieId,
        projectId: project,
        succesUrl: `${BASIS_URL}/projecten/${project}?vrijgave={CHECKOUT_SESSION_ID}`,
        annuleerUrl: `${BASIS_URL}/projecten/${project}`,
        locale: "nl",
      },
    ]);
    expect(stripe.checkouts.get(sessie!)?.metadata).toEqual({
      organisatieId: eigenaarA.organisatieId,
      projectId: project,
      soort: "project",
    });
    expect(await aankopen(project)).toMatchObject([
      { checkoutSessie: sessie, status: "open", organisatieId: eigenaarA.organisatieId, betaaldOp: null },
    ]);
    expect(await gekochtOp(project)).toBeNull();
  });

  test("een bestaande klant wordt hergebruikt", async () => {
    await db.insert(abonnementen).values({ organisatieId: eigenaarA.organisatieId, stripeKlantId: "cus_bestaand" });
    await start(project);
    expect(aanroepen("maakKlant")).toEqual([]);
    expect(aanroepen("maakProjectCheckout")[0]!.invoer).toMatchObject({ klantId: "cus_bestaand" });
  });

  test("lid krijgt 403", async () => {
    const antwoord = await vrijgeven(lidA.cookie, project);
    expect(antwoord.status).toBe(403);
    expect(stripe.aanroepen).toEqual([]);
    expect(await aankopen(project)).toEqual([]);
  });

  test("een andere organisatie krijgt 404", async () => {
    expect((await vrijgeven(eigenaarB.cookie, project)).status).toBe(404);
    expect(stripe.aanroepen).toEqual([]);
  });

  test("al gekocht: 409 PROJECT_AL_GEKOCHT", async () => {
    await db.update(projecten).set({ gekochtOp: new Date() }).where(eq(projecten.id, project));
    const antwoord = await vrijgeven(eigenaarA.cookie, project);
    expect(antwoord.status).toBe(409);
    expect(await code(antwoord)).toBe("PROJECT_AL_GEKOCHT");
    expect(stripe.aanroepen).toEqual([]);
  });

  test("al gekocht gaat voor niet nodig: ook tijdens een abonnement 409 PROJECT_AL_GEKOCHT", async () => {
    await db.update(projecten).set({ gekochtOp: new Date() }).where(eq(projecten.id, project));
    await db
      .insert(abonnementen)
      .values({ organisatieId: eigenaarA.organisatieId, stripeKlantId: "cus_a", status: "active", formule: "maand" });
    expect(await code(await vrijgeven(eigenaarA.cookie, project))).toBe("PROJECT_AL_GEKOCHT");
  });

  test("tijdens abonnement: 409 VRIJGEVEN_NIET_NODIG", async () => {
    await db
      .insert(abonnementen)
      .values({ organisatieId: eigenaarA.organisatieId, stripeKlantId: "cus_a", status: "active", formule: "maand" });
    const antwoord = await vrijgeven(eigenaarA.cookie, project);
    expect(antwoord.status).toBe(409);
    expect(await code(antwoord)).toBe("VRIJGEVEN_NIET_NODIG");
    expect(stripe.aanroepen).toEqual([]);
  });

  test("tijdens de overgangsproef: 409 VRIJGEVEN_NIET_NODIG", async () => {
    await db
      .update(organization)
      .set({ proefEinde: new Date(Date.now() + 5 * DAG_MS) })
      .where(eq(organization.id, eigenaarA.organisatieId));
    expect(await code(await vrijgeven(eigenaarA.cookie, project))).toBe("VRIJGEVEN_NIET_NODIG");
  });

  test("onderwijs: 409 VRIJGEVEN_NIET_NODIG", async () => {
    await db.update(organization).set({ onderwijs: true }).where(eq(organization.id, eigenaarA.organisatieId));
    const antwoord = await vrijgeven(eigenaarA.cookie, project);
    expect(antwoord.status).toBe(409);
    expect(await code(antwoord)).toBe("VRIJGEVEN_NIET_NODIG");
    expect(stripe.aanroepen).toEqual([]);
  });

  test("vrijgesteld: 409 VRIJGEVEN_NIET_NODIG", async () => {
    await db.update(organization).set({ vrijgesteld: true }).where(eq(organization.id, eigenaarA.organisatieId));
    expect(await code(await vrijgeven(eigenaarA.cookie, project))).toBe("VRIJGEVEN_NIET_NODIG");
  });

  test("zonder projectprijs: 409 VRIJGEVEN_NIET_NODIG", async () => {
    zetAbonnementen({
      config: { ...CONFIG, prijzen: { ...CONFIG.prijzen, project: null } } as AbonnementConfig,
      stripe,
    });
    expect(await code(await vrijgeven(eigenaarA.cookie, project))).toBe("VRIJGEVEN_NIET_NODIG");
    expect(stripe.aanroepen).toEqual([]);
  });

  test("abonnementen uit: 409 VRIJGEVEN_NIET_NODIG", async () => {
    zetAbonnementen({ config: { ingeschakeld: false, limieten: { kringen: 5, situatieschemas: 1 } }, stripe: null });
    expect(await code(await vrijgeven(eigenaarA.cookie, project))).toBe("VRIJGEVEN_NIET_NODIG");
  });

  test("tweede start laat de eerste sessie vervallen", async () => {
    const eerste = await start(project);
    const tweede = await start(project);
    expect(tweede).not.toBe(eerste);
    expect([...stripe.vervallen]).toEqual([eerste]);
    expect(aanroepen("maakKlant")).toHaveLength(1);
    const lijst = await aankopen(project);
    expect(lijst.map((a) => [a.checkoutSessie, a.status]).sort()).toEqual([
      [eerste, "vervallen"],
      [tweede, "open"],
    ]);
  });

  test("twee gelijktijdige starts geven één klant en hoogstens één open aankoop", async () => {
    const statussen = await Promise.all([vrijgeven(eigenaarA.cookie, project), vrijgeven(eigenaarA.cookie, project)]);
    expect(statussen.map((s) => s.status)).toEqual([200, 200]);
    expect(aanroepen("maakKlant")).toHaveLength(1);
    expect((await aankopen(project)).filter((a) => a.status === "open")).toHaveLength(1);
  });

  test("een vorige sessie die al betaald is: geen nieuwe sessie, het project wordt gekocht", async () => {
    const eerste = await start(project);
    stripe.betaalCheckout(eerste);
    const antwoord = await vrijgeven(eigenaarA.cookie, project);
    expect(antwoord.status).toBe(409);
    expect(await code(antwoord)).toBe("PROJECT_AL_GEKOCHT");
    expect(aanroepen("maakProjectCheckout")).toHaveLength(1);
    expect(stripe.vervallen.size).toBe(0);
    expect(await gekochtOp(project)).not.toBeNull();
    expect(await aankopen(project)).toMatchObject([{ checkoutSessie: eerste, status: "betaald" }]);
  });
});

// --- Uitgestelde betaling ---------------------------------------------------------------------

describe("een uitgestelde betaling die loopt", () => {
  test("complete+unpaid en een tweede start: 409 VRIJGAVE_LOOPT, geen tweede Checkout; daarna async_payment_succeeded koopt het project", async () => {
    const sessie = await start(project);
    stripe.voltooiCheckoutZonderBetaling(sessie);
    expect(await lever("checkout.session.completed", sessieObject(sessie))).toBe(200);

    const antwoord = await vrijgeven(eigenaarA.cookie, project);
    expect(antwoord.status).toBe(409);
    expect(await code(antwoord)).toBe(VRIJGAVE_LOOPT);
    expect(aanroepen("maakProjectCheckout")).toHaveLength(1);
    expect(aanroepen("laatCheckoutVervallen")).toEqual([]);
    expect(await aankopen(project)).toMatchObject([{ checkoutSessie: sessie, status: "open" }]);
    expect(await gekochtOp(project)).toBeNull();

    stripe.betaalCheckout(sessie);
    expect(await lever("checkout.session.async_payment_succeeded", sessieObject(sessie))).toBe(200);
    expect(await gekochtOp(project)).not.toBeNull();
    expect(await aankopen(project)).toMatchObject([{ checkoutSessie: sessie, status: "betaald" }]);
  });

  test("een sessie die net tijdens het vervallen voltooid wordt: 409 VRIJGAVE_LOOPT, geen tweede Checkout", async () => {
    const sessie = await start(project);
    // Stripe weigert het vervallen van een sessie die de klant net voltooide (de poort negeert die 400).
    stripe.laatCheckoutVervallen = async (id) => {
      stripe.aanroepen.push({ methode: "laatCheckoutVervallen", invoer: id });
      stripe.voltooiCheckoutZonderBetaling(id);
    };
    expect(await code(await vrijgeven(eigenaarA.cookie, project))).toBe(VRIJGAVE_LOOPT);
    expect(aanroepen("maakProjectCheckout")).toHaveLength(1);
    expect(await aankopen(project)).toMatchObject([{ checkoutSessie: sessie, status: "open" }]);
  });

  test("een vorige sessie die al vervallen is: rij vervallen, zonder expire, en een nieuwe sessie", async () => {
    const eerste = await start(project);
    stripe.checkouts.get(eerste)!.status = "expired";
    const tweede = await start(project);
    expect(tweede).not.toBe(eerste);
    expect(aanroepen("laatCheckoutVervallen")).toEqual([]);
    const lijst = await aankopen(project);
    expect(lijst.map((a) => [a.checkoutSessie, a.status]).sort()).toEqual([
      [eerste, "vervallen"],
      [tweede, "open"],
    ]);
  });
});

// --- Webhook ---------------------------------------------------------------------------------

describe("webhook", () => {
  test("webhook completed+paid zet gekocht_op", async () => {
    const sessie = await start(project);
    stripe.betaalCheckout(sessie);
    expect(await lever("checkout.session.completed", sessieObject(sessie))).toBe(200);
    expect(await gekochtOp(project)).not.toBeNull();
    const [aankoop] = await aankopen(project);
    expect(aankoop).toMatchObject({ status: "betaald" });
    expect(aankoop!.betaaldOp).not.toBeNull();
  });

  test("webhook completed+unpaid zet niets, async_payment_succeeded daarna wel", async () => {
    const sessie = await start(project);
    expect(await lever("checkout.session.completed", sessieObject(sessie))).toBe(200);
    expect(await gekochtOp(project)).toBeNull();
    expect(await aankopen(project)).toMatchObject([{ status: "open", betaaldOp: null }]);

    stripe.betaalCheckout(sessie);
    expect(await lever("checkout.session.async_payment_succeeded", sessieObject(sessie))).toBe(200);
    expect(await gekochtOp(project)).not.toBeNull();
    expect(await aankopen(project)).toMatchObject([{ status: "betaald" }]);
  });

  test("async_payment_failed zet de aankoop op mislukt, expired op vervallen", async () => {
    const eerste = await start(project);
    expect(await lever("checkout.session.async_payment_failed", sessieObject(eerste))).toBe(200);
    expect(await aankopen(project)).toMatchObject([{ checkoutSessie: eerste, status: "mislukt" }]);

    const tweede = await start(project);
    expect(await lever("checkout.session.expired", sessieObject(tweede))).toBe(200);
    expect((await aankopen(project)).find((a) => a.checkoutSessie === tweede)).toMatchObject({ status: "vervallen" });
    expect(await gekochtOp(project)).toBeNull();
    // Geen abonnement om te beeindigen: de mislukte projectbetaling raakt het abonnement niet.
    expect(aanroepen("beeindigAbonnement")).toEqual([]);
  });

  test("een betaling na vervallen telt toch: betaald wint altijd", async () => {
    const sessie = await start(project);
    expect(await lever("checkout.session.expired", sessieObject(sessie))).toBe(200);
    stripe.betaalCheckout(sessie);
    expect(await lever("checkout.session.async_payment_succeeded", sessieObject(sessie))).toBe(200);
    expect(await gekochtOp(project)).not.toBeNull();
    expect(await aankopen(project)).toMatchObject([{ status: "betaald" }]);
  });

  test("een betaalde sessie zet een mislukt of vervallen niet terug", async () => {
    const sessie = await start(project);
    stripe.betaalCheckout(sessie);
    expect(await lever("checkout.session.completed", sessieObject(sessie))).toBe(200);
    expect(await lever("checkout.session.expired", sessieObject(sessie))).toBe(200);
    expect(await lever("checkout.session.async_payment_failed", sessieObject(sessie))).toBe(200);
    expect(await aankopen(project)).toMatchObject([{ status: "betaald" }]);
  });

  test("metadata met een project van een andere organisatie: er gebeurt niets", async () => {
    const sessie = await start(project);
    stripe.betaalCheckout(sessie);
    const projectB = await nieuwProject(eigenaarB.organisatieId);
    const object = { ...sessieObject(sessie), id: "cs_vreemd", metadata: { organisatieId: eigenaarA.organisatieId, projectId: projectB, soort: "project" } };
    expect(await lever("checkout.session.completed", object)).toBe(200);
    expect(await gekochtOp(projectB)).toBeNull();
    expect(await aankopen(projectB)).toEqual([]);
  });
});

// --- Synchroniseren --------------------------------------------------------------------------

describe("synchroniseer", () => {
  test("synchroniseer vóór webhook en webhook erna: één keer gekocht_op, aankoop betaald", async () => {
    const sessie = await start(project);
    stripe.betaalCheckout(sessie);
    const antwoord = await synchroniseer(eigenaarA.cookie, project, sessie);
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ gekocht: true });
    const eerst = await gekochtOp(project);
    expect(eerst).not.toBeNull();

    expect(await lever("checkout.session.completed", sessieObject(sessie))).toBe(200);
    expect(await gekochtOp(project)).toEqual(eerst);
    const lijst = await aankopen(project);
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatchObject({ status: "betaald" });
  });

  test("webhook vóór synchroniseer: één keer gekocht_op, aankoop betaald", async () => {
    const sessie = await start(project);
    stripe.betaalCheckout(sessie);
    expect(await lever("checkout.session.completed", sessieObject(sessie))).toBe(200);
    const eerst = await gekochtOp(project);
    const antwoord = await synchroniseer(eigenaarA.cookie, project, sessie);
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ gekocht: true });
    expect(await gekochtOp(project)).toEqual(eerst);
    expect(await aankopen(project)).toMatchObject([{ status: "betaald" }]);
  });

  test("een sessie die nog niet betaald is: niets gekocht", async () => {
    const sessie = await start(project);
    const antwoord = await synchroniseer(eigenaarA.cookie, project, sessie);
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ gekocht: false });
    expect(await gekochtOp(project)).toBeNull();
    expect(await aankopen(project)).toMatchObject([{ status: "open" }]);
  });

  test("synchroniseer met sessie van ander project: 404", async () => {
    const sessie = await start(project);
    stripe.betaalCheckout(sessie);
    const ander = await nieuwProject(eigenaarA.organisatieId);
    const antwoord = await synchroniseer(eigenaarA.cookie, ander, sessie);
    expect(antwoord.status).toBe(404);
    expect(await code(antwoord)).toBe("NIET_GEVONDEN");
    expect(await gekochtOp(ander)).toBeNull();
    expect(await gekochtOp(project)).toBeNull();
  });

  test("een sessie van een andere organisatie of een onbekende sessie: 404", async () => {
    const sessie = await start(project);
    stripe.betaalCheckout(sessie);
    const projectB = await nieuwProject(eigenaarB.organisatieId);
    expect((await synchroniseer(eigenaarB.cookie, projectB, sessie)).status).toBe(404);
    expect((await synchroniseer(eigenaarA.cookie, project, "cs_onbekend")).status).toBe(404);
    // Een abonnementssessie van dezelfde klant is geen projectsessie.
    stripe.checkouts.set("cs_abonnement", {
      id: "cs_abonnement",
      klantId: "cus_nep_1",
      abonnementId: "sub_1",
      metadata: { organisatieId: eigenaarA.organisatieId },
      betaalstatus: "paid",
      status: "complete",
    });
    expect((await synchroniseer(eigenaarA.cookie, project, "cs_abonnement")).status).toBe(404);
    expect(await gekochtOp(project)).toBeNull();
    expect(await gekochtOp(projectB)).toBeNull();
  });

  test("lid krijgt 403", async () => {
    const sessie = await start(project);
    stripe.betaalCheckout(sessie);
    expect((await synchroniseer(lidA.cookie, project, sessie)).status).toBe(403);
    expect(await gekochtOp(project)).toBeNull();
  });
});

// --- Boekhouding -----------------------------------------------------------------------------

describe("boekhouding", () => {
  test("invoice.paid van een projectaankoop gaat naar de boekhouding", async () => {
    const sessie = await start(project);
    const klantId = stripe.checkouts.get(sessie)!.klantId!;
    // Een eenmalige factuur (invoice_creation): geen abonnement.
    stripe.facturen.set("in_project", {
      id: "in_project",
      nummer: "ELK-0042",
      klantId,
      abonnementId: null,
      bedragBetaald: 5929,
      pdfUrl: "https://stripe.nep/in_project.pdf",
      reden: "manual",
    });
    const factuur = {
      id: "in_project",
      object: "invoice",
      customer: klantId,
      billing_reason: "manual",
      amount_paid: 5929,
      parent: null,
    };
    expect(await lever("invoice.paid", factuur)).toBe(200);
    expect(await lever("invoice.paid", factuur)).toBe(200);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ aan: INBOX, onderwerp: "Stripe-factuur ELK-0042" });
    expect(mails[0]!.tekst).toContain("59,29");
    expect(mails[0]!.tekst).not.toContain("abonnement");
    expect(mails[0]!.bijlagen).toHaveLength(1);
    expect(await db.select().from(doorgestuurdeFacturen)).toMatchObject([{ stripeFactuurId: "in_project" }]);
  });
});

// --- Prijs -----------------------------------------------------------------------------------

describe("prijs", () => {
  test("GET /api/abonnement geeft de projectprijs mee, eenmalig", async () => {
    const antwoord = await fetch(`${basis}/api/abonnement`, { headers: { cookie: lidA.cookie } });
    expect(antwoord.status).toBe(200);
    const overzicht = (await antwoord.json()) as AbonnementOverzicht;
    expect(overzicht.prijzen).toEqual({
      maand: { bedrag: 1500, munt: "eur", interval: "month" },
      jaar: { bedrag: 15000, munt: "eur", interval: "year" },
      project: { bedrag: 4900, munt: "eur", interval: "eenmalig" },
    });
    // Dezelfde cache: een tweede overzicht haalt geen prijzen meer op.
    await (await fetch(`${basis}/api/abonnement`, { headers: { cookie: lidA.cookie } })).arrayBuffer();
    expect(aanroepen("haalPrijs").map((a) => a.invoer).sort()).toEqual(["price_jaar", "price_maand", "price_project"]);
  });

  test("een projectprijs die Stripe niet geeft: project null, de abonnementsprijzen blijven", async () => {
    stripe.prijzen.delete("price_project");
    const antwoord = await fetch(`${basis}/api/abonnement`, { headers: { cookie: lidA.cookie } });
    const overzicht = (await antwoord.json()) as AbonnementOverzicht;
    expect(overzicht.prijzen?.project).toBeNull();
    expect(overzicht.prijzen?.maand.bedrag).toBe(1500);
  });
});
