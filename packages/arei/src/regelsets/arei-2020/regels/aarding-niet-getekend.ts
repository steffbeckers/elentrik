import type { Regel } from "../../../types";

const ID = "arei.aarding.niet-getekend";

/**
 * Er zijn kringen, maar het schema toont geen aardingsonderbreker of geen aardelektrode. Eén
 * melding voor de hele installatie (op de teller), als info: een bestaand dossier verliest er zijn
 * status niet door.
 * Herkomst: elektricien-review van 16 november 2026; een hulp bij het tekenen, geen AREI-toets.
 */
export function maakRegelAardingNietGetekend(): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "info",
    nagekeken: false,
    berichtSleutels: [`${ID}.beide`, `${ID}.aardingsonderbreker`, `${ID}.aardelektrode`],
    check(analyse, doc) {
      if (analyse.kringen.length === 0) return [];
      let onderbreker = false;
      let elektrode = false;
      for (const id of Object.keys(doc.nodes)) {
        const type = doc.nodes[id]?.type;
        if (type === "aardingsonderbreker") onderbreker = true;
        else if (type === "aardelektrode") elektrode = true;
      }
      if (onderbreker && elektrode) return [];
      const ontbreekt = onderbreker ? "aardelektrode" : elektrode ? "aardingsonderbreker" : "beide";
      return [
        {
          regelId: ID,
          ernst: "info",
          nodeIds: [analyse.tellerId ?? doc.rootId],
          berichtSleutel: `${ID}.${ontbreekt}`,
          parameters: {},
        },
      ];
    },
  };
}
