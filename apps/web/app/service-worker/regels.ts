// De regels van de service worker (sw.ts): welke verzoeken uit de cache van de app-bestanden komen,
// hoe lang ze daar blijven, en wat er bij het activeren gebeurt.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1). sw.ts zelf is niet te testen; daarom staat de logica hier.

/** De ene cache voor de code van alle versies: bestanden met een hash veranderen nooit van inhoud. */
export const APP_CACHE = "elentrik-code";

/** Een bestand blijft 60 dagen in de cache, zodat ook een tabblad dat lang openstond zijn code vindt. */
export const MAX_LEEFTIJD_S = 60 * 24 * 60 * 60;

/**
 * Komt dit pad uit de cache (cache eerst)? Alleen de code van de build (`/_nuxt/`, met een hash) en de
 * vertalingen (`/_i18n/<hash>/…`). Niet `/_nuxt/builds/`: daar staat het versiebestand van Nuxt, zonder
 * hash, dat altijd vers moet zijn. Navigaties, `/api/`, `/pdfjs/`, `/sw.js` en het manifest gaan
 * altijd naar het netwerk.
 */
export function isAppBestand(pad: string): boolean {
  if (pad.startsWith("/_nuxt/builds/")) return false;
  return pad.startsWith("/_nuxt/") || pad.startsWith("/_i18n/");
}

/**
 * Bij het activeren neemt de nieuwe service worker meteen de open tabbladen over. De caches blijven
 * bewust staan (`opslag` wordt niet aangeraakt): een tabblad dat nog de vorige versie draait, laadt
 * zijn schermen en vertalingen daaruit, ook nadat een ander tabblad naar de nieuwe versie herlaadde.
 * Oude bestanden verdwijnen alleen door de expiratie.
 */
export async function bijActiveren(
  clients: { claim(): Promise<void> },
  _opslag: Pick<CacheStorage, "delete" | "keys">,
): Promise<void> {
  await clients.claim();
}
