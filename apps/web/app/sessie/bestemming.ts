// Waar een navigatie naartoe moet, los van Nuxt: de globale middleware `aangemeld` roept
// `bestemming` aan met de route en de sessie uit de sessie-store.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

/** De pagina's die zonder sessie bereikbaar zijn; al de rest vraagt een sessie. */
const PUBLIEKE_PADEN = new Set(["/inloggen", "/registreren", "/wachtwoord-vergeten", "/wachtwoord-herstellen"]);

/** `/uitnodiging/<token>`: precies één niet-leeg segment na `/uitnodiging/`. */
const UITNODIGING = /^\/uitnodiging\/[^/]+$/;

/** De pagina voor een ingelogde gebruiker zonder organisatie. */
export const GEEN_ORGANISATIE = "/geen-organisatie";

/** Hoogstens zo lang mag een terugkeer-URL zijn. */
const MAX_TERUG = 2000;

/** Een pad dat zonder sessie bereikbaar is. Alles wat hier niet staat, vraagt een sessie. */
export function isPubliek(pad: string): boolean {
  return PUBLIEKE_PADEN.has(pad) || UITNODIGING.test(pad);
}

/**
 * De terugkeer-URL na inloggen als ze een lokaal pad is, anders null. Lokaal: begint met precies
 * één `/` (niet `//` of `/\`, wat een browser als een ander domein leest), zonder stuurtekens
 * (een browser schrapt tab en nieuwe regel, waardoor `/\t/x` toch `//x` wordt) en zonder `\`.
 */
export function veiligTerug(terug: unknown): string | null {
  if (typeof terug !== "string" || terug.length === 0 || terug.length > MAX_TERUG) return null;
  if (!terug.startsWith("/") || terug.startsWith("//")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(terug)) return null;
  return terug;
}

export type RouteInfo = { path: string; fullPath: string };

/** Wat de middleware van de sessie nodig heeft; null is niet ingelogd. */
export type SessieInfo = { actieveOrganisatieId: string | null } | null;

/**
 * De doorverwijzing voor een navigatie, of null als de pagina mag:
 * - een publieke pagina mag altijd;
 * - zonder sessie: naar `/inloggen`, met de gevraagde pagina als `terug`;
 * - een sessie zonder organisatie: naar `/geen-organisatie`.
 * `/geen-organisatie` zelf mag ook met een organisatie: daar maak je een bijkomend bedrijf aan.
 */
export function bestemming(route: RouteInfo, sessie: SessieInfo): string | null {
  if (isPubliek(route.path)) return null;
  if (sessie === null) {
    if (route.fullPath === "/") return "/inloggen";
    return `/inloggen?terug=${encodeURIComponent(route.fullPath)}`;
  }
  if (sessie.actieveOrganisatieId === null && route.path !== GEEN_ORGANISATIE) return GEEN_ORGANISATIE;
  return null;
}
