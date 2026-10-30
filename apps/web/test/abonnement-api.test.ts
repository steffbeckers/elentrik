// De abonnement-API: overzicht, Checkout, klantenportaal en synchronisatie. De routebestanden
// draaien in een echte h3-app op 127.0.0.1 met Better Auth en de database op PGlite (zoals
// test/abonnement-handhaving.test.ts); Stripe is de nep-poort.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type Auth, maakAuth, zetAuth } from "../server/auth";
import { maakOverzicht, PRIJS_CACHE_MS, TRIAL_MARGE_UUR } from "../server/abonnementen/beheer";
import { type AbonnementConfig, zetAbonnementen } from "../server/abonnementen/config";
import { type Db, zetDb } from "../server/db";
import { abonnementen, member, organization, user } from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import type { AbonnementOverzicht, AbonnementStatus } from "../shared/abonnement";
import { maakTestDb } from "./db";
import Stripe from "stripe";
import { maakNepStripe, type NepStripe } from "./nep-stripe";
import { beveiligdeRoutebestanden, routeUit } from "./routes";

const WACHTWOORD = "lang-genoeg-1";
const UUR_MS = 3600 * 1000;
const DAG_MS = 24 * UUR_MS;

const INGESCHAKELD: AbonnementConfig = {
  ingeschakeld: true,
  sleutel: "sk_test_nep",
  webhookGeheim: null,
  prijzen: { maand: "price_maand", jaar: "price_jaar" },
  boekhoudingInbox: null,
  apiBasis: null,
};

let db: Db;
let auth: Auth;
let server: Server;
let basis: string;
let stripe: NepStripe;

const mails: Mail[] = [];
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

type Verzoek = { methode: string; pad: string; json?: unknown };

async function stuur(verzoek: Verzoek, cookie: string): Promise<Response> {
  const headers = new Headers({ cookie });
  let body: BodyInit | undefined;
  if (verzoek.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(verzoek.json);
  }
  return fetch(`${basis}${verzoek.pad}`, { method: verzoek.methode, headers, ...(body !== undefined ? { body } : {}) });
}

type Fout = { data?: { code?: string } };

const checkout = (cookie: string, formule: "maand" | "jaar" = "maand") =>
  stuur({ methode: "POST", pad: "/api/abonnement/checkout", json: { formule } }, cookie);
const portaal = (cookie: string) => stuur({ methode: "POST", pad: "/api/abonnement/portaal" }, cookie);
const synchroniseer = (cookie: string, sessie: string) =>
  stuur({ methode: "POST", pad: "/api/abonnement/synchroniseer", json: { sessie } }, cookie);
const overzicht = (cookie: string) => stuur({ methode: "GET", pad: "/api/abonnement" }, cookie);

async function zetProefEinde(organisatieId: string, einde: Date) {
  await db.update(organization).set({ proefEinde: einde }).where(eq(organization.id, organisatieId));
}

function aanroepen(methode: string) {
  return stripe.aanroepen.filter((a) => a.methode === methode);
}

// --- Opzet -----------------------------------------------------------------------------------

let eigenaarA: { id: string; cookie: string; email: string; organisatieId: string };
let eigenaarB: { id: string; cookie: string; organisatieId: string };
let lidA: { cookie: string };

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
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

  const emailA = "eigenaar-a@voorbeeld.be";
  const idA = await registreer(emailA, "Bedrijf A");
  const idB = await registreer("eigenaar-b@voorbeeld.be", "Bedrijf B");
  const idLid = await registreer("lid-a@voorbeeld.be");
  const orgA = await organisatieVan(idA);
  await db
    .insert(member)
    .values({ id: crypto.randomUUID(), organizationId: orgA, userId: idLid, role: "member", createdAt: new Date() });
  eigenaarA = { id: idA, cookie: await inloggen(emailA), email: emailA, organisatieId: orgA };
  eigenaarB = {
    id: idB,
    cookie: await inloggen("eigenaar-b@voorbeeld.be"),
    organisatieId: await organisatieVan(idB),
  };
  lidA = { cookie: await inloggen("lid-a@voorbeeld.be") };
}, 120_000);

