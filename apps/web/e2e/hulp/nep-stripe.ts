// Een nep-Stripe voor de e2e-tests: een kleine node:http-server op 127.0.0.1 die genoeg van de
// Stripe-REST-API beantwoordt voor de aanroepen van de Stripe-poort (server/abonnementen/stripe.ts).
// De echte SDK praat er via `STRIPE_API_BASIS` mee (alleen toegelaten met een `sk_test_`-sleutel en
// een lokale host). Er gaat nooit verkeer naar de echte Stripe.
//
// Wat ze doet:
// - prijzen lezen (vaste maand- en jaarprijs), klanten maken en zoeken op `metadata.organisatieId`;
// - Checkout-sessies maken, lezen en laten vervallen, met een nepbetaalpagina op /checkout/:id;
// - een sessie in modus `payment` (een project vrijgeven) betalen: de knop "Betalen" op de
//   nepbetaalpagina zet ze op `complete` en `paid` en stuurt door naar haar `success_url`, met
//   `{CHECKOUT_SESSION_ID}` ingevuld, zoals Stripe;
// - een leeg abonnementenoverzicht en een lege lijst betaalde facturen, en een nepklantenportaal.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { E2E_STRIPE_PRIJS_JAAR, E2E_STRIPE_PRIJS_MAAND, E2E_STRIPE_PRIJS_PROJECT } from "../omgeving";

type Klant = { id: string; email: string | null; name: string | null; metadata: Record<string, string> };

type Sessie = {
  id: string;
  klant: string | null;
  modus: "subscription" | "payment";
  metadata: Record<string, string>;
  status: "open" | "complete" | "expired";
  betaalstatus: "paid" | "unpaid";
  succesUrl: string | null;
};

/**
 * Prijzen in centen: maandelijks 15,00 en jaarlijks 150,00 (twee maanden gratis, dus −17 %), en
 * eenmalig 25,00 om één project vrij te geven (zonder `recurring`).
 */
const PRIJZEN: Record<string, { bedrag: number; interval: "month" | "year" | null }> = {
  [E2E_STRIPE_PRIJS_MAAND]: { bedrag: 1500, interval: "month" },
  [E2E_STRIPE_PRIJS_JAAR]: { bedrag: 15000, interval: "year" },
  [E2E_STRIPE_PRIJS_PROJECT]: { bedrag: 2500, interval: null },
};

function json(res: ServerResponse, status: number, lichaam: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(lichaam));
}

function nietGevonden(res: ServerResponse, id: string): void {
  json(res, 404, {
    error: { type: "invalid_request_error", code: "resource_missing", message: `No such resource: '${id}'` },
  });
}

async function leesFormulier(req: IncomingMessage): Promise<URLSearchParams> {
  const delen: Buffer[] = [];
  for await (const deel of req) delen.push(deel as Buffer);
  return new URLSearchParams(Buffer.concat(delen).toString("utf8"));
}

/** De `metadata[sleutel]=waarde`-velden van een formulier, als object. */
function metadataVan(formulier: URLSearchParams): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [sleutel, waarde] of formulier) {
    const m = /^metadata\[(.+)\]$/.exec(sleutel);
    if (m?.[1]) metadata[m[1]] = waarde;
  }
  return metadata;
}

