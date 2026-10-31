// Het compatibiliteitsgetal: client en server delen het. De client stuurt het op elk eigen /api-
// verzoek (`X-Elentrik-Client`), de server meldt het op elk /api-antwoord
// (`X-Elentrik-Client-Minimum`) en weigert een schrijfactie van een client met een ander getal
// (426 NIEUWE_VERSIE_VEREIST). Een client zonder getal (de Stripe-webhook, de Docker-healthcheck)
// gaat altijd door.
//
// Verhoog het getal alleen als een oude client en de nieuwe server samen schade kunnen doen: een
// wijziging van het formaat van een /api-verzoek of -antwoord die een oude client niet aankan. Een
// wijziging van het documentmodel komt altijd met een migratie in `MIGRATIES`, en verhoogt het
// getal niet: oude documenten blijven leesbaar.
//
// Expliciete import in de server en client (ruling E1): dit bestand importeert niets.

export const CLIENT_COMPATIBILITEIT = 1;

/** Het verzoek van de client: zijn eigen getal. */
export const CLIENT_HEADER = "x-elentrik-client";

/** Het antwoord van de server: het getal dat hij verwacht. */
export const CLIENT_MINIMUM_HEADER = "x-elentrik-client-minimum";

/** Een geheel getal vanaf 1, anders null (geen header, of een ongeldige). */
export function leesClientversie(waarde: string | null | undefined): number | null {
  if (typeof waarde !== "string" || !/^\d+$/.test(waarde)) return null;
  const getal = Number(waarde);
  return Number.isSafeInteger(getal) && getal >= 1 ? getal : null;
}

const LEZEN = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Moet de server dit verzoek weigeren? Alleen een schrijfactie van een client met een ander getal,
 * in beide richtingen (ook na een terugrol van de server).
 */
export function moetWeigeren(methode: string, client: number | null, server: number): boolean {
  if (client === null || LEZEN.has(methode.toUpperCase())) return false;
  return client !== server;
}
