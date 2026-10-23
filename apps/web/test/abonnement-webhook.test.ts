// De Stripe-webhook: handtekening, herhaling, volgorde, mislukte eerste betaling, doorsturen
// naar de boekhouding en de CSRF-check. De route draait in een echte h3-app op 127.0.0.1 met de
// database op PGlite; Stripe is de nep-poort en de payloads worden getekend met de offline
// testhelper van de SDK. Er gaat niets over het netwerk.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type AbonnementConfig, zetAbonnementen } from "../server/abonnementen/config";
import { stuurFactuurDoor } from "../server/abonnementen/boekhouding";
import { toegangVoor } from "../server/abonnementen/repo";
import type { StripeAbonnement, StripeFactuur } from "../server/abonnementen/stripe";
import { type Db, zetDb } from "../server/db";
import { abonnementen, doorgestuurdeFacturen, organization, stripeEvents } from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { maakTestDb, maakTestOrganisatie } from "./db";
import { maakNepStripe, type NepStripe } from "./nep-stripe";
import { apiPad, beveiligdeRoutebestanden, routeUit } from "./routes";

const GEHEIM = "whsec_test_webhook_geheim";
const INBOX = "boekhouding-geheim@voorbeeld.be";
const KLANT = "cus_a";
const KLANT_E_MAIL = "klant-privé@voorbeeld.be";
const DAG_MS = 24 * 3600 * 1000;

const CONFIG: AbonnementConfig = {
  ingeschakeld: true,
  sleutel: "sk_test_nep_alleen_voor_tests",
  webhookGeheim: GEHEIM,
  prijzen: { maand: "price_maand", jaar: "price_jaar" },
  boekhoudingInbox: INBOX,
  apiBasis: null,
};

let db: Db;
let server: Server;
let basis: string;
let stripe: NepStripe;
let orgA: string;
let orgB: string;

let mails: Mail[] = [];
/** Waar: de verzender gooit een fout die het inboxadres bevat (zoals een SMTP-server kan doen). */
let mailFaalt = false;
/** Milliseconden die een verzending duurt, om gelijktijdige leveringen te laten overlappen. */
let vertraging = 0;
const verzender: Verzender = {
  async verstuur(mail) {
    if (vertraging) await new Promise((klaar) => setTimeout(klaar, vertraging));
    if (mailFaalt) throw new Error(`550 geweigerd voor ${mail.aan}`);
    mails.push(mail);
  },
};

// --- Hulp ------------------------------------------------------------------------------------

let teller = 0;
const nieuwId = (voorvoegsel: string) => `${voorvoegsel}_${++teller}`;

/** Een Stripe-event met een object in de vorm die Stripe stuurt (minimaal). */
function event(type: string, object: Record<string, unknown>, id = nieuwId("evt")): { id: string; body: string } {
  const body = JSON.stringify({ id, object: "event", type, data: { object } });
  return { id, body };
}

const abonnementObject = (id: string, klant = KLANT, status = "active") => ({
  id,
  object: "subscription",
  customer: klant,
  status,
});

const factuurObject = (
  id: string,
  opties: { klant?: string | null; abonnement?: string | null; reden?: string; bedrag?: number } = {},
) => ({
  id,
  object: "invoice",
  customer: opties.klant === undefined ? KLANT : opties.klant,
  customer_email: KLANT_E_MAIL,
  billing_reason: opties.reden ?? "subscription_cycle",
  amount_paid: opties.bedrag ?? 1815,
  parent:
    opties.abonnement === null
      ? null
      : { type: "subscription_details", subscription_details: { subscription: opties.abonnement ?? "sub_1" } },
});

const sessieObject = (id: string, abonnement: string | null = "sub_1", klant = KLANT) => ({
  id,
  object: "checkout.session",
  customer: klant,
  subscription: abonnement,
});

function sign(body: string, geheim = GEHEIM): string {
  return Stripe.webhooks.generateTestHeaderString({ payload: body, secret: geheim });
}

