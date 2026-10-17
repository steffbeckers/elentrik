import type { Bevinding, Regel } from "../../../types";

const ID = "arei.punt.zonder-beveiliging";

/** Regel 10: elk punt dat niet achter een kringbeveiliging in een verdeelbord hangt, krijgt een fout. */
export function maakRegelPuntZonderBeveiliging(): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.ontbreekt`],
    check(analyse) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const id of analyse.zonderKring) {
        bevindingen.push({
          regelId: ID,
          ernst: "fout",
          nodeIds: [id],
          berichtSleutel: `${ID}.ontbreekt`,
          parameters: {},
        });
      }
      return bevindingen;
    },
  };
}
