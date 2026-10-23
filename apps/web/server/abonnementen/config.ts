// De configuratie van abonnementen uit de omgeving, en het injecteerbare singleton dat de
// routes gebruiken (zoals gebruikVerzender/zetVerzender in server/mail/verzend.ts).
//
// Zonder STRIPE_GEHEIME_SLEUTEL zijn abonnementen uit: geen proefperiode, geen 402. De waarden
// uit de omgeving worden nergens gelogd of in een foutmelding gezet.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { maakStripePoort, type StripePoort } from "./stripe";

export type AbonnementConfig =
  | { ingeschakeld: false }
  | {
      ingeschakeld: true;
      sleutel: string;
      webhookGeheim: string | null;
      prijzen: { maand: string; jaar: string };
      boekhoudingInbox: string | null;
      /** Alleen voor tests: een lokale nep-Stripe in plaats van api.stripe.com. */
      apiBasis: URL | null;
    };

const LOKALE_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function waarde(env: Record<string, string | undefined>, naam: string): string | null {
  const w = env[naam]?.trim();
  return w ? w : null;
}

function vereist(env: Record<string, string | undefined>, naam: string): string {
  const w = waarde(env, naam);
  if (!w) throw new Error(`${naam} ontbreekt`);
  return w;
}

/** `STRIPE_API_BASIS`: alleen een lokale host en alleen met een testsleutel. */
function leesApiBasis(env: Record<string, string | undefined>, sleutel: string): URL | null {
  const ruw = waarde(env, "STRIPE_API_BASIS");
  if (!ruw) return null;
  let url: URL;
  try {
    url = new URL(ruw);
  } catch {
    throw new Error("STRIPE_API_BASIS is geen geldige URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("STRIPE_API_BASIS moet http of https zijn");
  }
  if (!LOKALE_HOSTS.has(url.hostname)) {
    throw new Error("STRIPE_API_BASIS mag alleen naar een lokale host wijzen (127.0.0.1, localhost)");
  }
  if (!sleutel.startsWith("sk_test_")) {
    throw new Error("STRIPE_API_BASIS mag alleen met een testsleutel (sk_test_) gebruikt worden");
  }
  return url;
}

export function leesAbonnementConfig(env: Record<string, string | undefined> = process.env): AbonnementConfig {
  const sleutel = waarde(env, "STRIPE_GEHEIME_SLEUTEL");
  if (!sleutel) return { ingeschakeld: false };
  return {
    ingeschakeld: true,
    sleutel,
    webhookGeheim: waarde(env, "STRIPE_WEBHOOK_GEHEIM"),
    prijzen: { maand: vereist(env, "STRIPE_PRIJS_MAAND"), jaar: vereist(env, "STRIPE_PRIJS_JAAR") },
    boekhoudingInbox: waarde(env, "BOEKHOUDING_INBOX"),
    apiBasis: leesApiBasis(env, sleutel),
  };
}

export type Abonnementen = { config: AbonnementConfig; stripe: StripePoort | null };

let huidige: Abonnementen | undefined;

/** De configuratie en Stripe-poort, eenmalig uit `process.env` gelezen. */
export function gebruikAbonnementen(): Abonnementen {
  if (!huidige) {
    const config = leesAbonnementConfig();
    huidige = { config, stripe: config.ingeschakeld ? maakStripePoort(config) : null };
  }
  return huidige;
}

/** Alleen voor tests: vervangt wat `gebruikAbonnementen()` teruggeeft; `undefined` wist het. */
export function zetAbonnementen(a: Abonnementen | undefined): void {
  huidige = a;
}
