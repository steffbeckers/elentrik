import type { Bevinding, Regel } from "../../../types";

const ID = "arei.differentieel.aanvullend";

/** Boek 1, 4.2.4.3 b: gewone contactdozen en verlichting. Oudere delen
 * vragen een afzonderlijke beoordeling van de overgangsbepalingen.
 * Bron: https://economie.fgov.be/nl/publicaties/algemeen-reglement-op-de
 * Deze aanvullende controle maakt de voorlopige regelset niet volledig. */
export function maakRegelAanvullendeDifferentieel(): Regel {
  return {
    id: ID,
    artikel: "4.2.4.3 b",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.ontbreekt`, `${ID}.context`],
    check(analyse, doc) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const [id, keten] of Object.entries(analyse.ketens)) {
        const node = doc.nodes[id];
        if (node?.type !== "contactdoos" && node?.type !== "lichtpunt") continue;
        // De bestaande natte-ruimteregel geeft hier reeds een gerichte fout.
        if (node.ruimte === "badkamer" || node.ruimte === "wasplaats") continue;
        if (keten.differentielen.some(diffId => {
          const diff = doc.nodes[diffId];
          return diffId !== analyse.algemeenDifferentieelId
            && diff?.type === "differentieel" && diff.gevoeligheid_mA <= 30;
        })) continue;
        const nieuw = doc.meta.installatieContext === "nieuw";
        bevindingen.push({ regelId: ID, ernst: nieuw ? "fout" : "waarschuwing", nodeIds: [id],
          berichtSleutel: `${ID}.${nieuw ? "ontbreekt" : "context"}`, parameters: {} });
      }
      return bevindingen;
    },
  };
}
