// Puur, met expliciete imports (ruling E1): de schaal van een pagina uit een gemeten afstand.
import { LOCALES, type Taal } from "../../shared/taal";

/** Beduidende cijfers in "Schaal: 1 px = … mm". */
const BEDUIDENDE_CIJFERS = 3;

// Grote waarden houden hun eenheden: "morePrecision" kiest de preciezere van beide afrondingen.
// Eén formatter per taal, pas aangemaakt bij het eerste gebruik.
const OPMAAK = new Map<Taal, Intl.NumberFormat>();

function opmaak(taal: Taal): Intl.NumberFormat {
  let formaat = OPMAAK.get(taal);
  if (!formaat) {
    formaat = new Intl.NumberFormat(LOCALES[taal], {
      maximumSignificantDigits: BEDUIDENDE_CIJFERS,
      maximumFractionDigits: 0,
      roundingPriority: "morePrecision",
    });
    OPMAAK.set(taal, formaat);
  }
  return formaat;
}

/**
 * `mmPerPx = afstand_mm / afstand_px` (spec §4.7). Een afstand van 0 of minder, geen eindig getal
 * of een meting van 0 pixels geeft `undefined`.
 */
export function berekenMmPerPx(afstand_mm: number, afstand_px: number): number | undefined {
  if (!Number.isFinite(afstand_mm) || afstand_mm <= 0) return undefined;
  if (!Number.isFinite(afstand_px) || afstand_px <= 0) return undefined;
  return afstand_mm / afstand_px;
}

/**
 * Een schaal in mm per pixel in de notatie van de taal: drie beduidende cijfers, maar een waarde
 * vanaf 1.000 wordt op een geheel getal afgerond in plaats van op tientallen.
 */
export function formatteerMmPerPx(mmPerPx: number, taal: Taal): string {
  return opmaak(taal).format(mmPerPx);
}