async function stuur(
  body: string,
  opties: { handtekening?: string | null; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json", ...(opties.headers ?? {}) });
  const handtekening = opties.handtekening === undefined ? sign(body) : opties.handtekening;
  if (handtekening !== null) headers.set("stripe-signature", handtekening);
  return fetch(`${basis}/api/stripe/webhook`, { method: "POST", headers, body });
}

/** Stuurt een getekend event en geeft de statuscode. */
async function lever(e: { body: string }): Promise<number> {
  const antwoord = await stuur(e.body);
  await antwoord.arrayBuffer();
  return antwoord.status;
}

function abonnement(id: string, status: StripeAbonnement["status"], aangemaakt = new Date()): StripeAbonnement {
  return {
    id,
    klantId: KLANT,
    status,
    prijsId: "price_maand",
    periodeEinde: new Date(Date.now() + 20 * DAG_MS),
    opgezegdOpPeriodeEinde: false,
    aangemaakt,
  };
}

function factuur(id: string, extra: Partial<StripeFactuur> = {}): StripeFactuur {
  return {
    id,
    nummer: "ELK-0001",
    klantId: KLANT,
    abonnementId: "sub_1",
    bedragBetaald: 1815,
    pdfUrl: "https://stripe.nep/factuur.pdf",
    reden: "subscription_cycle",
    ...extra,
  };
}

const aanroepen = (methode: string) => stripe.aanroepen.filter((a) => a.methode === methode);
const rij = async () => (await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, orgA)))[0]!;
const verwerkt = async (id: string) =>
  (await db.select().from(stripeEvents).where(eq(stripeEvents.id, id))).length === 1;

// --- Opzet -----------------------------------------------------------------------------------

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
  db = await maakTestDb();
  zetDb(db);
  zetVerzender(verzender);

  const bestand = beveiligdeRoutebestanden().find((b) => apiPad(b) === "stripe/webhook.post.ts");
  if (!bestand) throw new Error("server/api/stripe/webhook.post.ts bestaat niet");
  const route = routeUit(bestand);
  const module = (await import(route.bestand)) as { default: EventHandler };
  const app = createApp();
  const router = createRouter();
  router.use(route.pad, module.default, route.methode);
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  orgA = await maakTestOrganisatie(db, "Bedrijf A");
  orgB = await maakTestOrganisatie(db, "Bedrijf B");
}, 60_000);

beforeEach(async () => {
  stripe = maakNepStripe();
  zetAbonnementen({ config: CONFIG, stripe });
  mails = [];
  mailFaalt = false;
  vertraging = 0;
  await db.delete(stripeEvents);
  await db.delete(doorgestuurdeFacturen);
  await db.delete(abonnementen);
  await db.insert(abonnementen).values({ organisatieId: orgA, stripeKlantId: KLANT });
  await db.insert(abonnementen).values({ organisatieId: orgB, stripeKlantId: "cus_b" });
  // Geen proefperiode meer: de toegang komt dan alleen van het abonnement.
  await db.update(organization).set({ proefEinde: new Date(Date.now() - DAG_MS) });
});

afterEach(() => {
  vi.restoreAllMocks();
  zetAbonnementen(undefined);
});

afterAll(async () => {
  await new Promise((klaar) => server?.close(klaar));
  vi.unstubAllEnvs();
});

// --- Handtekening ----------------------------------------------------------------------------

describe("handtekening", () => {
  test("een ontbrekende of ongeldige handtekening geeft 400 en verandert niets", async () => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "active")]);
    const e = event("customer.subscription.updated", abonnementObject("sub_1"));
    const gevallen = [
      null,
      "",
      "t=1,v1=abc",
      sign(e.body, "whsec_een_ander_geheim"),
      sign(e.body.replace("sub_1", "sub_2")),
    ];
    for (const handtekening of gevallen) {
      const antwoord = await stuur(e.body, { handtekening });
      await antwoord.arrayBuffer();
      expect(antwoord.status, String(handtekening)).toBe(400);
    }
    expect(stripe.aanroepen).toEqual([]);
    expect(await db.select().from(stripeEvents)).toEqual([]);
    expect((await rij()).status).toBeNull();
  });

  test("een verlopen handtekening (te oud) geeft 400", async () => {
    const e = event("customer.subscription.updated", abonnementObject("sub_1"));
    const oud = Stripe.webhooks.generateTestHeaderString({
      payload: e.body,
      secret: GEHEIM,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    expect((await stuur(e.body, { handtekening: oud })).status).toBe(400);
    expect(stripe.aanroepen).toEqual([]);
  });

  test("een ongeldige handtekening zet de body niet in de logs", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((n) => vi.spyOn(console, n));
    const e = event("invoice.paid", factuurObject("in_geheim"));
    const antwoord = await stuur(e.body, { handtekening: "t=1,v1=fout" });
    await antwoord.arrayBuffer();
    expect(antwoord.status).toBe(400);
    const gelogd = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(gelogd).not.toContain(KLANT_E_MAIL);
    expect(gelogd).not.toContain("in_geheim");
    expect(gelogd).not.toContain(GEHEIM);
  });

  test("abonnementen uit, of zonder webhookgeheim: 404 en er gebeurt niets", async () => {
    const e = event("customer.subscription.updated", abonnementObject("sub_1"));
    zetAbonnementen({ config: { ingeschakeld: false }, stripe: null });
    expect((await stuur(e.body)).status).toBe(404);
    zetAbonnementen({ config: { ...CONFIG, webhookGeheim: null } as AbonnementConfig, stripe });
    expect((await stuur(e.body)).status).toBe(404);
    expect(stripe.aanroepen).toEqual([]);
    expect(await db.select().from(stripeEvents)).toEqual([]);
  });
});

