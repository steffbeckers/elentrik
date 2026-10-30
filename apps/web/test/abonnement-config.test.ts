import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { gebruikAbonnementen, leesAbonnementConfig, zetAbonnementen } from "../server/abonnementen/config";
import { leesWebhook, maakStripePoort } from "../server/abonnementen/stripe";
import { maakNepStripe } from "./nep-stripe";

const VOLLEDIG = {
  STRIPE_GEHEIME_SLEUTEL: "sk_test_geheim",
  STRIPE_WEBHOOK_GEHEIM: "whsec_test",
  STRIPE_PRIJS_MAAND: "price_maand",
  STRIPE_PRIJS_JAAR: "price_jaar",
  BOEKHOUDING_INBOX: "boekhouding@voorbeeld.be",
};

afterEach(() => zetAbonnementen(undefined));

/** Voert uit en geeft de gegooide fout terug; faalt als er niets gegooid wordt. */
function vang(f: () => unknown): unknown {
  let gegooid = false;
  let fout: unknown;
  try {
    f();
  } catch (e) {
    gegooid = true;
    fout = e;
  }
  if (!gegooid) expect.fail("verwachtte een fout, maar er werd niets gegooid");
  return fout;
}

describe("leesAbonnementConfig", () => {
  test("zonder sleutel zijn abonnementen uit", () => {
    expect(leesAbonnementConfig({})).toEqual({ ingeschakeld: false });
    expect(leesAbonnementConfig({ STRIPE_GEHEIME_SLEUTEL: "  " })).toEqual({ ingeschakeld: false });
  });

  test("volledig: sleutel, prijzen, geheim en inbox", () => {
    expect(leesAbonnementConfig(VOLLEDIG)).toEqual({
      ingeschakeld: true,
      sleutel: "sk_test_geheim",
      webhookGeheim: "whsec_test",
      prijzen: { maand: "price_maand", jaar: "price_jaar" },
      boekhoudingInbox: "boekhouding@voorbeeld.be",
      apiBasis: null,
    });
  });

  test("een lege BOEKHOUDING_INBOX en een ontbrekend webhookgeheim worden null", () => {
    const config = leesAbonnementConfig({ ...VOLLEDIG, BOEKHOUDING_INBOX: "", STRIPE_WEBHOOK_GEHEIM: undefined });
    expect(config).toMatchObject({ ingeschakeld: true, boekhoudingInbox: null, webhookGeheim: null });
  });

  test("een ontbrekende prijs gooit met de naam van de variabele", () => {
    const { STRIPE_PRIJS_JAAR: _weg, ...zonderJaar } = VOLLEDIG;
    expect(() => leesAbonnementConfig(zonderJaar)).toThrow("STRIPE_PRIJS_JAAR ontbreekt");
    const { STRIPE_PRIJS_MAAND: _weg2, ...zonderMaand } = VOLLEDIG;
    expect(() => leesAbonnementConfig(zonderMaand)).toThrow("STRIPE_PRIJS_MAAND ontbreekt");
  });

  test("STRIPE_API_BASIS: alleen lokaal en met een testsleutel", () => {
    const config = leesAbonnementConfig({ ...VOLLEDIG, STRIPE_API_BASIS: "http://127.0.0.1:3199" });
    expect(config).toMatchObject({ ingeschakeld: true });
    if (config.ingeschakeld) expect(config.apiBasis?.href).toBe("http://127.0.0.1:3199/");

    expect(() =>
      leesAbonnementConfig({ ...VOLLEDIG, STRIPE_GEHEIME_SLEUTEL: "sk_live_geheim", STRIPE_API_BASIS: "http://127.0.0.1:3199" }),
    ).toThrow();
    expect(() => leesAbonnementConfig({ ...VOLLEDIG, STRIPE_API_BASIS: "http://example.com:3199" })).toThrow();
    expect(() => leesAbonnementConfig({ ...VOLLEDIG, STRIPE_API_BASIS: "geen url" })).toThrow();
  });

  test("geen foutmelding bevat de sleutel of het geheim", () => {
    const gevallen: Record<string, string | undefined>[] = [
      { ...VOLLEDIG, STRIPE_PRIJS_JAAR: undefined },
      { ...VOLLEDIG, STRIPE_GEHEIME_SLEUTEL: "sk_live_geheim", STRIPE_API_BASIS: "http://127.0.0.1:3199" },
      { ...VOLLEDIG, STRIPE_API_BASIS: "http://example.com" },
    ];
    for (const env of gevallen) {
      expect(() => leesAbonnementConfig(env)).toThrow();
      const fout = vang(() => leesAbonnementConfig(env));
      expect(String(fout)).not.toContain("sk_test_geheim");
      expect(String(fout)).not.toContain("sk_live_geheim");
      expect(String(fout)).not.toContain("whsec_test");
    }
  });
});

