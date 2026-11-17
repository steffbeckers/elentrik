import type { NodeId } from "@elentrik/model";
import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.laadpaal.differentieel";

/**
 * Een laadpaal hangt achter een eigen differentieel van maximaal 30 mA (het algemene telt niet),
 * van het type B of, bij een ander type, met DC-detectie van maximaal 6 mA in de laadpaal. Zonder
 * zo'n differentieel is het een fout; met een differentieel maar zonder type B of DC-detectie een
 * waarschuwing, omdat de detectie ook in het toestel kan zitten zonder dat ze ingevuld is.
 * Herkomst: vakkennis uit de elektricien-review van 16 november 2026; het ontwerp noemt geen
 * artikel en de regel is nog niet nagekeken tegen de tekst.
 */
export function maakRegelLaadpaalDifferentieel(p: Arei2020Parameters): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.ontbreekt`, `${ID}.type`],
    check(analyse, doc) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const [puntId, keten] of Object.entries(analyse.ketens)) {
        const punt = doc.nodes[puntId];
        if (punt?.type !== "toestel" || punt.soort !== "laadpaal") continue;

        let differentieelId: NodeId | undefined;
        let typeB = false;
        for (const id of keten.differentielen) {
          const diff = doc.nodes[id];
          if (id === analyse.algemeenDifferentieelId || diff?.type !== "differentieel") continue;
          if (diff.gevoeligheid_mA > p.laadpaalDifferentieelMax_mA) continue;
          differentieelId ??= id;
          if (diff.klasse === "B") typeB = true;
        }

        if (differentieelId === undefined) {
          bevindingen.push({
            regelId: ID,
            ernst: "fout",
            nodeIds: [puntId],
            berichtSleutel: `${ID}.ontbreekt`,
            parameters: { max: p.laadpaalDifferentieelMax_mA },
          });
        } else if (!typeB && !(punt.dcDetectie_mA !== undefined && punt.dcDetectie_mA <= p.laadpaalDcDetectieMax_mA)) {
          bevindingen.push({
            regelId: ID,
            ernst: "waarschuwing",
            nodeIds: [puntId, differentieelId],
            berichtSleutel: `${ID}.type`,
            parameters: { max: p.laadpaalDcDetectieMax_mA },
          });
        }
      }
      return bevindingen;
    },
  };
}