beforeEach(async () => {
  stripe = maakNepStripe();
  stripe.prijzen.set("price_maand", { id: "price_maand", bedrag: 1500, munt: "eur", interval: "month" });
  stripe.prijzen.set("price_jaar", { id: "price_jaar", bedrag: 15000, munt: "eur", interval: "year" });
  zetAbonnementen({ config: INGESCHAKELD, stripe });
  await db.delete(abonnementen);
  for (const org of [eigenaarA.organisatieId, eigenaarB.organisatieId]) {
    await zetProefEinde(org, new Date(Date.now() + 20 * DAG_MS));
  }
});

afterEach(() => {
  zetAbonnementen(undefined);
});

afterAll(async () => {
  await new Promise((klaar) => server?.close(klaar));
  zetAbonnementen(undefined);
  vi.unstubAllEnvs();
});

// --- Rollen ----------------------------------------------------------------------------------

describe("rollen", () => {
  test("checkout, portaal en synchroniseer geven 403 voor een lid", async () => {
    await db.insert(abonnementen).values({ organisatieId: eigenaarA.organisatieId, stripeKlantId: "cus_a" });
    expect((await checkout(lidA.cookie)).status).toBe(403);
    expect((await portaal(lidA.cookie)).status).toBe(403);
    expect((await synchroniseer(lidA.cookie, "cs_x")).status).toBe(403);
    expect(stripe.aanroepen).toEqual([]);
  });

  test("een andere organisatie ziet nooit de klant van A; synchroniseer met A's sessie als B geeft 404", async () => {
    expect((await checkout(eigenaarA.cookie)).status).toBe(200);
    const sessie = [...stripe.checkouts.keys()][0]!;
    const klantA = stripe.checkouts.get(sessie)!.klantId!;

    // B heeft geen klant: het portaal geeft 409, nooit het portaal van A.
    const metB = await portaal(eigenaarB.cookie);
    expect(metB.status).toBe(409);
    expect(((await metB.json()) as Fout).data?.code).toBe("GEEN_KLANT");
    expect(aanroepen("maakPortaal")).toEqual([]);

    // B met A's sessie: 404, ook als B een eigen klant heeft.
    expect((await synchroniseer(eigenaarB.cookie, sessie)).status).toBe(404);
    expect((await checkout(eigenaarB.cookie)).status).toBe(200);
    expect((await synchroniseer(eigenaarB.cookie, sessie)).status).toBe(404);
    expect(aanroepen("abonnementenVanKlant")).toEqual([]);

    const [rijB] = await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, eigenaarB.organisatieId));
    expect(rijB?.stripeKlantId).not.toBe(klantA);
  });

  test("een onbekende sessie geeft 404", async () => {
    await db.insert(abonnementen).values({ organisatieId: eigenaarA.organisatieId, stripeKlantId: "cus_a" });
    expect((await synchroniseer(eigenaarA.cookie, "cs_bestaat_niet")).status).toBe(404);
  });

  test("een ongeldige body geeft 400", async () => {
    expect((await stuur({ methode: "POST", pad: "/api/abonnement/checkout", json: { formule: "week" } }, eigenaarA.cookie)).status).toBe(400);
    expect((await stuur({ methode: "POST", pad: "/api/abonnement/synchroniseer", json: {} }, eigenaarA.cookie)).status).toBe(400);
    expect(stripe.aanroepen).toEqual([]);
  });
});

// --- Checkout --------------------------------------------------------------------------------