describe("gebruikAbonnementen", () => {
  test("geeft wat zetAbonnementen zette", () => {
    const stripe = maakNepStripe();
    const a = { config: leesAbonnementConfig(VOLLEDIG), stripe };
    zetAbonnementen(a);
    expect(gebruikAbonnementen()).toBe(a);
  });
});

describe("leesWebhook", () => {
  const ondertekend = (payload: string, secret = "whsec_test") =>
    Stripe.webhooks.generateTestHeaderString({ payload, secret });

  test("een invoice.paid geeft de genormaliseerde gebeurtenis", () => {
    const payload = JSON.stringify({
      id: "evt_1",
      object: "event",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          object: "invoice",
          customer: "cus_1",
          billing_reason: "subscription_cycle",
          parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
        },
      },
    });
    expect(leesWebhook(payload, ondertekend(payload), "whsec_test")).toEqual({
      id: "evt_1",
      type: "invoice.paid",
      klantId: "cus_1",
      objectId: "in_1",
      abonnementId: "sub_1",
      reden: "subscription_cycle",
    });
  });

  test("een invoice in de oudere vorm (subscription bovenaan) geeft ook het abonnement", () => {
    const payload = JSON.stringify({
      id: "evt_oud",
      object: "event",
      type: "invoice.paid",
      data: {
        object: { id: "in_oud", object: "invoice", customer: "cus_1", subscription: "sub_oud", billing_reason: "subscription_cycle" },
      },
    });
    expect(leesWebhook(payload, ondertekend(payload), "whsec_test")).toMatchObject({
      objectId: "in_oud",
      abonnementId: "sub_oud",
    });
  });

  test("een customer.subscription.updated gebruikt het abonnement zelf", () => {
    const payload = JSON.stringify({
      id: "evt_2",
      object: "event",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_9", object: "subscription", customer: { id: "cus_9" } } },
    });
    expect(leesWebhook(payload, ondertekend(payload), "whsec_test")).toMatchObject({
      klantId: "cus_9",
      objectId: "sub_9",
      abonnementId: "sub_9",
    });
  });

  test("een checkout.session.completed geeft klant en abonnement van de sessie", () => {
    const payload = JSON.stringify({
      id: "evt_3",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", object: "checkout.session", customer: "cus_2", subscription: "sub_2" } },
    });
    expect(leesWebhook(payload, ondertekend(payload), "whsec_test")).toMatchObject({
      klantId: "cus_2",
      objectId: "cs_1",
      abonnementId: "sub_2",
    });
  });

  test("een onbekend objecttype geeft null-velden", () => {
    const payload = JSON.stringify({ id: "evt_4", object: "event", type: "ping", data: { object: { object: "x" } } });
    expect(leesWebhook(payload, ondertekend(payload), "whsec_test")).toEqual({
      id: "evt_4",
      type: "ping",
      klantId: null,
      objectId: null,
      abonnementId: null,
      reden: null,
    });
  });

  const ping = () => JSON.stringify({ id: "evt_5", object: "event", type: "ping", data: { object: {} } });

  test("een correct getekende payload wordt wel geaccepteerd (controle op de testhulp)", () => {
    const payload = ping();
    expect(leesWebhook(payload, ondertekend(payload), "whsec_test").id).toBe("evt_5");
  });

  test("een verkeerd geheim gooit", () => {
    const payload = ping();
    expect(() => leesWebhook(payload, ondertekend(payload, "whsec_ander"), "whsec_test")).toThrow(
      "Ongeldige Stripe-handtekening",
    );
  });

  test("de fout noemt geen geheim", () => {
    const payload = ping();
    const fout = vang(() => leesWebhook(payload, ondertekend(payload, "whsec_ander"), "whsec_test"));
    expect(String(fout)).not.toContain("whsec_test");
    expect(String(fout)).not.toContain("whsec_ander");
  });

  test("een gewijzigde payload gooit", () => {
    const payload = ping();
    const header = ondertekend(payload);
    expect(() => leesWebhook(payload.replace("ping", "pong"), header, "whsec_test")).toThrow(
      "Ongeldige Stripe-handtekening",
    );
  });

  test("een ontbrekende of onleesbare handtekening gooit", () => {
    const payload = ping();
    for (const header of ["", "onzin", "t=abc,v1=", "v1=deadbeef"]) {
      expect(() => leesWebhook(payload, header, "whsec_test")).toThrow("Ongeldige Stripe-handtekening");
    }
    expect(() => leesWebhook(payload, undefined as unknown as string, "whsec_test")).toThrow(
      "Ongeldige Stripe-handtekening",
    );
  });

  test("een te oude tijdstempel (buiten de standaardtolerantie) gooit", () => {
    const payload = ping();
    const oud = Math.floor(Date.now() / 1000) - 3600;
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test", timestamp: oud });
    expect(() => leesWebhook(payload, header, "whsec_test")).toThrow("Ongeldige Stripe-handtekening");
  });
});

