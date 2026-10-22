// Welke organisatie-endpoints van Better Auth van buitenaf (via HTTP onder /api/auth) bereikbaar
// zijn: een expliciete lijst, de rest geeft 404 (ruling R7). Leden, uitnodigingen, rollen, de
// actieve organisatie en het hernoemen lopen via de eigen routes onder /api/organisaties en
// /api/uitnodigingen; die roepen Better Auth server-side aan (`auth.api.*`), buiten deze controle.
// Een nieuw of onbekend organisatie-endpoint is dus standaard dicht.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

const BASIS = "/api/auth";

/** De enige organisatie-endpoints die van buitenaf mogen: een organisatie aanmaken (/geen-organisatie). */
export const TOEGELATEN_ORGANISATIEPADEN: ReadonlySet<string> = new Set(["/organization/create"]);

/**
 * Wordt dit pad (de pathname van een verzoek onder /api/auth) geweigerd? Elk pad dat, gedecodeerd
 * en in kleine letters, "organization" bevat, is dicht, tenzij het exact (zonder codering,
 * hoofdletters of slash op het einde) een toegelaten pad is. Een pad dat niet te decoderen is,
 * is ook dicht.
 */
export function isGeweigerdAuthPad(pathname: string): boolean {
  let gedecodeerd: string;
  try {
    gedecodeerd = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  if (!gedecodeerd.toLowerCase().includes("organization")) return false;
  if (!pathname.startsWith(`${BASIS}/`)) return true;
  return !TOEGELATEN_ORGANISATIEPADEN.has(pathname.slice(BASIS.length));
}