export async function startNepStripe(poort: number): Promise<{ stop(): Promise<void> }> {
  const basis = `http://127.0.0.1:${poort}`;
  const sessies = new Map<string, Sessie>();
  const klanten = new Map<string, Klant>();
  let teller = 0;
  const nieuwId = (voorvoegsel: string) => `${voorvoegsel}_e2e_${++teller}`;

  const sessieJson = (s: Sessie) => ({
    id: s.id,
    object: "checkout.session",
    mode: s.modus,
    customer: s.klant,
    subscription: null,
    metadata: s.metadata,
    status: s.status,
    payment_status: s.betaalstatus,
    url: s.status === "open" ? `${basis}/checkout/${s.id}` : null,
  });

  async function behandel(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const methode = req.method ?? "GET";
    const pad = new URL(req.url ?? "/", basis).pathname;
    let m: RegExpExecArray | null;

    // De nepbetaalpagina waar Checkout naartoe stuurt. Een open sessie in modus `payment` krijgt een
    // knop "Betalen"; een abonnement betalen kan de nep-Stripe niet.
    if (methode === "GET" && (m = /^\/checkout\/([^/]+)$/.exec(pad))) {
      const sessie = sessies.get(m[1]!);
      const betaalbaar = sessie?.modus === "payment" && sessie.status === "open";
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(
        `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Nep-Checkout</title></head>` +
          `<body><h1>Nep-Checkout</h1><p>Sessie ${m[1]}</p>` +
          (betaalbaar ? `<form method="post" action="/checkout/${m[1]}/betaal"><button type="submit">Betalen</button></form>` : "") +
          `</body></html>`,
      );
      return;
    }

    // "Betalen": de sessie is voltooid en betaald, en de klant gaat terug naar de `success_url`.
    if (methode === "POST" && (m = /^\/checkout\/([^/]+)\/betaal$/.exec(pad))) {
      const sessie = sessies.get(m[1]!);
      if (!sessie || sessie.modus !== "payment" || sessie.status !== "open" || !sessie.succesUrl) {
        return nietGevonden(res, m[1]!);
      }
      sessie.status = "complete";
      sessie.betaalstatus = "paid";
      res.statusCode = 303;
      res.setHeader("location", sessie.succesUrl.replace("{CHECKOUT_SESSION_ID}", sessie.id));
      res.end();
      return;
    }

    if (methode === "GET" && (m = /^\/v1\/prices\/([^/]+)$/.exec(pad))) {
      const prijs = PRIJZEN[m[1]!];
      if (!prijs) return nietGevonden(res, m[1]!);
      return json(res, 200, {
        id: m[1],
        object: "price",
        currency: "eur",
        unit_amount: prijs.bedrag,
        recurring: prijs.interval ? { interval: prijs.interval, interval_count: 1 } : null,
      });
    }

    if (methode === "POST" && pad === "/v1/customers") {
      const formulier = await leesFormulier(req);
      const klant: Klant = {
        id: nieuwId("cus"),
        email: formulier.get("email"),
        name: formulier.get("name"),
        metadata: metadataVan(formulier),
      };
      klanten.set(klant.id, klant);
      return json(res, 200, { ...klant, object: "customer" });
    }

    // De zoekopdracht van de Stripe-poort: `metadata['organisatieId']:'<uuid>'`.
    if (methode === "GET" && pad === "/v1/customers/search") {
      const query = new URL(req.url ?? "/", basis).searchParams.get("query") ?? "";
      const m2 = /^metadata\['([^']+)'\]:'([^']*)'$/.exec(query);
      const gevonden = m2 ? [...klanten.values()].filter((k) => k.metadata[m2[1]!] === m2[2]) : [];
      return json(res, 200, {
        object: "search_result",
        url: "/v1/customers/search",
        has_more: false,
        data: gevonden.map((k) => ({ ...k, object: "customer" })),
      });
    }

    if (methode === "POST" && pad === "/v1/checkout/sessions") {
      const formulier = await leesFormulier(req);
      const sessie: Sessie = {
        id: nieuwId("cs_test"),
        klant: formulier.get("customer"),
        modus: formulier.get("mode") === "payment" ? "payment" : "subscription",
        metadata: metadataVan(formulier),
        status: "open",
        betaalstatus: "unpaid",
        succesUrl: formulier.get("success_url"),
      };
      sessies.set(sessie.id, sessie);
      return json(res, 200, sessieJson(sessie));
    }

    if (methode === "GET" && (m = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(pad))) {
      const sessie = sessies.get(m[1]!);
      return sessie ? json(res, 200, sessieJson(sessie)) : nietGevonden(res, m[1]!);
    }

    if (methode === "POST" && (m = /^\/v1\/checkout\/sessions\/([^/]+)\/expire$/.exec(pad))) {
      const sessie = sessies.get(m[1]!);
      if (!sessie) return nietGevonden(res, m[1]!);
      // Zoals Stripe: alleen een open sessie kan vervallen.
      if (sessie.status !== "open") {
        return json(res, 400, {
          error: { type: "invalid_request_error", message: `Session ${sessie.id} is not open` },
        });
      }
      sessie.status = "expired";
      return json(res, 200, sessieJson(sessie));
    }

    if (methode === "GET" && pad === "/v1/subscriptions") {
      return json(res, 200, { object: "list", data: [], has_more: false, url: "/v1/subscriptions" });
    }

    // De uurlijkse inhaaltaak leest de betaalde facturen: er zijn er geen.
    if (methode === "GET" && pad === "/v1/invoices") {
      return json(res, 200, { object: "list", data: [], has_more: false, url: "/v1/invoices" });
    }

    if (methode === "POST" && pad === "/v1/billing_portal/sessions") {
      const id = nieuwId("bps");
      return json(res, 200, { id, object: "billing_portal.session", url: `${basis}/portaal/${id}` });
    }

    json(res, 404, { error: { type: "invalid_request_error", message: `Onbekend nepadres: ${methode} ${pad}` } });
  }

  const server: Server = createServer((req, res) => {
    behandel(req, res).catch((fout: unknown) => {
      if (!res.headersSent) json(res, 500, { error: { type: "api_error", message: String(fout) } });
      else res.end();
    });
  });
  await new Promise<void>((klaar, mislukt) => {
    server.once("error", mislukt);
    server.listen(poort, "127.0.0.1", klaar);
  });

  return {
    stop: () =>
      new Promise<void>((klaar) => {
        server.closeAllConnections();
        server.close(() => klaar());
      }),
  };
}
