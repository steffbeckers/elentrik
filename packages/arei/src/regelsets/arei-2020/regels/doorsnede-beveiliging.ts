import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.kring.doorsnede-beveiliging";

/**
 * Regel 3: de beveiliging van een kring is niet hoger dan de kleinste leidingdoorsnede toelaat.
 * Boek 1, 4.4.1.5, tabel 1 geeft per doorsnede een grens voor een smeltveiligheid en een hogere
 * voor een automaat. Herkomst: de toelichting van het sectorkenniscentrum bij de kabelberekening
 * (elektricien-review van 16 november 2026); nog niet nagekeken tegen de tekst zelf.
 */
export function maakRegelDoorsnedeBeveiliging(p: Arei2020Parameters): Regel {
  return {
    id: ID,
    artikel: "4.4.1.5",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.te-hoog-automaat`, `${ID}.te-hoog-zekering`, `${ID}.onbekende-doorsnede`],
    check(analyse, doc) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const kring of analyse.kringen) {
        const doorsnede = kring.minDoorsnede_mm2;
        if (doorsnede === null) continue;
        const beveiliging = doc.nodes[kring.beveiligingId];
        if (beveiliging === undefined || (beveiliging.type !== "automaat" && beveiliging.type !== "zekering")) continue;

        const rij = p.maxStroomPerDoorsnede.find(([mm2]) => mm2 === doorsnede);
        if (rij === undefined) {
          bevindingen.push({
            regelId: ID,
            ernst: "waarschuwing",
            nodeIds: [kring.beveiligingId],
            berichtSleutel: `${ID}.onbekende-doorsnede`,
            parameters: { doorsnede },
          });
          continue;
        }
        const max = beveiliging.type === "zekering" ? rij[1] : rij[2];
        if (beveiliging.nominaal_A <= max) continue;
        bevindingen.push({
          regelId: ID,
          ernst: "fout",
          nodeIds: [kring.beveiligingId],
          berichtSleutel: `${ID}.te-hoog-${beveiliging.type}`,
          parameters: { nominaal: beveiliging.nominaal_A, doorsnede, max },
        });
      }
      return bevindingen;
    },
  };
}
