// Waar een navigatie naartoe moet, los van Nuxt: de globale middleware `aangemeld` roept
// `bestemming` aan met de route en de sessie uit de sessie-store.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { veiligTerugpad } from "../../shared/terugpad";

/** De pagina's die zonder sessie bereikbaar zijn; al de rest vraagt een sessie. */
const PUBLIEKE_PADEN = new Set(["/inloggen", "/registreren", "/wachtwoord-vergeten", "/wachtwoord-herstellen"]);

/** `/uitnodiging/<token>`: precies één niet-leeg segment na `/uitnodiging/`. */
const UITNODIGING = /^\/uitnodiging\/[^/]+$/;

/** De pagina voor een ingelogde gebruiker zonder organisatie. */
export const GEEN_ORGANISATIE = "/geen-organisatie";

/** Een pad dat zonder sessie bereikbaar is. Alles wat hier niet staat, vraagt een sessie. */
export function isPubliek(pad: string): boolean {
  return PUBLIEKE_PADEN.has(pad) || UITNODIGING.test(pad);
}

/**
 * De terugkeer-URL na inloggen als ze een lokaal pad is, anders null (zie `veiligTerugpad`, dat ook de
 * server gebruikt voor de bestemming van een mislukte link).
 */
export function veiligTerug(terug: unknown): string | null {
  return veiligTerugpad(terug);
}

/** De parameters waarmee Better Auth een mislukte link (verlopen, al gebruikt) terugmeldt. */
const FOUTPARAMETERS = ["error", "error_description"];

/**
 * Een terugkeer-URL waarin Better Auth een mislukte link meldde (bv. een verlopen
 * bevestigingslink: `/?error=…`): of dat zo is, en het pad zonder die parameters.
 */
export function terugZonderFout(pad: string): { pad: string; fout: boolean } {
  const url = new URL(pad, "http://lokaal");
  const fout = FOUTPARAMETERS.some((naam) => url.searchParams.has(naam));
  if (!fout) return { pad, fout };
  for (const naam of FOUTPARAMETERS) url.searchParams.delete(naam);
  return { pad: `${url.pathname}${url.search}${url.hash}`, fout };
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
