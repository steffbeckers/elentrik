// Pure logica van de exportdialoog. Expliciete imports, geen Nuxt-auto-imports: Vitest
// importeert deze module rechtstreeks (ruling E1).
import type { Bevinding } from "@elentrik/arei";
import type { AutosaveStatus } from "../composables/useAutosave";

/** Exporteren mag alleen als de server de laatste wijziging heeft: de PDF komt uit het opgeslagen document. */
export function magExporteren(status: AutosaveStatus): boolean {
  return status === "opgeslagen";
}

/**
 * Het standaardlabel van de volgende export: "V{n+1}", met n het aantal eerdere exports. Is dat aantal
 * onbekend (`null`: de lijst kon niet geladen worden), dan geen voorstel: een gok als "V1" kan een
 * bestaande versie herhalen. Het lege label blokkeert de export tot de gebruiker het zelf invult.
 */
export function volgendVersieLabel(aantalExports: number | null): string {
  return aantalExports === null ? "" : `V${aantalExports + 1}`;
}

/** Het aantal fouten die niet afgeweken zijn; zijn er zulke fouten, dan komt de bijlage verplicht mee. */
export function onopgelosteFouten(bevindingen: readonly Bevinding[]): number {
  return bevindingen.filter((b) => b.ernst === "fout" && !b.afgeweken).length;
}