// --- Synchronisatie --------------------------------------------------------------------------

describe("synchronisatie", () => {
  test("een herhaald event (zelfde id) synchroniseert één keer", async () => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "active")]);
    const e = event("customer.subscription.updated", abonnementObject("sub_1"));
    expect(await lever(e)).toBe(200);
    expect(await lever(e)).toBe(200);
    expect(await lever(e)).toBe(200);
    expect(aanroepen("abonnementenVanKlant")).toHaveLength(1);
    expect(await verwerkt(e.id)).toBe(true);
  });

  test.each([
    ["checkout.session.completed", sessieObject("cs_1")],
    ["customer.subscription.created", abonnementObject("sub_1")],
    ["customer.subscription.updated", abonnementObject("sub_1")],
    ["customer.subscription.deleted", abonnementObject("sub_1")],
    ["invoice.paid", factuurObject("in_1", { bedrag: 0 })],
    ["invoice.payment_failed", factuurObject("in_2", { reden: "subscription_cycle" })],
  ])("%s synchroniseert de klant", async (type, object) => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "active")]);
    stripe.facturen.set("in_1", factuur("in_1", { bedragBetaald: 0 }));
    expect(await lever(event(type, object))).toBe(200);
    expect(aanroepen("abonnementenVanKlant")).toEqual([{ methode: "abonnementenVanKlant", invoer: KLANT }]);
    const r = await rij();
    expect(r.stripeAbonnementId).toBe("sub_1");
    expect(r.status).toBe("active");
  });

  test("customer.subscription.updated vult een lege rij met het abonnement en de status", async () => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_nieuw", "trialing")]);
    expect((await rij()).stripeAbonnementId).toBeNull();
    expect(await lever(event("customer.subscription.updated", abonnementObject("sub_nieuw", KLANT, "trialing")))).toBe(
      200,
    );
    const r = await rij();
    expect(r.stripeAbonnementId).toBe("sub_nieuw");
    expect(r.status).toBe("trialing");
    expect(r.formule).toBe("maand");
  });

  test(".deleted van een oud abonnement na het nieuwe active: de rij blijft het actieve volgen", async () => {
    const oud = abonnement("sub_oud", "canceled", new Date(Date.now() - 60 * DAG_MS));
    const nieuw = abonnement("sub_nieuw", "active");
    stripe.abonnementen.set(KLANT, [oud, nieuw]);
    expect(await lever(event("customer.subscription.created", abonnementObject("sub_nieuw")))).toBe(200);
    expect(await lever(event("customer.subscription.deleted", abonnementObject("sub_oud", KLANT, "canceled")))).toBe(
      200,
    );
    const r = await rij();
    expect(r.stripeAbonnementId).toBe("sub_nieuw");
    expect(r.status).toBe("active");
    const toegang = await toegangVoor(db, orgA, CONFIG);
    expect(toegang.schrijven).toBe(true);
    expect(toegang.reden).toBe("actief");
  });
});

// --- Mislukte eerste betaling ----------------------------------------------------------------

