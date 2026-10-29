// De controle van de configuratie bij het starten van de server (plugin server/plugins/configuratie.ts).
// De meldingen noemen alleen de naam van een variabele, nooit een waarde.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { leesAbonnementConfig } from "../abonnementen/config";
import { isCidr } from "../net";
import { isStaging, leesOmgeving } from "../../shared/omgeving";

type Env = Record<string, string | undefined>;

/**
 * De variabelen die in productie moeten staan. Sommige hebben een standaardwaarde in de code
 * (BETTER_AUTH_URL, ELENTRIK_BESTANDEN_DIR, ELENTRIK_GOTENBERG_URL: handig voor lokale
 * ontwikkeling); buiten productie volgt dus alleen een waarschuwing.
 */
const VERPLICHT = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "ELENTRIK_BESTANDEN_DIR",
  "ELENTRIK_GOTENBERG_URL",
] as const;

const GRAPH = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_GEHEIM", "MAIL_AFZENDER"] as const;

const SMTP = ["SMTP_HOST", "SMTP_VAN"] as const;

const STRIPE = ["STRIPE_WEBHOOK_GEHEIM", "STRIPE_PRIJS_MAAND", "STRIPE_PRIJS_JAAR"] as const;

function gezet(env: Env, naam: string): boolean {
  return !!env[naam]?.trim();
}

/** Nog de plaatshouder uit .env.voorbeeld (`<...>`), zoals `leesGeheim` die ook weigert. */
function isPlaatshouder(env: Env, naam: string): boolean {
  return !!env[naam]?.trim().startsWith("<");
}

/** Een geldig http(s)-adres. */
function isHttpUrl(waarde: string): boolean {
  try {
    const protocol = new URL(waarde).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** De lijst met problemen in de configuratie: alleen namen van variabelen, geen waarden. */
export function controleerConfiguratie(env: Env): string[] {
  const problemen: string[] = [];
  const meld = (naam: string) => {
    if (!problemen.includes(naam)) problemen.push(naam);
  };

  const productie = env.NODE_ENV === "production";

  for (const naam of VERPLICHT) if (!gezet(env, naam)) meld(naam);

  // Gezet maar geen adres dat de app kan gebruiken (een plaatshouder, een adres zonder http(s)://).
  const url = env.BETTER_AUTH_URL?.trim();
  if (url && !isHttpUrl(url)) meld("BETTER_AUTH_URL");

  // Het databasewachtwoord staat in compose in PGPASSWORD; de plaatshouder uit .env.voorbeeld is geen wachtwoord.
  if (productie && isPlaatshouder(env, "PGPASSWORD")) meld("PGPASSWORD");

  const verzender = env.MAIL_VERZENDER?.trim();
  if (verzender === "graph") {
    for (const naam of GRAPH) if (!gezet(env, naam) || isPlaatshouder(env, naam)) meld(naam);
  } else if (verzender && verzender !== "smtp") {
    meld("MAIL_VERZENDER");
  } else if (productie) {
    // Zonder MAIL_VERZENDER of met smtp valt de code terug op Mailpit (127.0.0.1:1025): in productie
    // zou elke mail stilletjes verloren gaan. SMTP_POORT, SMTP_GEBRUIKER en SMTP_WACHTWOORD blijven optioneel.
    for (const naam of SMTP) if (!gezet(env, naam)) meld(naam);
  }

  if (gezet(env, "STRIPE_GEHEIME_SLEUTEL")) {
    for (const naam of STRIPE) if (!gezet(env, naam)) meld(naam);
    // De rest van de Stripe-regels (zoals STRIPE_API_BASIS) staan in leesAbonnementConfig. Haar
    // meldingen beginnen met de naam van de variabele; de rest van de tekst gebruiken we niet.
    try {
      leesAbonnementConfig(env);
    } catch (fout) {
      const naam = /^[A-Z][A-Z0-9_]*/.exec(fout instanceof Error ? fout.message : "")?.[0];
      meld(naam ?? "STRIPE_GEHEIME_SLEUTEL");
    }
  }

  // De grendels per omgeving gelden zodra ELENTRIK_OMGEVING gezet is (alleen op de NAS), ook buiten
  // NODE_ENV=production. Een andere waarde dan productie of staging is een fout: anders vallen de
  // grendels stil weg bij een typefout.
  const omgeving = leesOmgeving(env);
  if (gezet(env, "ELENTRIK_OMGEVING") && !omgeving) meld("ELENTRIK_OMGEVING");
  if (isStaging(omgeving)) {
    // Staging verstuurt nooit echte mail (Mailpit) en gebruikt alleen testsleutels van Stripe: een
    // sleutel die geen sk_test_ of rk_test_ is (ook een beperkte live-sleutel, rk_live_) wordt geweigerd.
    if (verzender === "graph") meld("MAIL_VERZENDER");
    if (gezet(env, "STRIPE_GEHEIME_SLEUTEL") && !/^(sk|rk)_test_/.test(env.STRIPE_GEHEIME_SLEUTEL!.trim())) {
      meld("STRIPE_GEHEIME_SLEUTEL");
    }
  } else if (omgeving === "productie") {
    // Productie mag niet naar de Mailpit van staging sturen (dienstnaam mailpit, containernaam elentrik-mailpit).
    const smtpHost = env.SMTP_HOST?.trim().toLowerCase();
    if (smtpHost === "mailpit" || smtpHost === "elentrik-mailpit") meld("SMTP_HOST");
  }

  const net = env.ELENTRIK_VERTROUWD_PROXYNET?.trim();
  if (net && !isCidr(net)) meld("ELENTRIK_VERTROUWD_PROXYNET");

  return problemen;
}

/**
 * Controleert de configuratie bij het starten: in productie (of met ELENTRIK_OMGEVING gezet) gooit een probleem een `Error` met de
 * namen (de server start dan niet); anders volgt een waarschuwing.
 */
export function controleerBijStart(env: Env = process.env): void {
  const problemen = controleerConfiguratie(env);
  if (problemen.length === 0) return;
  const lijst = problemen.join(", ");
  // Met ELENTRIK_OMGEVING gezet (NAS) is de server altijd strikt, ook zonder NODE_ENV=production.
  if (env.NODE_ENV === "production" || gezet(env, "ELENTRIK_OMGEVING")) {
    throw new Error(`Ongeldige configuratie; controleer: ${lijst} (zie apps/web/.env.example)`);
  }
  console.warn(`Configuratie onvolledig of ongeldig; controleer: ${lijst} (zie apps/web/.env.example)`);
}