describe("checkout", () => {
  const BLOKKEREND: AbonnementStatus[] = ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"];
  const VRIJ: AbonnementStatus[] = ["canceled", "incomplete_expired"];

  test.each(BLOKKEREND)("status %s geeft 409 ABONNEMENT_BESTAAT en maakt niets", async (status) => {
    await db
      .insert(abonnementen)
      .values({ organisatieId: eigenaarA.organisatieId, stripeKlantId: "cus_a", stripeAbonnementId: "sub_a", status });
    const antwoord = await checkout(eigenaarA.cookie);
    expect(antwoord.status).toBe(409);
    expect(((await antwoord.json()) as Fout).data?.code).toBe("ABONNEMENT_BESTAAT");
    expect(aanroepen("maakCheckout")).toEqual([]);
    expect(aanroepen("maakKlant")).toEqual([]);
  });

  test.each(VRIJ)("status %s geeft geen 409: een nieuwe sessie voor dezelfde klant", async (status) => {
    await db
      .insert(abonnementen)
      .values({ organisatieId: eigenaarA.organisatieId, stripeKlantId: "cus_a", stripeAbonnementId: "sub_a", status });
    const antwoord = await checkout(eigenaarA.cookie);
    expect(antwoord.status).toBe(200);
    expect(((await antwoord.json()) as { url: string }).url).toMatch(/^https:\/\/checkout\.nep\//);
    expect(aanroepen("maakKlant")).toEqual([]);
    expect(aanroepen("maakCheckout")).toHaveLength(1);
    expect((aanroepen("maakCheckout")[0]!.invoer as { klantId: string }).klantId).toBe("cus_a");
  });

  describe("locale", () => {
    afterEach(async () => {
      await db.update(user).set({ taal: "nl" }).where(eq(user.id, eigenaarA.id));
    });

    test("zonder gekozen taal is de locale nl", async () => {
      expect((await checkout(eigenaarA.cookie)).status).toBe(200);
      expect((aanroepen("maakCheckout")[0]!.invoer as { locale: string }).locale).toBe("nl");
    });

    test.each(["fr", "en"] as const)("een %s-eigenaar geeft locale %s door aan Stripe", async (taal) => {
      await db.update(user).set({ taal }).where(eq(user.id, eigenaarA.id));
      expect((await checkout(eigenaarA.cookie)).status).toBe(200);
      expect((aanroepen("maakCheckout")[0]!.invoer as { locale: string }).locale).toBe(taal);
    });
  });

  test("een onbekende status in de database blokkeert niet", async () => {
    await db
      .insert(abonnementen)
      .values({ organisatieId: eigenaarA.organisatieId, stripeKlantId: "cus_a", status: "rommel" });
    expect((await checkout(eigenaarA.cookie)).status).toBe(200);
  });

  test("de klant krijgt de organisatienaam en het e-mailadres van de eigenaar die klikt", async () => {
    expect((await checkout(eigenaarA.cookie)).status).toBe(200);
    const [maak] = aanroepen("maakKlant");
    expect(maak!.invoer).toEqual({
      organisatieId: eigenaarA.organisatieId,
      email: eigenaarA.email,
      naam: "Bedrijf A",
    });
    const [rij] = await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, eigenaarA.organisatieId));
    expect(rij?.stripeKlantId).toBe("cus_nep_1");
    expect(rij?.openCheckoutSessie).toBe("cs_nep_1");
  });

  test("zonder klantrij maar met een bestaande Stripe-klant: die klant wordt hergebruikt en bewaard", async () => {
    // Een eerdere Checkout liet de klant in Stripe achter, maar de transactie rolde de rij terug.
    stripe.klanten.set(eigenaarA.organisatieId, "cus_bestaand");
    expect((await checkout(eigenaarA.cookie)).status).toBe(200);
    expect(aanroepen("zoekKlant").map((a) => a.invoer)).toEqual([eigenaarA.organisatieId]);
    expect(aanroepen("maakKlant")).toEqual([]);
    expect((aanroepen("maakCheckout")[0]!.invoer as { klantId: string }).klantId).toBe("cus_bestaand");
    const [rij] = await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, eigenaarA.organisatieId));
    expect(rij?.stripeKlantId).toBe("cus_bestaand");
  });

  test("een bedrijf via 'Nieuw bedrijf' (Better Auth, geen uuid) kan afrekenen", async () => {
    const tweede = await auth.api.createOrganization({
      body: { name: "Via Better Auth", slug: `via-ba-${Date.now()}` },
      headers: new Headers({ ...Object.fromEntries(authHeaders()), cookie: eigenaarA.cookie }),
    });
    expect(tweede!.id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    await zetProefEinde(tweede!.id, new Date(Date.now() + 20 * DAG_MS));
    const wissel = await stuur(
      { methode: "POST", pad: "/api/organisaties/actief", json: { organisatieId: tweede!.id } },
      eigenaarA.cookie,
    );
    expect(wissel.status).toBe(200);
    try {
      expect((await checkout(eigenaarA.cookie)).status).toBe(200);
      expect(aanroepen("zoekKlant").map((a) => a.invoer)).toEqual([tweede!.id]);
      expect(aanroepen("maakKlant")).toHaveLength(1);
    } finally {
      await stuur(
        { methode: "POST", pad: "/api/organisaties/actief", json: { organisatieId: eigenaarA.organisatieId } },
        eigenaarA.cookie,
      );
    }
  });

  test("maakKlant met een bekende idempotency key en andere gegevens: nog één keer zoeken en die klant hergebruiken", async () => {
    stripe.idempotentieFout = new Stripe.errors.StripeIdempotencyError({
      type: "idempotency_error",
      message: "Keys for idempotent requests can only be used with the same parameters",
    });
    // De eerste zoekopdracht mist (eventually consistent); de tweede, na de idempotentiefout, vindt de klant.
    const echt = stripe.zoekKlant.bind(stripe);
    let keer = 0;
    stripe.zoekKlant = async (id) => {
      keer++;
      if (keer === 1) {
        stripe.aanroepen.push({ methode: "zoekKlant", invoer: id });
        return null;
      }
      stripe.klanten.set(id, "cus_na_idempotentie");
      return echt(id);
    };
    expect((await checkout(eigenaarA.cookie)).status).toBe(200);
    expect(aanroepen("zoekKlant")).toHaveLength(2);
    expect((aanroepen("maakCheckout")[0]!.invoer as { klantId: string }).klantId).toBe("cus_na_idempotentie");
  });

  test("een idempotentiefout zonder bestaande klant wordt doorgegeven (500) en laat geen rij achter", async () => {
    stripe.idempotentieFout = new Stripe.errors.StripeIdempotencyError({ type: "idempotency_error", message: "x" });
    expect((await checkout(eigenaarA.cookie)).status).toBe(500);
    expect(aanroepen("zoekKlant")).toHaveLength(2);
    expect(await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, eigenaarA.organisatieId))).toEqual([]);
  });

  test("een mislukte Checkout laat geen rij achter; de volgende poging zoekt de klant weer op", async () => {
    stripe.faalCheckout = true;
    expect((await checkout(eigenaarA.cookie)).status).toBe(500);
    expect(await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, eigenaarA.organisatieId))).toEqual([]);
    // Stripe heeft de klant wel gemaakt (maakKlant liep voor de fout).
    stripe.klanten.set(eigenaarA.organisatieId, "cus_nep_1");
    stripe.faalCheckout = false;
    expect((await checkout(eigenaarA.cookie)).status).toBe(200);
    expect(aanroepen("maakKlant")).toHaveLength(1);
    expect((aanroepen("maakCheckout").at(-1)!.invoer as { klantId: string }).klantId).toBe("cus_nep_1");
  });

  test("twee gelijktijdige checkouts geven één klant en hoogstens één open sessie", async () => {
    const [een, twee] = await Promise.all([checkout(eigenaarA.cookie), checkout(eigenaarA.cookie)]);
    expect([een.status, twee.status]).toEqual([200, 200]);
    expect(aanroepen("maakKlant")).toHaveLength(1);
    expect(aanroepen("maakCheckout")).toHaveLength(2);
    // De tweede laat de eerste vervallen; er blijft precies één open sessie in de rij over.
    expect(aanroepen("laatCheckoutVervallen")).toHaveLength(1);
    const rijen = await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, eigenaarA.organisatieId));
    expect(rijen).toHaveLength(1);
    expect(stripe.vervallen.has(rijen[0]!.openCheckoutSessie!)).toBe(false);
    expect(stripe.vervallen.size).toBe(1);
  });

  test("een tweede checkout laat de eerste sessie vervallen", async () => {
    await checkout(eigenaarA.cookie);
    expect(aanroepen("laatCheckoutVervallen")).toEqual([]);
    await checkout(eigenaarA.cookie, "jaar");
    expect(aanroepen("laatCheckoutVervallen").map((a) => a.invoer)).toEqual(["cs_nep_1"]);
    const [rij] = await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, eigenaarA.organisatieId));
    expect(rij?.openCheckoutSessie).toBe("cs_nep_2");
  });

  test("een voltooide vorige sessie: synchroniseren en 409, zonder tweede sessie", async () => {
    // De eigenaar rondt Checkout af, maar de rij loopt nog achter (geen webhook, geen synchroniseer).
    expect((await checkout(eigenaarA.cookie)).status).toBe(200);
    const klantId = stripe.checkouts.get("cs_nep_1")!.klantId!;
    stripe.checkouts.set("cs_nep_1", { id: "cs_nep_1", klantId, abonnementId: "sub_betaald" });
    stripe.abonnementen.set(klantId, [
      {
        id: "sub_betaald",
        klantId,
        status: "active",
        prijsId: "price_maand",
        periodeEinde: new Date(Date.now() + 30 * DAG_MS),
        opgezegdOpPeriodeEinde: false,
        aangemaakt: new Date(),
      },
    ]);
    const [voor] = await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, eigenaarA.organisatieId));
    expect(voor?.status).toBeNull();

    const antwoord = await checkout(eigenaarA.cookie);
    expect(antwoord.status).toBe(409);
    expect(((await antwoord.json()) as Fout).data?.code).toBe("ABONNEMENT_BESTAAT");
    expect(aanroepen("maakCheckout")).toHaveLength(1);
    expect(aanroepen("laatCheckoutVervallen")).toEqual([]);
    // De synchronisatie blijft bewaard, ook al antwoordde het verzoek met een fout.
    const [na] = await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, eigenaarA.organisatieId));
    expect(na).toMatchObject({ status: "active", stripeAbonnementId: "sub_betaald", formule: "maand" });
  });

  test("een vorige sessie zonder abonnement: vervallen en een nieuwe sessie", async () => {
    await checkout(eigenaarA.cookie);
    expect(stripe.checkouts.get("cs_nep_1")!.abonnementId).toBeNull();
    expect((await checkout(eigenaarA.cookie)).status).toBe(200);
    expect(aanroepen("abonnementenVanKlant")).toEqual([]);
    expect(aanroepen("laatCheckoutVervallen").map((a) => a.invoer)).toEqual(["cs_nep_1"]);
    expect(aanroepen("maakCheckout")).toHaveLength(2);
  });

  test("een voltooide sessie waarvan het abonnement al beeindigd is, laat een nieuwe checkout toe", async () => {
    await checkout(eigenaarA.cookie);
    const klantId = stripe.checkouts.get("cs_nep_1")!.klantId!;
    stripe.checkouts.set("cs_nep_1", { id: "cs_nep_1", klantId, abonnementId: "sub_oud" });
    stripe.abonnementen.set(klantId, [
      { id: "sub_oud", klantId, status: "canceled", prijsId: "price_maand", periodeEinde: null, opgezegdOpPeriodeEinde: false, aangemaakt: new Date() },
    ]);
    expect((await checkout(eigenaarA.cookie)).status).toBe(200);
    expect(aanroepen("maakCheckout")).toHaveLength(2);
  });

  describe("trial-marge", () => {
    async function trialEindeBij(proefEinde: Date): Promise<Date | null> {
      await zetProefEinde(eigenaarA.organisatieId, proefEinde);
      expect((await checkout(eigenaarA.cookie)).status).toBe(200);
      const invoer = aanroepen("maakCheckout").at(-1)!.invoer as { trialEinde: Date | null };
      return invoer.trialEinde;
    }

    test(`meer dan ${TRIAL_MARGE_UUR} uur proef over: trialEinde is het proefEinde`, async () => {
      const einde = new Date(Date.now() + 49 * UUR_MS);
      const gekregen = await trialEindeBij(einde);
      expect(gekregen?.toISOString()).toBe(einde.toISOString());
    });

    test("minder dan 48 uur proef over: geen trialEinde", async () => {
      expect(await trialEindeBij(new Date(Date.now() + 47 * UUR_MS))).toBeNull();
    });

    test("een verlopen proef: geen trialEinde", async () => {
      expect(await trialEindeBij(new Date(Date.now() - DAG_MS))).toBeNull();
    });
  });

  test("de aanroep volgt de formule, de organisatie en de terug-URL's", async () => {
    await checkout(eigenaarA.cookie, "maand");
    await checkout(eigenaarA.cookie, "jaar");
    const [maand, jaar] = aanroepen("maakCheckout").map(
      (a) => a.invoer as { prijsId: string; organisatieId: string; succesUrl: string; annuleerUrl: string },
    );
    expect(maand!.prijsId).toBe("price_maand");
    expect(jaar!.prijsId).toBe("price_jaar");
    expect(maand!.organisatieId).toBe(eigenaarA.organisatieId);
    expect(maand!.succesUrl.endsWith("/abonnement?terug={CHECKOUT_SESSION_ID}")).toBe(true);
    expect(maand!.annuleerUrl.endsWith("/abonnement")).toBe(true);
    expect(maand!.succesUrl.startsWith("http://127.0.0.1:3000/")).toBe(true);
  });
});

