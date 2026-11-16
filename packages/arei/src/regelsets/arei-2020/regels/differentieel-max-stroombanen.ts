import type { NodeId } from "@elentrik/model";
import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.differentieel.max-stroombanen";

/**
 * Achter elk differentieel van maximaal 30 mA zitten hoogstens 8 eindstroombanen (Boek 1,
 * 4.2.4.3, sinds 1 juni 2023). Een kring zit achter het dichtstbijzijnde differentieel boven
 * zijn beveiliging; het algemene differentieel telt nooit mee.
 * Herkomst: de toelichting van het sectorkenniscentrum bij de wijzigingen van 1 juni 2023
 * (elektricien-review van 16 november 2026); nog niet nagekeken tegen de tekst zelf.
 */
export function maakRegelDifferentieelMaxStroombanen(p: Arei2020Parameters): Regel {
  const max = p.maxStroombanenPerDifferentieel;

  return {
    id: ID,
    artikel: "4.2.4.3",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.overschreden`, `${ID}.context`],
    check(analyse, doc) {
      const kringenPerDifferentieel = new Map<NodeId, number>();
      for (const kring of analyse.kringen) {
        const id = kring.differentielen[0];
        if (id === undefined || id === analyse.algemeenDifferentieelId) continue;
        kringenPerDifferentieel.set(id, (kringenPerDifferentieel.get(id) ?? 0) + 1);
      }

      const nieuw = doc.meta.installatieContext === "nieuw";
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const [id, aantal] of kringenPerDifferentieel) {
        if (aantal <= max) continue;
        const node = doc.nodes[id];
        if (node?.type !== "differentieel" || node.gevoeligheid_mA > p.aanvullendDifferentieelMax_mA) continue;
        bevindingen.push({
          regelId: ID,
          ernst: nieuw ? "fout" : "waarschuwing",
          nodeIds: [id],
          berichtSleutel: `${ID}.${nieuw ? "overschreden" : "context"}`,
          parameters: { gevoeligheid: node.gevoeligheid_mA, aantal, max },
        });
      }
      return bevindingen;
    },
  };
}
