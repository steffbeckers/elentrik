import type { Bevinding, Regel } from "../../../types";

const ID = "arei.leiding.onvolledig";

/** Regel 9: een leiding zonder kabeltype of zonder doorsnede is nog niet volledig ingevuld. */
export function maakRegelLeidingOnvolledig(): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "info",
    nagekeken: false,
    berichtSleutels: [`${ID}.kabeltype`, `${ID}.doorsnede`],
    check(_analyse, doc) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const id of Object.keys(doc.nodes)) {
        const node = doc.nodes[id];
        if (node?.type !== "leiding") continue;
        if (node.kabeltype.trim() === "") {
          bevindingen.push({
            regelId: ID,
            ernst: "info",
            nodeIds: [id],
            berichtSleutel: `${ID}.kabeltype`,
            parameters: {},
          });
        }
        if (node.doorsnede_mm2 === 0) {
          bevindingen.push({
            regelId: ID,
            ernst: "info",
            nodeIds: [id],
            berichtSleutel: `${ID}.doorsnede`,
            parameters: {},
          });
        }
      }
      return bevindingen;
    },
  };
}