// --- Portaal ---------------------------------------------------------------------------------

describe("portaal", () => {
  test("zonder klant: 409 GEEN_KLANT", async () => {
    const antwoord = await portaal(eigenaarA.cookie);
    expect(antwoord.status).toBe(409);
    expect(((await antwoord.json()) as Fout).data?.code).toBe("GEEN_KLANT");
    expect(aanroepen("maakPortaal")).toEqual([]);
  });

  test("met een klant: een url, en terugUrl is /abonnement", async () => {
    await db.insert(abonnementen).values({ organisatieId: eigenaarA.organisatieId, stripeKlantId: "cus_a" });
    const antwoord = await portaal(eigenaarA.cookie);
    expect(antwoord.status).toBe(200);
    expect(((await antwoord.json()) as { url: string }).url).toBe("https://portaal.nep/cus_a");
    const invoer = aanroepen("maakPortaal")[0]!.invoer as { klantId: string; terugUrl: string };
    expect(invoer.klantId).toBe("cus_a");
    expect(new URL(invoer.terugUrl).pathname).toBe("/abonnement");
  });

  test.each([["nl"], ["fr"], ["en"]] as const)("de locale van het portaal is de taal van de eigenaar (%s)", async (taal) => {
    await db.insert(abonnementen).values({ organisatieId: eigenaarA.organisatieId, stripeKlantId: "cus_a" });
    await db.update(user).set({ taal }).where(eq(user.id, eigenaarA.id));
    try {
      expect((await portaal(eigenaarA.cookie)).status).toBe(200);
    } finally {
      await db.update(user).set({ taal: "nl" }).where(eq(user.id, eigenaarA.id));
    }
    expect((aanroepen("maakPortaal")[0]!.invoer as { locale: string }).locale).toBe(taal);
  });
});

