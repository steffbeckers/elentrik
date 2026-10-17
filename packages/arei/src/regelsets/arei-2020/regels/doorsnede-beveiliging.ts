import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.doorsnede-beveiliging";

/** Regel 3: de beveiliging van een kring is niet hoger dan de kleinste leidingdoorsnede toelaat. */
export function maakRegelDoorsnedeBeveiliging(p: Arei2020Parameters): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.te-hoog`, `${ID}.onbekende-doorsnede`],
    check(analyse, doc) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const kring of analyse.kringen) {
        const doorsnede = kring.minDoorsnede_mm2;
        if (doorsnede === null) continue;
        const beveiliging = doc.nodes[kring.beveiligingId];
        if (beveiliging === undefined || !("nominaal_A" in beveiliging)) continue;

        const rij = p.maxStroomPerDoorsnede.find(([mm2]) => mm2 === doorsnede);
        if (rij === undefined) {
          bevindingen.push({
            regelId: ID,
            ernst: "waarschuwing",
            nodeIds: [kring.beveiligingId],
            berichtSleutel: `${ID}.onbekende-doorsnede`,
            parameters: { doorsnede },
          });
        } else if (beveiliging.nominaal_A > rij[1]) {
          bevindingen.push({
            regelId: ID,
            ernst: "fout",
            nodeIds: [kring.beveiligingId],
            berichtSleutel: `${ID}.te-hoog`,
            parameters: { nominaal: beveiliging.nominaal_A, doorsnede, max: rij[1] },
          });
        }
      }
      return bevindingen;
    },
  };
}
