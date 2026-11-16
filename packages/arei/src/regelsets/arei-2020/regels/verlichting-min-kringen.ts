import type { Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.verlichting.min-kringen";

/**
 * De verlichting is over minstens twee kringen verdeeld, zodat niet alle lichtpunten samen
 * uitvallen. Eén melding voor de installatie, op de kring die alle lichtpunten draagt.
 * Herkomst: vakkennis uit de elektricien-review van 16 november 2026, nog te toetsen aan de tekst
 * van het AREI; daarom een waarschuwing zonder artikel.
 */
export function maakRegelVerlichtingMinKringen(p: Arei2020Parameters): Regel {
  const min = p.minKringenVerlichting;

  return {
    id: ID,
    artikel: "",
    ernst: "waarschuwing",
    nagekeken: false,
    berichtSleutels: [`${ID}.een-kring`],
    check(analyse) {
      const metVerlichting = analyse.kringen.filter((kring) => kring.tellingen.lichtpunten > 0);
      const eerste = metVerlichting[0];
      if (eerste === undefined || metVerlichting.length >= min) return [];
      return [
        {
          regelId: ID,
          ernst: "waarschuwing",
          nodeIds: [eerste.beveiligingId],
          berichtSleutel: `${ID}.een-kring`,
          parameters: { kring: eerste.label, min },
        },
      ];
    },
  };
}
