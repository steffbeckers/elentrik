// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { LOCALES, type Taal } from "../../shared/taal";

const EENHEDEN: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** Eén formatter per taal, pas aangemaakt bij het eerste gebruik. */
const FORMATEN = new Map<Taal, Intl.RelativeTimeFormat>();

function formaatVoor(taal: Taal): Intl.RelativeTimeFormat {
  let formaat = FORMATEN.get(taal);
  if (!formaat) {
    formaat = new Intl.RelativeTimeFormat(LOCALES[taal], { numeric: "auto", style: "short" });
    FORMATEN.set(taal, formaat);
  }
  return formaat;
}

/** Een tijdstip relatief tot `nu` in de taal, bv. "2 min. geleden" of "nu". */
export function relatieveTijd(iso: string, taal: Taal, nu: Date = new Date()): string {
  const formaat = formaatVoor(taal);
  const verschil = (new Date(iso).getTime() - nu.getTime()) / 1000;
  if (Number.isNaN(verschil)) return "";
  for (const [eenheid, seconden] of EENHEDEN) {
    if (Math.abs(verschil) >= seconden || eenheid === "second") {
      return formaat.format(Math.trunc(verschil / seconden), eenheid);
    }
  }
  return "";
}