describe("mislukte eerste betaling", () => {
  test("checkout.session.async_payment_failed beëindigt het abonnement en synchroniseert", async () => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "active")]);
    expect(await lever(event("checkout.session.async_payment_failed", sessieObject("cs_1", "sub_1")))).toBe(200);
    expect(aanroepen("beeindigAbonnement")).toEqual([{ methode: "beeindigAbonnement", invoer: "sub_1" }]);
    const r = await rij();
    expect(r.status).toBe("canceled");
    expect((await toegangVoor(db, orgA, CONFIG)).schrijven).toBe(false);
  });

  test("invoice.payment_failed met subscription_create beëindigt het abonnement en synchroniseert", async () => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "active")]);
    const object = factuurObject("in_1", { reden: "subscription_create", abonnement: "sub_1", bedrag: 0 });
    expect(await lever(event("invoice.payment_failed", object))).toBe(200);
    expect(aanroepen("beeindigAbonnement")).toEqual([{ methode: "beeindigAbonnement", invoer: "sub_1" }]);
    expect((await rij()).status).toBe("canceled");
  });

  test("invoice.payment_failed met subscription_cycle beëindigt niets", async () => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "past_due")]);
    const object = factuurObject("in_1", { reden: "subscription_cycle" });
    expect(await lever(event("invoice.payment_failed", object))).toBe(200);
    expect(aanroepen("beeindigAbonnement")).toEqual([]);
    expect((await rij()).status).toBe("past_due");
  });

  test("een abonnement dat al beëindigd is, wordt niet nog eens beëindigd", async () => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "canceled")]);
    const object = factuurObject("in_1", { reden: "subscription_create", abonnement: "sub_1", bedrag: 0 });
    expect(await lever(event("invoice.payment_failed", object))).toBe(200);
    expect(aanroepen("beeindigAbonnement")).toEqual([]);
    expect((await rij()).status).toBe("canceled");
  });

  test("een mislukte eerste betaling zonder abonnement in het event beëindigt niets, maar synchroniseert wel", async () => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "active")]);
    const object = factuurObject("in_1", { reden: "subscription_create", abonnement: null, bedrag: 0 });
    expect(await lever(event("invoice.payment_failed", object))).toBe(200);
    expect(aanroepen("beeindigAbonnement")).toEqual([]);
    expect((await rij()).status).toBe("active");
  });
});

// --- Doorsturen naar de boekhouding ----------------------------------------------------------

