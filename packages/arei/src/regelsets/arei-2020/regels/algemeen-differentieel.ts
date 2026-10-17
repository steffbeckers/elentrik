import type { Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.algemeen-differentieel";

/** Regel 1: de installatie heeft een algemeen differentieel dat niet te gevoelig is ingesteld. */
export function maakRegelAlgemeenDifferentieel(p: Arei2020Parameters): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.ontbreekt`, `${ID}.te-gevoelig-ingesteld`],
    check(analyse, doc) {
      const id = analyse.algemeenDifferentieelId;
      if (id === null) {
        if (analyse.kringen.length === 0) return [];
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
          berichtSleutel: `${ID}.te-gevoelig-ingesteld`,
          parameters: { gevoeligheid: node.gevoeligheid_mA, max: p.algemeenDifferentieelMax_mA },
        },
      ];
    },
  };
}
