import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.kring.min-doorsnede";

/** Regel 5: de kleinste leidingdoorsnede van een kring haalt het minimum voor contactdozen of verlichting. */
export function maakRegelMinDoorsnede(p: Arei2020Parameters): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.contactdozen`, `${ID}.verlichting`],
    check(analyse) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const kring of analyse.kringen) {
        const doorsnede = kring.minDoorsnede_mm2;
        if (doorsnede === null) continue;

        let soort: "contactdozen" | "verlichting" | null = null;
        let min = 0;
        if (kring.tellingen.contactdozen > 0) {
          if (doorsnede < p.minDoorsnedeContactdozen_mm2) {
            soort = "contactdozen";
            min = p.minDoorsnedeContactdozen_mm2;
          }
        } else if (kring.tellingen.lichtpunten > 0 && doorsnede < p.minDoorsnedeVerlichting_mm2) {
          soort = "verlichting";
          min = p.minDoorsnedeVerlichting_mm2;
        }
        if (soort === null) continue;

        bevindingen.push({
          regelId: ID,
          ernst: "fout",
          nodeIds: [kring.beveiligingId],
          berichtSleutel: `${ID}.${soort}`,
          parameters: { kring: kring.label, doorsnede, min },
        });
      }
      return bevindingen;
    },
  };
}
