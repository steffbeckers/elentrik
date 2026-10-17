import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.polen.stroomtype";

/** Regel 7: het aantal polen van de beveiligingen past bij het stroomtype van de voeding. */
export function maakRegelPolenStroomtype(p: Arei2020Parameters): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.algemeen`, `${ID}.te-veel`],
    check(analyse, doc) {
      const stroomtype = doc.voeding.stroomtype;
      const verwacht = p.polenPerStroomtype[stroomtype];
      const algemeenId = analyse.algemeenDifferentieelId;
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];

      for (const id of Object.keys(doc.nodes)) {
        const node = doc.nodes[id];
        if (node?.type !== "automaat" && node?.type !== "differentieel") continue;

        if (id === algemeenId) {
          if (node.polen === verwacht) continue;
          bevindingen.push({
            regelId: ID,
            ernst: "fout",
            nodeIds: [id],
            berichtSleutel: `${ID}.algemeen`,
            parameters: { polen: node.polen, verwacht, stroomtype },
          });
        } else if (stroomtype === "2x230V" && node.polen > 2) {
          bevindingen.push({
            regelId: ID,
            ernst: "fout",
            nodeIds: [id],
            berichtSleutel: `${ID}.te-veel`,
            parameters: { polen: node.polen, stroomtype },
          });
        }
      }
      return bevindingen;
    },
  };
}