describe("doorsturen naar de boekhouding", () => {
  beforeEach(() => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "active")]);
    stripe.facturen.set("in_1", factuur("in_1"));
  });

  test("invoice.paid stuurt één mail aan de inbox met één PDF-bijlage", async () => {
    expect(await lever(event("invoice.paid", factuurObject("in_1")))).toBe(200);
    expect(mails).toHaveLength(1);
    const mail = mails[0]!;
    expect(mail.aan).toBe(INBOX);
    expect(mail.onderwerp).toBe("Stripe-factuur ELK-0001");
    expect(mail.bijlagen).toHaveLength(1);
    expect(mail.bijlagen![0]).toMatchObject({ naam: "ELK-0001.pdf", type: "application/pdf" });
    expect(new TextDecoder().decode(mail.bijlagen![0]!.inhoud)).toBe("%PDF-nep in_1");
    expect(mail.tekst).toContain("18,15");
    const [vastgelegd] = await db.select().from(doorgestuurdeFacturen);
    expect(vastgelegd).toMatchObject({ stripeFactuurId: "in_1", nummer: "ELK-0001" });
  });

  test("een tweede event voor dezelfde factuur stuurt geen tweede mail", async () => {
    expect(await lever(event("invoice.paid", factuurObject("in_1")))).toBe(200);
    expect(await lever(event("invoice.paid", factuurObject("in_1")))).toBe(200);
    expect(mails).toHaveLength(1);
    expect(aanroepen("factuurPdf")).toHaveLength(1);
  });

  test("amount_paid 0: geen mail, ook niet vastgelegd", async () => {
    stripe.facturen.set("in_1", factuur("in_1", { bedragBetaald: 0 }));
    expect(await lever(event("invoice.paid", factuurObject("in_1", { bedrag: 0 })))).toBe(200);
    expect(mails).toEqual([]);
    expect(await db.select().from(doorgestuurdeFacturen)).toEqual([]);
  });

  test("zonder inbox: geen mail", async () => {
    zetAbonnementen({ config: { ...CONFIG, boekhoudingInbox: null } as AbonnementConfig, stripe });
    expect(await lever(event("invoice.paid", factuurObject("in_1")))).toBe(200);
    expect(mails).toEqual([]);
    expect(aanroepen("haalFactuur")).toEqual([]);
  });

  test("een factuur zonder nummer gebruikt het factuur-id in onderwerp en bestandsnaam", async () => {
    stripe.facturen.set("in_1", factuur("in_1", { nummer: null }));
    expect(await lever(event("invoice.paid", factuurObject("in_1")))).toBe(200);
    expect(mails[0]!.onderwerp).toBe("Stripe-factuur in_1");
    expect(mails[0]!.bijlagen![0]!.naam).toBe("in_1.pdf");
  });

  test("twee gelijktijdige leveringen voor dezelfde factuur (twee event-id's) geven precies één mail", async () => {
    vertraging = 50;
    const een = event("invoice.paid", factuurObject("in_1"));
    const twee = event("invoice.paid", factuurObject("in_1"));
    const statussen = await Promise.all([lever(een), lever(twee), lever(een)]);
    expect(statussen).toEqual([200, 200, 200]);
    expect(mails).toHaveLength(1);
    expect(await db.select().from(doorgestuurdeFacturen)).toHaveLength(1);
  });

  test("stuurFactuurDoor gelijktijdig voor dezelfde factuur: één keer verstuurd, de rest overgeslagen", async () => {
    vertraging = 50;
    const uitkomsten = await Promise.all([1, 2, 3].map(() => stuurFactuurDoor(db, stripe, INBOX, "in_1")));
    expect(uitkomsten.filter((u) => u === "verstuurd")).toHaveLength(1);
    expect(uitkomsten.filter((u) => u === "overgeslagen")).toHaveLength(2);
    expect(mails).toHaveLength(1);
  });

  test("een mislukte verzending laat geen claim achter: de volgende poging verstuurt wel", async () => {
    mailFaalt = true;
    await expect(stuurFactuurDoor(db, stripe, INBOX, "in_1")).rejects.toThrow();
    expect(await db.select().from(doorgestuurdeFacturen)).toEqual([]);
    mailFaalt = false;
    expect(await stuurFactuurDoor(db, stripe, INBOX, "in_1")).toBe("verstuurd");
    expect(mails).toHaveLength(1);
  });

  test("een overgeslagen factuur (bedrag nul, geen inbox) laat geen claim achter die een latere verzending blokkeert", async () => {
    stripe.facturen.set("in_1", factuur("in_1", { bedragBetaald: 0 }));
    expect(await stuurFactuurDoor(db, stripe, INBOX, "in_1")).toBe("overgeslagen");
    expect(await stuurFactuurDoor(db, stripe, null, "in_1")).toBe("overgeslagen");
    expect(await db.select().from(doorgestuurdeFacturen)).toEqual([]);
    stripe.facturen.set("in_1", factuur("in_1"));
    expect(await stuurFactuurDoor(db, stripe, INBOX, "in_1")).toBe("verstuurd");
    expect(mails).toHaveLength(1);
  });

  test("een mailfout geeft 500, het event staat niet in stripe_events en een nieuwe poging verstuurt wel", async () => {
    const e = event("invoice.paid", factuurObject("in_1"));
    mailFaalt = true;
    expect(await lever(e)).toBe(500);
    expect(await verwerkt(e.id)).toBe(false);
    expect(await db.select().from(doorgestuurdeFacturen)).toEqual([]);
    expect(mails).toEqual([]);

    mailFaalt = false;
    expect(await lever(e)).toBe(200);
    expect(mails).toHaveLength(1);
    expect(await verwerkt(e.id)).toBe(true);
    expect(await db.select().from(doorgestuurdeFacturen)).toHaveLength(1);
  });

  test("een factuur die Stripe niet kent geeft 500 (Stripe stuurt het event opnieuw)", async () => {
    stripe.facturen.clear();
    const e = event("invoice.paid", factuurObject("in_1"));
    expect(await lever(e)).toBe(500);
    expect(await verwerkt(e.id)).toBe(false);
    expect(mails).toEqual([]);
  });

  test("een fout van Stripe tijdens het synchroniseren geeft 500 zonder insert", async () => {
    vi.spyOn(stripe, "abonnementenVanKlant").mockRejectedValue(new Error("Stripe onbereikbaar"));
    const e = event("customer.subscription.updated", abonnementObject("sub_1"));
    expect(await lever(e)).toBe(500);
    expect(await verwerkt(e.id)).toBe(false);
  });
});

// --- Onbekend --------------------------------------------------------------------------------

