// De configuratie van abonnementen uit de omgeving, en het injecteerbare singleton dat de
// routes gebruiken (zoals gebruikVerzender/zetVerzender in server/mail/verzend.ts).
//
// Zonder STRIPE_GEHEIME_SLEUTEL zijn abonnementen uit: geen limiet, geen watermerk van een versie
// en geen stempel. De limieten van de gratis versie (GRATIS_MAX_KRINGEN en
// GRATIS_MAX_SITUATIESCHEMAS) staan ook dan in de config, maar worden niet toegepast. De waarden
// uit de omgeving worden nergens gelogd of in een foutmelding gezet.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import type { Limieten } from "@elentrik/model";
import { maakStripePoort, type StripePoort } from "./stripe";

export type AbonnementConfig =
  | { ingeschakeld: false; limieten: Limieten }
  | {
      ingeschakeld: true;
      sleutel: string;
      webhookGeheim: string | null;
      /** Stripe-prijs-id's; `project` is null zonder `STRIPE_PRIJS_PROJECT`. */
      prijzen: { maand: string; jaar: string; project: string | null };
      limieten: Limieten;
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

/** Standaardlimieten van de gratis versie (spec 4.1). */
const STANDAARD_LIMIETEN: Limieten = { kringen: 5, situatieschemas: 1 };

/** Een positief geheel getal uit de omgeving, of `standaard` als de variabele leeg is. */
function positiefGetal(env: Record<string, string | undefined>, naam: string, standaard: number): number {
  const w = waarde(env, naam);
  if (w === null) return standaard;
  if (!/^[0-9]+$/.test(w) || Number(w) < 1 || !Number.isSafeInteger(Number(w))) {
    throw new Error(`${naam} moet een positief geheel getal zijn`);
  }
  return Number(w);
}

/** De limieten van de gratis versie; ook gelezen als abonnementen uit staan. */
export function leesLimieten(env: Record<string, string | undefined> = process.env): Limieten {
  return {
    kringen: positiefGetal(env, "GRATIS_MAX_KRINGEN", STANDAARD_LIMIETEN.kringen),
    situatieschemas: positiefGetal(env, "GRATIS_MAX_SITUATIESCHEMAS", STANDAARD_LIMIETEN.situatieschemas),
  };
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
  const limieten = leesLimieten(env);
  const sleutel = waarde(env, "STRIPE_GEHEIME_SLEUTEL");
  if (!sleutel) return { ingeschakeld: false, limieten };
  return {
    ingeschakeld: true,
    sleutel,
    webhookGeheim: waarde(env, "STRIPE_WEBHOOK_GEHEIM"),
    prijzen: {
      maand: vereist(env, "STRIPE_PRIJS_MAAND"),
      jaar: vereist(env, "STRIPE_PRIJS_JAAR"),
      project: waarde(env, "STRIPE_PRIJS_PROJECT"),
    },
    limieten,
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