// --- Synchroniseer ---------------------------------------------------------------------------

describe("synchroniseer", () => {
  test("haalt de toestand van Stripe op en geeft het overzicht", async () => {
    expect((await checkout(eigenaarA.cookie, "jaar")).status).toBe(200);
    const sessie = "cs_nep_1";
    const klantId = stripe.checkouts.get(sessie)!.klantId!;
    const periodeEinde = new Date(Date.now() + 365 * DAG_MS);
    stripe.abonnementen.set(klantId, [
      {
        id: "sub_1",
        klantId,
        status: "active",
        prijsId: "price_jaar",
        periodeEinde,
        opgezegdOpPeriodeEinde: true,
        aangemaakt: new Date(),
      },
    ]);

    const antwoord = await synchroniseer(eigenaarA.cookie, sessie);
    expect(antwoord.status).toBe(200);
    const tekst = await antwoord.text();
    expect(tekst).not.toContain("cus_");
    expect(tekst).not.toContain("sub_");
    expect(JSON.parse(tekst)).toMatchObject({
      ingeschakeld: true,
      schrijven: true,
      reden: "actief",
      status: "active",
      formule: "jaar",
      periodeEinde: periodeEinde.toISOString(),
      opgezegd: true,
      heeftKlant: true,
    });

    // Een tweede checkout is nu geblokkeerd.
    expect((await checkout(eigenaarA.cookie)).status).toBe(409);
  });
});

