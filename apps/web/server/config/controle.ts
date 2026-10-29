// De controle van de configuratie bij het starten van de server (plugin server/plugins/configuratie.ts).
// De meldingen noemen alleen de naam van een variabele, nooit een waarde.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { leesAbonnementConfig } from "../abonnementen/config";
import { isCidr } from "../net";

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

const STRIPE = ["STRIPE_WEBHOOK_GEHEIM", "STRIPE_PRIJS_MAAND", "STRIPE_PRIJS_JAAR"] as const;

function gezet(env: Env, naam: string): boolean {
  return !!env[naam]?.trim();
}

/** De lijst met problemen in de configuratie: alleen namen van variabelen, geen waarden. */
export function controleerConfiguratie(env: Env): string[] {
  const problemen: string[] = [];
  const meld = (naam: string) => {
    if (!problemen.includes(naam)) problemen.push(naam);
  };

  for (const naam of VERPLICHT) if (!gezet(env, naam)) meld(naam);

  const verzender = env.MAIL_VERZENDER?.trim();
  if (verzender === "graph") {
    for (const naam of GRAPH) if (!gezet(env, naam)) meld(naam);
  } else if (verzender && verzender !== "smtp") {
    meld("MAIL_VERZENDER");
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

  const net = env.ELENTRIK_VERTROUWD_PROXYNET?.trim();
  if (net && !isCidr(net)) meld("ELENTRIK_VERTROUWD_PROXYNET");

  return problemen;
}

/**
 * Controleert de configuratie bij het starten: in productie gooit een probleem een `Error` met de
 * namen (de server start dan niet); anders volgt een waarschuwing.
 */
export function controleerBijStart(env: Env = process.env): void {
  const problemen = controleerConfiguratie(env);
  if (problemen.length === 0) return;
  const lijst = problemen.join(", ");
  if (env.NODE_ENV === "production") {
    throw new Error(`Ongeldige configuratie; controleer: ${lijst} (zie apps/web/.env.example)`);
  }
  console.warn(`Configuratie onvolledig of ongeldig; controleer: ${lijst} (zie apps/web/.env.example)`);
}
