// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
const EENHEDEN: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

const formaat = new Intl.RelativeTimeFormat("nl-BE", { numeric: "auto", style: "short" });

/** Een tijdstip relatief tot `nu`, bv. "2 min. geleden" of "nu". */
export function relatieveTijd(iso: string, nu: Date = new Date()): string {
  const verschil = (new Date(iso).getTime() - nu.getTime()) / 1000;
  if (Number.isNaN(verschil)) return "";
  for (const [eenheid, seconden] of EENHEDEN) {
    if (Math.abs(verschil) >= seconden || eenheid === "second") {
      return formaat.format(Math.trunc(verschil / seconden), eenheid);
    }
  }
  return "";
}