// --- Overzicht -------------------------------------------------------------------------------

describe("GET /api/abonnement", () => {
  test("een lid krijgt hetzelfde overzicht als een eigenaar, met het bedrag in cent en zonder Stripe-id's", async () => {
    await db.insert(abonnementen).values({
      organisatieId: eigenaarA.organisatieId,
      stripeKlantId: "cus_geheim",
      stripeAbonnementId: "sub_geheim",
      status: "trialing",
      formule: "maand",
      periodeEinde: new Date("2027-01-01T00:00:00Z"),
    });
    const metEigenaar = await overzicht(eigenaarA.cookie);
    const metLid = await overzicht(lidA.cookie);
    expect(metEigenaar.status).toBe(200);
    const tekst = await metLid.text();
    expect(tekst).not.toContain("cus_");
    expect(tekst).not.toContain("sub_");
    const lid = JSON.parse(tekst) as AbonnementOverzicht;
    expect(lid).toEqual((await metEigenaar.json()) as AbonnementOverzicht);
    expect(lid).toMatchObject({
      ingeschakeld: true,
      schrijven: true,
      reden: "actief",
      status: "trialing",
      formule: "maand",
      periodeEinde: "2027-01-01T00:00:00.000Z",
      opgezegd: false,
      heeftKlant: true,
    });
    expect(lid.prijzen).toEqual({
      maand: { bedrag: 1500, munt: "eur", interval: "month" },
      jaar: { bedrag: 15000, munt: "eur", interval: "year" },
    });
  });

  test("zonder klant: heeftKlant is onwaar en de proef loopt", async () => {
    const lid = (await (await overzicht(lidA.cookie)).json()) as AbonnementOverzicht;
    expect(lid).toMatchObject({ heeftKlant: false, status: null, formule: null, reden: "proef", schrijven: true });
    expect(lid.proefEinde).not.toBeNull();
    expect(lid.achterstalligTot).toBeNull();
  });

  test("past_due: achterstalligTot is achterstalligSinds + 14 dagen", async () => {
    const sinds = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    await db.insert(abonnementen).values({
      organisatieId: eigenaarA.organisatieId,
      stripeKlantId: "cus_overzicht_achter",
      status: "past_due",
      formule: "maand",
      achterstalligSinds: sinds,
    });
    const lid = (await (await overzicht(lidA.cookie)).json()) as AbonnementOverzicht;
    expect(lid).toMatchObject({
      reden: "betaling-mislukt",
      schrijven: true,
      achterstalligTot: new Date(sinds.getTime() + 14 * 24 * 3600 * 1000).toISOString(),
    });
  });

  test("als Stripe de prijzen niet geeft: prijzen null en toch 200", async () => {
    stripe.faalPrijzen = true;
    const antwoord = await overzicht(lidA.cookie);
    expect(antwoord.status).toBe(200);
    expect(((await antwoord.json()) as AbonnementOverzicht).prijzen).toBeNull();
  });

  test("twee GET's binnen 10 minuten geven één haalPrijs-aanroep per prijs", async () => {
    await overzicht(lidA.cookie);
    await overzicht(eigenaarA.cookie);
    expect(aanroepen("haalPrijs").map((a) => a.invoer).sort()).toEqual(["price_jaar", "price_maand"]);
  });

  test(`na ${PRIJS_CACHE_MS / 60_000} minuten worden de prijzen opnieuw gehaald`, async () => {
    const nu = new Date("2026-10-23T10:00:00Z");
    const stand = { config: INGESCHAKELD, stripe };
    await maakOverzicht(db, eigenaarA.organisatieId, stand, nu);
    await maakOverzicht(db, eigenaarA.organisatieId, stand, new Date(nu.getTime() + PRIJS_CACHE_MS - 1));
    expect(aanroepen("haalPrijs")).toHaveLength(2);
    await maakOverzicht(db, eigenaarA.organisatieId, stand, new Date(nu.getTime() + PRIJS_CACHE_MS));
    expect(aanroepen("haalPrijs")).toHaveLength(4);
  });

  test("een mislukte prijs wordt niet in de cache bewaard", async () => {
    stripe.faalPrijzen = true;
    await overzicht(lidA.cookie);
    stripe.faalPrijzen = false;
    const lid = (await (await overzicht(lidA.cookie)).json()) as AbonnementOverzicht;
    expect(lid.prijzen?.maand.bedrag).toBe(1500);
  });
});

// --- Uitgeschakeld ---------------------------------------------------------------------------

describe("abonnementen uit", () => {
  beforeEach(() => {
    zetAbonnementen({ config: { ingeschakeld: false }, stripe: null });
  });

  test("de POST's geven 409 ABONNEMENTEN_UIT", async () => {
    for (const antwoord of [
      await checkout(eigenaarA.cookie),
      await portaal(eigenaarA.cookie),
      await synchroniseer(eigenaarA.cookie, "cs_x"),
    ]) {
      expect(antwoord.status).toBe(409);
      expect(((await antwoord.json()) as Fout).data?.code).toBe("ABONNEMENTEN_UIT");
    }
  });

  test("GET geeft ingeschakeld: false, met schrijfrecht", async () => {
    const antwoord = await overzicht(lidA.cookie);
    expect(antwoord.status).toBe(200);
    expect((await antwoord.json()) as AbonnementOverzicht).toEqual({
      ingeschakeld: false,
      schrijven: true,
      reden: "uit",
      proefEinde: null,
      achterstalligTot: null,
      status: null,
      formule: null,
      periodeEinde: null,
      opgezegd: false,
      heeftKlant: false,
      prijzen: null,
    });
  });
});
