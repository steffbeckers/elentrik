import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
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
      try {
        leesAbonnementConfig(env);
        expect.unreachable();
      } catch (fout) {
        expect(String(fout)).not.toContain("sk_test_geheim");
        expect(String(fout)).not.toContain("sk_live_geheim");
        expect(String(fout)).not.toContain("whsec_test");
      }
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

  test("een verkeerd geheim gooit, zonder het geheim te noemen", () => {
    const payload = JSON.stringify({ id: "evt_5", object: "event", type: "ping", data: { object: {} } });
    try {
      leesWebhook(payload, ondertekend(payload, "whsec_ander"), "whsec_test");
      expect.unreachable();
    } catch (fout) {
      expect(String(fout)).not.toContain("whsec_test");
      expect(String(fout)).not.toContain("whsec_ander");
    }
  });
});

describe("maakStripePoort tegen een lokale nep-API", () => {
  type Verzoek = { pad: string; versie: string | undefined; lichaam: URLSearchParams };
  let server: Server;
  let verzoeken: Verzoek[];
  let antwoorden: Record<string, unknown>;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const delen: Buffer[] = [];
      req.on("data", (d: Buffer) => delen.push(d));
      req.on("end", () => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        verzoeken.push({
          pad: url.pathname,
          versie: req.headers["stripe-version"] as string | undefined,
          lichaam: new URLSearchParams(Buffer.concat(delen).toString("utf8")),
        });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(antwoorden[url.pathname] ?? {}));
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
    });
    expect(verzoeken[0]!.lichaam.has("subscription_data[trial_end]")).toBe(false);
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
    });
    expect(checkout).toEqual({ id: "cs_nep_1", url: "https://checkout.nep/cs_nep_1" });
    expect(await nep.haalCheckout("cs_nep_1")).toEqual({ id: "cs_nep_1", klantId: "cus_nep_1", abonnementId: null });
    expect(await nep.haalCheckout("onbekend")).toBeNull();
    expect(nep.aanroepen.map((a) => a.methode)).toEqual(["maakKlant", "maakCheckout", "haalCheckout", "haalCheckout"]);
    nep.faalPrijzen = true;
    await expect(nep.haalPrijs("price_maand")).rejects.toThrow();
  });
});
