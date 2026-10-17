import type { Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.differentieel.algemeen";

/** Regel 1: de installatie heeft een algemeen differentieel waarvan de gevoeligheid hoogstens het maximum is (anders is het te ongevoelig). */
export function maakRegelAlgemeenDifferentieel(p: Arei2020Parameters): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.ontbreekt`, `${ID}.te-ongevoelig`],
    check(analyse, doc) {
      const id = analyse.algemeenDifferentieelId;
      if (id === null) {
        // Zonder enig punt valt er niets te beschermen; punten zonder kring tellen wel mee.
        if (Object.keys(analyse.ketens).length === 0) return [];
        return [
          {
            regelId: ID,
            ernst: "fout",
            nodeIds: [analyse.tellerId ?? doc.rootId],
            berichtSleutel: `${ID}.ontbreekt`,
            parameters: {},
          },
        ];
      }
      const node = doc.nodes[id];
      if (node?.type !== "differentieel" || node.gevoeligheid_mA <= p.algemeenDifferentieelMax_mA) return [];
      return [
        {
          regelId: ID,
          ernst: "fout",
          nodeIds: [id],
          berichtSleutel: `${ID}.te-ongevoelig`,
          parameters: { gevoeligheid: node.gevoeligheid_mA, max: p.algemeenDifferentieelMax_mA },
        },
      ];
    },
  };
}
