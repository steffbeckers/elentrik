import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.differentieel.natte-ruimte";

/** Regel 2: punten in natte ruimtes en bepaalde toestellen hangen achter een laaggevoelig differentieel. */
export function maakRegelNatteRuimteDifferentieel(p: Arei2020Parameters): Regel {
  const natteRuimtes: readonly string[] = p.natteRuimtes;
  const laagGevoelig: readonly string[] = p.toestellenAchterLaagGevoelig;
  const max = p.natteRuimteDifferentieelMax_mA;

  return {
    id: ID,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.ontbreekt`],
    check(analyse, doc) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const [puntId, keten] of Object.entries(analyse.ketens)) {
        const punt = doc.nodes[puntId];
        if (punt === undefined) continue;
        let reden: string | null = null;
        if (punt.ruimte !== undefined && natteRuimtes.includes(punt.ruimte)) reden = punt.ruimte;
        else if (punt.type === "toestel" && laagGevoelig.includes(punt.soort)) reden = punt.soort;
        if (reden === null) continue;

        const beschermd = keten.differentielen.some((id) => {
          const diff = doc.nodes[id];
          return diff?.type === "differentieel" && diff.gevoeligheid_mA <= max;
        });
        if (beschermd) continue;
        bevindingen.push({
          regelId: ID,
          ernst: "fout",
          nodeIds: [puntId],
          berichtSleutel: `${ID}.ontbreekt`,
          parameters: { reden, max },
        });
      }
      return bevindingen;
    },
  };
}
