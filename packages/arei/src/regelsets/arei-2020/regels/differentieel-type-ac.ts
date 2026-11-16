import type { Bevinding, Regel } from "../../../types";

const ID = "arei.differentieel.type-ac";

/**
 * Een differentieel van het type AC is niet meer toegelaten (Boek 1, 4.2.4.3); het model laat de
 * klasse nog toe om bestaande installaties te kunnen tekenen. Geldt ook voor het algemene differentieel.
 * Herkomst: elektricien-review van 16 november 2026; het artikelnummer is afgeleid uit de
 * toelichting bij 4.2.4.3 en nog niet nagekeken tegen de tekst zelf.
 */
export function maakRegelDifferentieelTypeAc(): Regel {
  return {
    id: ID,
    artikel: "4.2.4.3",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.niet-toegelaten`, `${ID}.context`],
    check(_analyse, doc) {
      const nieuw = doc.meta.installatieContext === "nieuw";
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const id of Object.keys(doc.nodes)) {
        const node = doc.nodes[id];
        if (node?.type !== "differentieel" || node.klasse !== "AC") continue;
        bevindingen.push({
          regelId: ID,
          ernst: nieuw ? "fout" : "waarschuwing",
          nodeIds: [id],
          berichtSleutel: `${ID}.${nieuw ? "niet-toegelaten" : "context"}`,
          parameters: {},
        });
      }
      return bevindingen;
    },
  };
}