describe("onbekend", () => {
  test("een onbekende klant geeft 200 en schrijft niets", async () => {
    const e = event("customer.subscription.updated", abonnementObject("sub_x", "cus_onbekend"));
    expect(await lever(e)).toBe(200);
    expect(await verwerkt(e.id)).toBe(true);
    expect(aanroepen("abonnementenVanKlant")).toEqual([]);
    expect((await rij()).status).toBeNull();
  });

  test("invoice.paid voor een onbekende klant geeft 200, geen mail, en het event is verwerkt", async () => {
    stripe.facturen.set("in_1", factuur("in_1", { klantId: "cus_onbekend" }));
    const e = event("invoice.paid", factuurObject("in_1", { klant: "cus_onbekend" }));
    expect(await lever(e)).toBe(200);
    expect(await verwerkt(e.id)).toBe(true);
    expect(mails).toEqual([]);
    expect(aanroepen("haalFactuur")).toEqual([]);
    expect(await db.select().from(doorgestuurdeFacturen)).toEqual([]);
  });

  test("invoice.paid zonder klant geeft 200, geen mail, en het event is verwerkt", async () => {
    stripe.facturen.set("in_1", factuur("in_1"));
    const e = event("invoice.paid", factuurObject("in_1", { klant: null }));
    expect(await lever(e)).toBe(200);
    expect(await verwerkt(e.id)).toBe(true);
    expect(mails).toEqual([]);
    expect(stripe.aanroepen).toEqual([]);
  });

  test("een event zonder klant geeft 200", async () => {
    const e = event("invoice.payment_failed", factuurObject("in_1", { klant: null }));
    expect(await lever(e)).toBe(200);
    expect(aanroepen("abonnementenVanKlant")).toEqual([]);
  });

  test("een onbekend type geeft 200 en doet niets", async () => {
    const e = event("charge.refunded", { id: "ch_1", object: "charge", customer: KLANT });
    expect(await lever(e)).toBe(200);
    expect(await verwerkt(e.id)).toBe(true);
    expect(stripe.aanroepen).toEqual([]);
    expect(mails).toEqual([]);
  });
});

// --- CSRF ------------------------------------------------------------------------------------

describe("CSRF-check", () => {
  test("een verzoek zonder Origin en zonder Sec-Fetch-Site passeert (Stripe stuurt geen van beide)", async () => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "active")]);
    const e = event("customer.subscription.updated", abonnementObject("sub_1"));
    const antwoord = await stuur(e.body);
    await antwoord.arrayBuffer();
    expect(antwoord.status).toBe(200);
    expect((await rij()).status).toBe("active");
  });

  test("een verzoek met Origin van een andere site geeft 403 en verwerkt niets, ook als het getekend is", async () => {
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "active")]);
    const e = event("customer.subscription.updated", abonnementObject("sub_1"));
    const antwoord = await stuur(e.body, { headers: { origin: "https://evil.example" } });
    await antwoord.arrayBuffer();
    expect(antwoord.status).toBe(403);
    expect(stripe.aanroepen).toEqual([]);
    expect(await verwerkt(e.id)).toBe(false);
  });

  test("Sec-Fetch-Site: cross-site geeft 403", async () => {
    const e = event("customer.subscription.updated", abonnementObject("sub_1"));
    const antwoord = await stuur(e.body, { headers: { "sec-fetch-site": "cross-site" } });
    await antwoord.arrayBuffer();
    expect(antwoord.status).toBe(403);
  });
});

// --- Logs ------------------------------------------------------------------------------------

describe("logs", () => {
  test("geen inboxadres, whsec_, sk_ of payload in de logs, ook niet bij fouten en onbekende events", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((n) => vi.spyOn(console, n));
    stripe.abonnementen.set(KLANT, [abonnement("sub_1", "active")]);
    stripe.facturen.set("in_1", factuur("in_1"));

    // Onbekend type, onbekende klant, een geslaagde factuur en een mailfout (met het adres erin).
    await lever(event("charge.refunded", { id: "ch_1", object: "charge", customer: KLANT }));
    await lever(event("customer.subscription.updated", abonnementObject("sub_x", "cus_onbekend")));
    await lever(event("invoice.paid", factuurObject("in_1")));
    stripe.facturen.set("in_2", factuur("in_2", { nummer: "ELK-0002" }));
    mailFaalt = true;
    expect(await lever(event("invoice.paid", factuurObject("in_2")))).toBe(500);
    // Een ongeldige handtekening met de payload erbij.
    const antwoord = await stuur(event("invoice.paid", factuurObject("in_3")).body, { handtekening: "t=1,v1=x" });
    await antwoord.arrayBuffer();

    const gelogd = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const verboden of [INBOX, "boekhouding-geheim", "whsec_", "sk_", GEHEIM, CONFIG.ingeschakeld && CONFIG.sleutel, KLANT_E_MAIL]) {
      if (verboden) expect(gelogd, String(verboden)).not.toContain(verboden);
    }
  });
});
