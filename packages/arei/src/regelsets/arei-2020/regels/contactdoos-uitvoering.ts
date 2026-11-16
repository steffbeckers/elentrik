import type { Bevinding, Regel } from "../../../types";

const ID = "arei.contactdoos.uitvoering";

/**
 * In een nieuwe installatie heeft elke contactdoos een randaarde en kinderbeveiliging. Voor een
 * bestaande of onbekende installatie zwijgt de regel: oudere contactdozen zonder zijn daar gewoon.
 * Herkomst: vakkennis uit de elektricien-review van 16 november 2026; het ontwerp noemt geen
 * artikel en de regel is nog niet nagekeken tegen de tekst.
 */
export function maakRegelContactdoosUitvoering(): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "waarschuwing",
    nagekeken: false,
    berichtSleutels: [`${ID}.randaarde`, `${ID}.kinderbeveiliging`],
    check(analyse, doc) {
      if (doc.meta.installatieContext !== "nieuw") return [];
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const id of Object.keys(analyse.ketens)) {
        const node = doc.nodes[id];
        if (node?.type !== "contactdoos") continue;
        for (const gebrek of ["randaarde", "kinderbeveiliging"] as const) {
          if (node[gebrek]) continue;
          bevindingen.push({
            regelId: ID,
            ernst: "waarschuwing",
            nodeIds: [id],
            berichtSleutel: `${ID}.${gebrek}`,
            parameters: {},
          });
        }
      }
      return bevindingen;
    },
  };
}
