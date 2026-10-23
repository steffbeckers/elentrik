// De Stripe-poort: een smalle interface om de Stripe-SDK, zodat de rest van de server en de
// tests niet van de SDK afhangen (test/nep-stripe.ts is de geheugenimplementatie).
//
// De API-versie is vastgepind op die van de geinstalleerde SDK (`Stripe.API_VERSION`). In deze
// versie staat `current_period_end` op de abonnementsitems en wijst de factuur via
// `parent.subscription_details.subscription` naar zijn abonnement.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import Stripe from "stripe";
import type { AbonnementStatus } from "../../shared/abonnement";
import type { AbonnementConfig } from "./config";

export type StripeAbonnement = {
  id: string;
  klantId: string;
  status: AbonnementStatus;
  prijsId: string | null;
  periodeEinde: Date | null;
  opgezegdOpPeriodeEinde: boolean;
  aangemaakt: Date;
};

export type StripeFactuur = {
  id: string;
  nummer: string | null;
  klantId: string;
  abonnementId: string | null;
  bedragBetaald: number;
  pdfUrl: string | null;
  reden: string | null;
};

export type StripePrijs = { id: string; bedrag: number; munt: string; interval: "month" | "year" };

export type StripeCheckout = { id: string; klantId: string | null; abonnementId: string | null };

export interface StripePoort {
  maakKlant(i: { organisatieId: string; email: string; naam: string }): Promise<{ id: string }>;
  maakCheckout(i: {
    klantId: string;
    prijsId: string;
    organisatieId: string;
    trialEinde: Date | null;
    succesUrl: string;
    annuleerUrl: string;
  }): Promise<{ id: string; url: string }>;
  haalCheckout(id: string): Promise<StripeCheckout | null>;
  laatCheckoutVervallen(id: string): Promise<void>;
  maakPortaal(i: { klantId: string; terugUrl: string }): Promise<{ url: string }>;
  abonnementenVanKlant(klantId: string): Promise<StripeAbonnement[]>;
  beeindigAbonnement(id: string): Promise<void>;
  haalFactuur(id: string): Promise<StripeFactuur | null>;
  factuurPdf(factuur: StripeFactuur): Promise<Uint8Array>;
  haalPrijs(id: string): Promise<StripePrijs>;
}

type Id = string | { id: string } | null | undefined;

function idVan(waarde: Id): string | null {
  if (!waarde) return null;
  return typeof waarde === "string" ? waarde : waarde.id;
}

function bestaatNiet(fout: unknown): boolean {
  return fout instanceof Stripe.errors.StripeError && (fout.code === "resource_missing" || fout.statusCode === 404);
}

function naarAbonnement(s: Stripe.Subscription): StripeAbonnement {
  const item = s.items.data[0];
  return {
    id: s.id,
    klantId: idVan(s.customer) ?? "",
    status: s.status as AbonnementStatus,
    prijsId: item?.price?.id ?? null,
    periodeEinde: item ? new Date(item.current_period_end * 1000) : null,
    opgezegdOpPeriodeEinde: s.cancel_at_period_end,
    aangemaakt: new Date(s.created * 1000),
  };
}

function naarFactuur(f: Stripe.Invoice): StripeFactuur {
  return {
    id: f.id ?? "",
    nummer: f.number,
    klantId: idVan(f.customer) ?? "",
    abonnementId: idVan(f.parent?.subscription_details?.subscription),
    bedragBetaald: f.amount_paid,
    pdfUrl: f.invoice_pdf ?? null,
    reden: f.billing_reason ?? null,
  };
}

