// Het compatibiliteitsgetal: client en server delen het. De client stuurt het op elk eigen /api-
// verzoek (`X-Elentrik-Client`), de server meldt het op elk /api-antwoord
// (`X-Elentrik-Client-Minimum`) en weigert een schrijfactie van een client met een ander getal
// (426 NIEUWE_VERSIE_VEREIST). Een client zonder getal (de Stripe-webhook, de Docker-healthcheck)
// gaat altijd door.
//
// Verhoog het getal als een oude client en de nieuwe server samen schade kunnen doen: een wijziging
// van het formaat van een /api-verzoek of -antwoord, van een validatie, of van het documentmodel
// (`SCHEMA_VERSIE` in packages/model). De server migreert oude opgeslagen documenten en invoer,
// maar dat maakt een oude editor niet veilig: zijn documentkopie mist nieuwe velden en onderdelen.
// Versie 2 beschermt het schema-2-model (aanleg, bronparameters en plaatsbare infrastructuur)
// tegen schrijfacties van client 1. De bestaande migratie 1 → 2 bewaart oude dossiers;
// ze verleent een verouderde client geen schrijftoegang. Versie 3 beschermt de metingen
// (`meta.metingen`, `testResultaat` en `uitschakeltijd_ms` per differentieel): ze zijn optioneel
// binnen schema 2, dus oude dossiers blijven leesbaar zonder migratie, maar de documentkopie van
// een editor van client 2 kent ze niet en zou ze bij bewaren wegschrijven.
// `test/clientversie.test.ts` pint het paar.
//
// Expliciete import in de server en client (ruling E1): dit bestand importeert niets.

export const CLIENT_COMPATIBILITEIT = 3;

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
