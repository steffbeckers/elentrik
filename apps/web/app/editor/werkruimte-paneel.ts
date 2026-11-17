// Puur, met expliciete imports (ruling E1): welk zijpaneel de werkruimte toont na een nieuwe selectie.

export type Paneel = "onderdelen" | "eigenschappen" | "bevindingen" | "opmaak";

/**
 * De panelen Onderdelen en Eigenschappen volgen de selectie: wie een onderdeel aanklikt, ziet zijn
 * eigenschappen; valt de selectie weg, dan staat Onderdelen er weer. Alleen die twee wisselen:
 * Bevindingen en Planopmaak blijven staan (opmaak blijft zo beschikbaar voor het volgende label),
 * en een gesloten paneel blijft gesloten, zodat een klein scherm niet bij elke tik zijn tekening
 * kwijt is.
 *
 * Een selectie die samen met een wijziging van het document komt (`documentGewijzigd`), is geen
 * keuze van de gebruiker: een toegevoegd onderdeel, een sjabloon of een punt dat op het plan gezet
 * is, wordt geselecteerd, maar wie aan het opbouwen is, houdt Onderdelen voor zich.
 *
 * `heeftOnderdelen`: het tabblad heeft een paneel Onderdelen (eendraadschema en situatieschema).
 */
export function paneelNaSelectie(
  huidig: Paneel | null,
  wijziging: { aantal: number; vorigAantal: number; documentGewijzigd: boolean; heeftOnderdelen: boolean },
): Paneel | null {
  if (wijziging.aantal === 0) {
    return wijziging.vorigAantal > 0 && huidig === "eigenschappen" && wijziging.heeftOnderdelen ? "onderdelen" : huidig;
  }
  if (wijziging.documentGewijzigd) return huidig;
  return huidig === "onderdelen" ? "eigenschappen" : huidig;
}