export function maakStripePoort(config: Extract<AbonnementConfig, { ingeschakeld: true }>): StripePoort {
  const basis = config.apiBasis;
  const stripe = new Stripe(config.sleutel, {
    apiVersion: Stripe.API_VERSION,
    ...(basis
      ? {
          host: basis.hostname,
          port: basis.port || (basis.protocol === "https:" ? 443 : 80),
          protocol: basis.protocol === "https:" ? ("https" as const) : ("http" as const),
        }
      : {}),
  });

  return {
    async maakKlant(i) {
      const klant = await stripe.customers.create({
        email: i.email,
        name: i.naam,
        metadata: { organisatieId: i.organisatieId },
      });
      return { id: klant.id };
    },

    async maakCheckout(i) {
      const sessie = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: i.klantId,
        line_items: [{ price: i.prijsId, quantity: 1 }],
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        billing_address_collection: "required",
        customer_update: { address: "auto", name: "auto" },
        metadata: { organisatieId: i.organisatieId },
        subscription_data: {
          metadata: { organisatieId: i.organisatieId },
          ...(i.trialEinde ? { trial_end: Math.floor(i.trialEinde.getTime() / 1000) } : {}),
        },
        success_url: i.succesUrl,
        cancel_url: i.annuleerUrl,
      });
      if (!sessie.url) throw new Error("Stripe gaf geen Checkout-URL");
      return { id: sessie.id, url: sessie.url };
    },

    async haalCheckout(id) {
      try {
        const sessie = await stripe.checkout.sessions.retrieve(id);
        return { id: sessie.id, klantId: idVan(sessie.customer), abonnementId: idVan(sessie.subscription) };
      } catch (fout) {
        if (bestaatNiet(fout)) return null;
        throw fout;
      }
    },

    async laatCheckoutVervallen(id) {
      try {
        await stripe.checkout.sessions.expire(id);
      } catch (fout) {
        // Een sessie die al voltooid of vervallen is, hoeft niet meer te vervallen.
        if (fout instanceof Stripe.errors.StripeInvalidRequestError && fout.statusCode === 400) return;
        throw fout;
      }
    },

    async maakPortaal(i) {
      const sessie = await stripe.billingPortal.sessions.create({ customer: i.klantId, return_url: i.terugUrl });
      return { url: sessie.url };
    },

    async abonnementenVanKlant(klantId) {
      const lijst = await stripe.subscriptions.list({ customer: klantId, status: "all", limit: 100 });
      return lijst.data.map(naarAbonnement);
    },

    async beeindigAbonnement(id) {
      await stripe.subscriptions.cancel(id);
    },

    async haalFactuur(id) {
      try {
        return naarFactuur(await stripe.invoices.retrieve(id));
      } catch (fout) {
        if (bestaatNiet(fout)) return null;
        throw fout;
      }
    },

    async factuurPdf(factuur) {
      if (!factuur.pdfUrl) throw new Error("Deze factuur heeft geen PDF");
      const antwoord = await fetch(factuur.pdfUrl);
      if (!antwoord.ok) throw new Error(`De factuur-PDF is niet op te halen (${antwoord.status})`);
      return new Uint8Array(await antwoord.arrayBuffer());
    },

    async haalPrijs(id) {
      const prijs = await stripe.prices.retrieve(id);
      const interval = prijs.recurring?.interval;
      if (prijs.unit_amount === null || (interval !== "month" && interval !== "year")) {
        throw new Error(`De prijs ${id} is geen maand- of jaarprijs met een vast bedrag`);
      }
      return { id: prijs.id, bedrag: prijs.unit_amount, munt: prijs.currency, interval: interval === "year" ? "year" : "month" };
    },
  };
}

export type Gebeurtenis = {
  id: string;
  type: string;
  klantId: string | null;
  objectId: string | null;
  abonnementId: string | null;
  reden: string | null;
};

type GebeurtenisObject = {
  id?: string;
  object?: string;
  customer?: Id;
  subscription?: Id;
  billing_reason?: string | null;
  cancellation_details?: { reason?: string | null } | null;
  parent?: { subscription_details?: { subscription?: Id } | null } | null;
};

/**
 * Leest een webhook offline met de SDK: controleert de handtekening en normaliseert de
 * gebeurtenis. Gooit bij een ongeldige handtekening, zonder het geheim of de payload te noemen.
 */
export function leesWebhook(rauw: string, handtekening: string, geheim: string): Gebeurtenis {
  let gebeurtenis: Stripe.Event;
  try {
    gebeurtenis = Stripe.webhooks.constructEvent(rauw, handtekening, geheim);
  } catch {
    throw new Error("Ongeldige Stripe-handtekening");
  }
  const o = (gebeurtenis.data?.object ?? {}) as GebeurtenisObject;
  let abonnementId: string | null = null;
  let reden: string | null = null;
  switch (o.object) {
    case "subscription":
      abonnementId = o.id ?? null;
      reden = o.cancellation_details?.reason ?? null;
      break;
    case "invoice":
      abonnementId = idVan(o.parent?.subscription_details?.subscription);
      reden = o.billing_reason ?? null;
      break;
    case "checkout.session":
      abonnementId = idVan(o.subscription);
      break;
  }
  return {
    id: gebeurtenis.id,
    type: gebeurtenis.type,
    klantId: idVan(o.customer),
    objectId: o.id ?? null,
    abonnementId,
    reden,
  };
}