describe("maakStripePoort tegen een lokale nep-API", () => {
  type Verzoek = {
    pad: string;
    zoek: URLSearchParams;
    versie: string | undefined;
    idempotentie: string | undefined;
    lichaam: URLSearchParams;
  };
  let server: Server;
  let verzoeken: Verzoek[];
  /** Per pad het antwoord; een functie krijgt de queryparameters (voor gepagineerde lijsten). */
  let antwoorden: Record<string, unknown>;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const delen: Buffer[] = [];
      req.on("data", (d: Buffer) => delen.push(d));
      req.on("end", () => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        verzoeken.push({
          pad: url.pathname,
          zoek: url.searchParams,
          versie: req.headers["stripe-version"] as string | undefined,
          idempotentie: req.headers["idempotency-key"] as string | undefined,
          lichaam: new URLSearchParams(Buffer.concat(delen).toString("utf8")),
        });
        res.setHeader("content-type", "application/json");
        const antwoord = antwoorden[url.pathname];
        res.end(
          JSON.stringify(
            typeof antwoord === "function" ? (antwoord as (z: URLSearchParams) => unknown)(url.searchParams) : (antwoord ?? {}),
          ),
        );
      });
    });
    await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  });
  afterAll(() => new Promise<void>((klaar) => server.close(() => klaar())));
  beforeEach(() => {
    verzoeken = [];
    antwoorden = {};
  });

  const poort = () => {
    const { port } = server.address() as AddressInfo;
    const config = leesAbonnementConfig({ ...VOLLEDIG, STRIPE_API_BASIS: `http://127.0.0.1:${port}` });
    if (!config.ingeschakeld) throw new Error("verwacht ingeschakeld");
    return maakStripePoort(config);
  };

  test("maakCheckout stuurt de vaste parameters en de vastgepinde API-versie", async () => {
    antwoorden["/v1/checkout/sessions"] = { id: "cs_1", object: "checkout.session", url: "https://checkout.stripe.test/cs_1" };
    const trialEinde = new Date("2026-12-01T10:00:00Z");
    const r = await poort().maakCheckout({
      klantId: "cus_1",
      prijsId: "price_maand",
      organisatieId: "org_1",
      trialEinde,
      succesUrl: "https://app.test/abonnement?terug={CHECKOUT_SESSION_ID}",
      annuleerUrl: "https://app.test/abonnement",
      locale: "nl",
    });
    expect(r).toEqual({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
    const v = verzoeken[0]!;
    expect(v.versie).toBe(Stripe.API_VERSION);
    const l = Object.fromEntries(v.lichaam);
    expect(l).toMatchObject({
      mode: "subscription",
      customer: "cus_1",
      "line_items[0][price]": "price_maand",
      "automatic_tax[enabled]": "true",
      "tax_id_collection[enabled]": "true",
      billing_address_collection: "required",
      "customer_update[address]": "auto",
      "customer_update[name]": "auto",
      "metadata[organisatieId]": "org_1",
      "subscription_data[metadata][organisatieId]": "org_1",
      "subscription_data[trial_end]": String(Math.floor(trialEinde.getTime() / 1000)),
      success_url: "https://app.test/abonnement?terug={CHECKOUT_SESSION_ID}",
      cancel_url: "https://app.test/abonnement",
    });
  });

  test("maakCheckout zonder trialEinde stuurt geen trial_end", async () => {
    antwoorden["/v1/checkout/sessions"] = { id: "cs_2", object: "checkout.session", url: "https://checkout.stripe.test/cs_2" };
    await poort().maakCheckout({
      klantId: "cus_1",
      prijsId: "price_jaar",
      organisatieId: "org_1",
      trialEinde: null,
      succesUrl: "https://app.test/a",
      annuleerUrl: "https://app.test/b",
      locale: "nl",
    });
    expect(verzoeken[0]!.lichaam.has("subscription_data[trial_end]")).toBe(false);
  });

  const ORG = "0b8f3c52-6f0e-4b8a-9d7c-3a1f5e2d4c6b";

  test("maakKlant stuurt de idempotency key klant-<organisatieId> op de draad", async () => {
    antwoorden["/v1/customers"] = { id: "cus_1", object: "customer" };
    const r = await poort().maakKlant({ organisatieId: ORG, email: "a@b.be", naam: "Bedrijf" });
    expect(r).toEqual({ id: "cus_1" });
    const v = verzoeken[0]!;
    expect(v.pad).toBe("/v1/customers");
    expect(v.idempotentie).toBe(`klant-${ORG}`);
    expect(Object.fromEntries(v.lichaam)).toMatchObject({ "metadata[organisatieId]": ORG });
  });

  test("zoekKlant zoekt op metadata.organisatieId en geeft het id van de gevonden klant", async () => {
    antwoorden["/v1/customers/search"] = {
      object: "search_result",
      has_more: false,
      data: [{ id: "cus_bestaand", object: "customer", metadata: { organisatieId: ORG } }],
    };
    expect(await poort().zoekKlant(ORG)).toEqual({ id: "cus_bestaand" });
    const v = verzoeken[0]!;
    expect(v.pad).toBe("/v1/customers/search");
    expect(v.zoek.get("query")).toBe(`metadata['organisatieId']:'${ORG}'`);
  });

  test("zoekKlant zonder resultaat geeft null; een klant van een andere organisatie telt niet", async () => {
    antwoorden["/v1/customers/search"] = { object: "search_result", has_more: false, data: [] };
    expect(await poort().zoekKlant(ORG)).toBeNull();
    antwoorden["/v1/customers/search"] = {
      object: "search_result",
      has_more: false,
      data: [{ id: "cus_andere", object: "customer", metadata: { organisatieId: "iets-anders" } }],
    };
    expect(await poort().zoekKlant(ORG)).toBeNull();
  });

  test("zoekKlant weigert een organisatie-id dat geen uuid is, zonder verzoek", async () => {
    for (const id of ["org_1", "' OR metadata['x']:'y", `${ORG}'`, ""]) {
      await expect(poort().zoekKlant(id)).rejects.toThrow("geen geldig organisatie-id");
    }
    expect(verzoeken).toEqual([]);
  });

  test.each(["nl", "fr", "en"] as const)("maakCheckout stuurt locale=%s op de draad", async (locale) => {
    antwoorden["/v1/checkout/sessions"] = { id: "cs_3", object: "checkout.session", url: "https://checkout.stripe.test/cs_3" };
    await poort().maakCheckout({
      klantId: "cus_1",
      prijsId: "price_maand",
      organisatieId: "org_1",
      trialEinde: null,
      succesUrl: "https://app.test/a",
      annuleerUrl: "https://app.test/b",
      locale,
    });
    expect(verzoeken[0]!.lichaam.get("locale")).toBe(locale);
  });

  test.each(["nl", "fr", "en"] as const)("maakPortaal stuurt locale=%s op de draad", async (locale) => {
    antwoorden["/v1/billing_portal/sessions"] = {
      id: "bps_1",
      object: "billing_portal.session",
      url: "https://portaal.stripe.test/bps_1",
    };
    const r = await poort().maakPortaal({ klantId: "cus_1", terugUrl: "https://app.test/abonnement", locale });
    expect(r).toEqual({ url: "https://portaal.stripe.test/bps_1" });
    const v = verzoeken[0]!;
    expect(v.pad).toBe("/v1/billing_portal/sessions");
    expect(Object.fromEntries(v.lichaam)).toMatchObject({
      customer: "cus_1",
      return_url: "https://app.test/abonnement",
      locale,
    });
  });

  test("abonnementenVanKlant vraagt alle statussen en neemt de periode van het eerste item", async () => {
    antwoorden["/v1/subscriptions"] = {
      object: "list",
      has_more: false,
      data: [
        {
          id: "sub_1",
          object: "subscription",
          customer: "cus_1",
          status: "past_due",
          cancel_at_period_end: true,
          created: 1_790_000_000,
          items: { object: "list", data: [{ id: "si_1", price: { id: "price_maand" }, current_period_end: 1_800_000_000 }] },
        },
      ],
    };
    const lijst = await poort().abonnementenVanKlant("cus_1");
    expect(lijst).toEqual([
      {
        id: "sub_1",
        klantId: "cus_1",
        status: "past_due",
        prijsId: "price_maand",
        periodeEinde: new Date(1_800_000_000 * 1000),
        opgezegdOpPeriodeEinde: true,
        aangemaakt: new Date(1_790_000_000 * 1000),
      },
    ]);
    expect(verzoeken[0]!.pad).toBe("/v1/subscriptions");
  });

  test("haalFactuur leest het abonnement uit parent.subscription_details", async () => {
    antwoorden["/v1/invoices/in_1"] = {
      id: "in_1",
      object: "invoice",
      number: "ABC-0001",
      customer: "cus_1",
      amount_paid: 1210,
      invoice_pdf: "https://pdf.stripe.test/in_1",
      billing_reason: "subscription_create",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
    };
    expect(await poort().haalFactuur("in_1")).toEqual({
      id: "in_1",
      nummer: "ABC-0001",
      klantId: "cus_1",
      abonnementId: "sub_1",
      bedragBetaald: 1210,
      pdfUrl: "https://pdf.stripe.test/in_1",
      reden: "subscription_create",
    });
  });

  test("haalFactuur valt terug op het abonnement bovenaan de factuur (oudere vorm)", async () => {
    antwoorden["/v1/invoices/in_oud"] = {
      id: "in_oud",
      object: "invoice",
      number: "ABC-0002",
      customer: "cus_1",
      amount_paid: 1210,
      invoice_pdf: null,
      billing_reason: "subscription_cycle",
      subscription: "sub_oud",
    };
    expect(await poort().haalFactuur("in_oud")).toMatchObject({ id: "in_oud", abonnementId: "sub_oud" });
  });

  describe("betaaldeFacturen", () => {
    const rauweFactuur = (id: string, klant = "cus_1") => ({
      id,
      object: "invoice",
      number: `ABC-${id}`,
      customer: klant,
      amount_paid: 1210,
      invoice_pdf: `https://pdf.stripe.test/${id}`,
      billing_reason: "subscription_cycle",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
    });

    const DAG_S = 24 * 3600;

    test("vraagt status=paid en created[gte] in seconden, 60 dagen voor sinds", async () => {
      antwoorden["/v1/invoices"] = { object: "list", has_more: false, data: [rauweFactuur("in_1")] };
      const sinds = new Date("2026-11-03T12:00:00.500Z");
      const lijst = await poort().betaaldeFacturen(sinds);
      expect(lijst).toEqual([
        {
          id: "in_1",
          nummer: "ABC-in_1",
          klantId: "cus_1",
          abonnementId: "sub_1",
          bedragBetaald: 1210,
          pdfUrl: "https://pdf.stripe.test/in_1",
          reden: "subscription_cycle",
        },
      ]);
      expect(verzoeken).toHaveLength(1);
      expect(verzoeken[0]!.pad).toBe("/v1/invoices");
      expect(verzoeken[0]!.zoek.get("status")).toBe("paid");
      expect(verzoeken[0]!.zoek.get("created[gte]")).toBe(String(Math.floor(sinds.getTime() / 1000) - 60 * DAG_S));
    });

    test("houdt facturen die sinds sinds betaald zijn, ook als ze veel eerder zijn aangemaakt", async () => {
      const sinds = new Date("2026-11-03T12:00:00Z");
      const s = Math.floor(sinds.getTime() / 1000);
      const betaald = (id: string, paidAt: number | null, aangemaakt: number) => ({
        ...rauweFactuur(id),
        created: aangemaakt,
        status_transitions: { paid_at: paidAt },
      });
      antwoorden["/v1/invoices"] = {
        object: "list",
        has_more: false,
        data: [
          betaald("in_oud_nu_betaald", s + 3600, s - 30 * DAG_S),
          betaald("in_al_lang_betaald", s - 3600, s - 30 * DAG_S),
          betaald("in_precies", s, s - DAG_S),
          betaald("in_zonder_paid_at", null, s - DAG_S),
        ],
      };
      const lijst = await poort().betaaldeFacturen(sinds);
      expect(lijst.map((f) => f.id)).toEqual(["in_oud_nu_betaald", "in_precies", "in_zonder_paid_at"]);
    });

    test("waarschuwt zonder inhoud als de grens van 5000 facturen bereikt is", async () => {
      antwoorden["/v1/invoices"] = (zoek: URLSearchParams) => {
        const na = zoek.get("starting_after");
        const start = na ? Number(na.slice(3)) + 1 : 0;
        const data = Array.from({ length: 100 }, (_, i) => rauweFactuur(`in_${start + i}`));
        return { object: "list", has_more: true, data };
      };
      const waarschuw = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const lijst = await poort().betaaldeFacturen(new Date("2026-11-03T12:00:00Z"));
        expect(lijst).toHaveLength(5000);
        expect(waarschuw).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(waarschuw.mock.calls)).toContain("5000");
        expect(JSON.stringify(waarschuw.mock.calls)).not.toContain("cus_1");
      } finally {
        waarschuw.mockRestore();
      }
    });

    test("volgt has_more met starting_after tot alle pagina's gelezen zijn", async () => {
      antwoorden["/v1/invoices"] = (zoek: URLSearchParams) => {
        const na = zoek.get("starting_after");
        if (!na) return { object: "list", has_more: true, data: [rauweFactuur("in_1"), rauweFactuur("in_2")] };
        if (na === "in_2") return { object: "list", has_more: true, data: [rauweFactuur("in_3")] };
        return { object: "list", has_more: false, data: [rauweFactuur("in_4")] };
      };
      const lijst = await poort().betaaldeFacturen(new Date("2026-11-03T12:00:00Z"));
      expect(lijst.map((f) => f.id)).toEqual(["in_1", "in_2", "in_3", "in_4"]);
      expect(verzoeken.map((v) => v.zoek.get("starting_after"))).toEqual([null, "in_2", "in_3"]);
      // Elke pagina behoudt de filters.
      expect(verzoeken.every((v) => v.zoek.get("status") === "paid" && v.zoek.has("created[gte]"))).toBe(true);
    });
  });

  test("factuurPdf haalt de PDF op met een time-out van 10 seconden", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(pdf));
    try {
      const factuur = { id: "in_1", nummer: null, klantId: "cus_1", abonnementId: null, bedragBetaald: 0, pdfUrl: "https://pdf.stripe.test/in_1", reden: null };
      expect(await poort().factuurPdf(factuur)).toEqual(pdf);
      expect(timeout).toHaveBeenCalledWith(10_000);
      expect(fetchSpy.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
    } finally {
      fetchSpy.mockRestore();
      timeout.mockRestore();
    }
  });

  test("haalPrijs geeft bedrag, munt en interval", async () => {
    antwoorden["/v1/prices/price_jaar"] = {
      id: "price_jaar",
      object: "price",
      unit_amount: 9900,
      currency: "eur",
      recurring: { interval: "year", interval_count: 1 },
    };
    expect(await poort().haalPrijs("price_jaar")).toEqual({ id: "price_jaar", bedrag: 9900, munt: "eur", interval: "year" });
  });
});

