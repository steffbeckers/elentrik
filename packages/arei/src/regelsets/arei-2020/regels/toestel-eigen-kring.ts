import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.toestel.eigen-kring";

/** Regel 6: bepaalde toestellen hebben een eigen kring en delen die met geen enkel ander punt (schakelaars niet meegerekend). */
export function maakRegelToestelEigenKring(p: Arei2020Parameters): Regel {
  const eigenKring: readonly string[] = p.toestellenEigenKring;

  return {
    id: ID,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.gedeeld`],
    check(analyse, doc) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const kring of analyse.kringen) {
        if (kring.puntIds.length < 2) continue;
        for (const puntId of kring.puntIds) {
          const punt = doc.nodes[puntId];
          if (punt?.type !== "toestel" || !eigenKring.includes(punt.soort)) continue;
          // Een schakelaar bedient het toestel en voedt niets: die telt niet als ander punt.
          const anderen = kring.puntIds.filter((id) => id !== puntId && doc.nodes[id]?.type !== "schakelaar");
          if (anderen.length === 0) continue;
          bevindingen.push({
            regelId: ID,
            ernst: "fout",
            nodeIds: [puntId, ...anderen],
            berichtSleutel: `${ID}.gedeeld`,
            parameters: { kring: kring.label, toestel: punt.soort },
          });
        }
      }
      return bevindingen;
    },
  };
}
