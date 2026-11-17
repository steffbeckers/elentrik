// Pure plaatsbepaling van de actiebalk bij de selectie in het eendraadschema; expliciete imports (ruling E1).
import type { Afmeting, Weergave } from "./weergave";

/** Een vak in inhoudseenheden (mm in het schema). */
export type Rechthoek = { x: number; y: number; breedte: number; hoogte: number };

/** Linkerbovenhoek van de balk in schermpixels van het venster. `bijSelectie` is false als de selectie buiten beeld valt. */
export type BalkPlaats = { x: number; y: number; bijSelectie: boolean };

/** Zijde van één knop en de binnenrand van de balk, in px. Vast, zodat de plaats zonder meten te berekenen is. */
export const ACTIEBALK_KNOP_PX = 40;
const BINNENRAND_PX = 4;
/** Afstand tot de rand van het venster, in px. */
export const ACTIEBALK_RAND_PX = 8;
/** Ruimte onderaan voor de zoomknoppen van het canvas, in px. */
const ONDERRAND_PX = 56;
/**
 * De balk staat naast het onderdeel en niet erboven of eronder: zo blijven de buren in dezelfde
 * kring aanklikbaar. Hij begint minstens 3 mm voorbij de rand van de selectie (voorbij de markering
 * in de hoek), bij voorkeur een halve kolom (12 mm) van het midden, maar eindigt waar het symbool
 * van de volgende kolom kan beginnen: de kolommen liggen 24 mm uit elkaar en een symbool is
 * hoogstens 20 mm breed, dus 14 mm van het midden. Is het schema ver uitgezoomd, dan wint de
 * afstand tot het eigen onderdeel.
 */
const NAAST_RAND_MM = 3;
const HALVE_KOLOM_MM = 12;
const VOLGENDE_KOLOM_MM = 14;

/** De afmeting van een verticale balk met `knoppen` knoppen. */
export function actiebalkAfmeting(knoppen: number): Afmeting {
  return { breedte: ACTIEBALK_KNOP_PX + 2 * BINNENRAND_PX, hoogte: knoppen * ACTIEBALK_KNOP_PX + 2 * BINNENRAND_PX };
}

const klem = (waarde: number, min: number, max: number): number => Math.min(Math.max(waarde, min), Math.max(min, max));

/**
 * Waar de actiebalk komt: rechts naast de geselecteerde vakken, of links als er rechts geen plaats
 * is, en altijd binnen het venster. Valt de selectie buiten beeld, dan staat de balk vast
 * linksboven, zodat de acties bereikbaar blijven. Null zonder selectie of zolang het venster geen
 * afmeting heeft.
 */
export function actiebalkPlaats(
  vakken: readonly Rechthoek[],
  weergave: Weergave,
  venster: Afmeting,
  balk: Afmeting,
): BalkPlaats | null {
  if (vakken.length === 0 || venster.breedte === 0 || venster.hoogte === 0 || weergave.b <= 0) return null;
  // De weergave heeft de verhouding van het venster: één schaal voor beide assen.
  const schaal = venster.breedte / weergave.b;
  const links = Math.min(...vakken.map((v) => v.x));
  const rechts = Math.max(...vakken.map((v) => v.x + v.breedte));
  const boven = Math.min(...vakken.map((v) => v.y));
  const onder = Math.max(...vakken.map((v) => v.y + v.hoogte));
  const px = (x: number): number => (x - weergave.x) * schaal;
  const py = (y: number): number => (y - weergave.y) * schaal;

  const inBeeld = px(rechts) > 0 && px(links) < venster.breedte && py(onder) > 0 && py(boven) < venster.hoogte;
  if (!inBeeld) return { x: ACTIEBALK_RAND_PX, y: ACTIEBALK_RAND_PX, bijSelectie: false };

  const midden = (links + rechts) / 2;
  const maxX = venster.breedte - balk.breedte - ACTIEBALK_RAND_PX;
  let x = Math.max(
    px(rechts + NAAST_RAND_MM),
    Math.min(px(midden + HALVE_KOLOM_MM), px(midden + VOLGENDE_KOLOM_MM) - balk.breedte),
  );
  if (x > maxX) {
    // Geen plaats rechts: gespiegeld aan de linkerkant, of anders tegen de rechterrand.
    const linksErvan = px(links - NAAST_RAND_MM) - balk.breedte;
    x = linksErvan >= ACTIEBALK_RAND_PX ? linksErvan : maxX;
  }
  return {
    x: Math.round(klem(x, ACTIEBALK_RAND_PX, maxX)),
    y: Math.round(klem(py(boven), ACTIEBALK_RAND_PX, venster.hoogte - balk.hoogte - ONDERRAND_PX)),
    bijSelectie: true,
  };
}
