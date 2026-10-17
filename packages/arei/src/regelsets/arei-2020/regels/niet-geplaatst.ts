import type { Bevinding, Regel } from "../../../types";

const ID = "arei.situatie.niet-geplaatst";

/** Regel 8: elk punt dat nog op geen enkele situatiepagina geplaatst is, krijgt een melding. */
export function maakRegelNietGeplaatst(): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "info",
    nagekeken: false,
    berichtSleutels: [`${ID}.punt`],
    check(analyse) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const id of analyse.nietGeplaatst) {
        bevindingen.push({
          regelId: ID,
          ernst: "info",
          nodeIds: [id],
          berichtSleutel: `${ID}.punt`,
          parameters: { label: analyse.puntLabels[id] ?? "?" },
        });
      }
      return bevindingen;
    },
  };
}