describe("maakNepStripe", () => {
  test("geeft voorspelbare id's en URL's en legt aanroepen vast", async () => {
    const nep = maakNepStripe();
    const klant = await nep.maakKlant({ organisatieId: "org_1", email: "a@b.be", naam: "Bedrijf" });
    expect(klant).toEqual({ id: "cus_nep_1" });
    const checkout = await nep.maakCheckout({
      klantId: klant.id,
      prijsId: "price_maand",
      organisatieId: "org_1",
      trialEinde: null,
      succesUrl: "x",
      annuleerUrl: "y",
      locale: "nl",
    });
    expect(checkout).toEqual({ id: "cs_nep_1", url: "https://checkout.nep/cs_nep_1" });
    expect(await nep.haalCheckout("cs_nep_1")).toEqual({ id: "cs_nep_1", klantId: "cus_nep_1", abonnementId: null });
    expect(await nep.haalCheckout("onbekend")).toBeNull();
    expect(nep.aanroepen.map((a) => a.methode)).toEqual(["maakKlant", "maakCheckout", "haalCheckout", "haalCheckout"]);
    expect(await nep.zoekKlant("org_1")).toBeNull();
    nep.klanten.set("org_1", "cus_bestaand");
    expect(await nep.zoekKlant("org_1")).toEqual({ id: "cus_bestaand" });
    nep.faalPrijzen = true;
    await expect(nep.haalPrijs("price_maand")).rejects.toThrow();
  });
});
