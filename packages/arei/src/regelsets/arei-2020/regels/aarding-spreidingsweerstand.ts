import type { NodeId } from "@elentrik/model";
import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.aarding.spreidingsweerstand";

/**
 * Ligt de geregistreerde spreidingsweerstand van de aarding boven 30 Ω, dan gelden zwaardere eisen
 * (Boek 1, 4.2.4.3): minstens twee differentiëlen van maximaal 30 mA, elk met hoogstens 16
 * contactdozen (een vast toestel telt als één), en elke andere kring achter een differentieel van
 * maximaal 100 mA naast het algemene. De regel beoordeelt de meting zelf niet; zonder ingevulde
 * waarde doet hij niets.
 * Een kring zit achter het dichtstbijzijnde differentieel boven zijn beveiliging; het algemene
 * differentieel telt nooit mee. Een kring zonder punten voedt niets, of een onderbord waarvan de
 * kringen apart beoordeeld worden.
 * Herkomst: de toelichting van het sectorkenniscentrum bij 4.2.4.3 (elektricien-review van
 * 16 november 2026); nog niet nagekeken tegen de tekst zelf.
 */
export function maakRegelAardingSpreidingsweerstand(p: Arei2020Parameters): Regel {
  return {
    id: ID,
    artikel: "4.2.4.3",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.te-weinig-differentielen`, `${ID}.te-veel-contactdozen`, `${ID}.kring-onbeschermd`],
    check(analyse, doc) {
      const weerstand = doc.meta.metingen?.aardingsweerstand_ohm;
      if (weerstand === undefined || weerstand <= p.spreidingsweerstandGrens_ohm) return [];
      if (analyse.kringen.length === 0) return [];

      const gevoeligheid = (id: NodeId): number => {
        const node = doc.nodes[id];
        return id !== analyse.algemeenDifferentieelId && node?.type === "differentieel"
          ? node.gevoeligheid_mA
          : Infinity;
      };

      const ernst = doc.meta.installatieContext === "nieuw" ? "fout" : "waarschuwing";
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      /** Per differentieel van maximaal 30 mA: het aantal contactdozen en vaste toestellen erachter. */
      const contactdozenPerDifferentieel = new Map<NodeId, number>();

      for (const kring of analyse.kringen) {
        const dichtstbij = kring.differentielen[0];
        if (dichtstbij !== undefined && gevoeligheid(dichtstbij) <= p.aanvullendDifferentieelMax_mA) {
          contactdozenPerDifferentieel.set(
            dichtstbij,
            (contactdozenPerDifferentieel.get(dichtstbij) ?? 0) +
              kring.tellingen.contactdoosPunten +
              kring.tellingen.toestellen,
          );
        }
        if (kring.puntIds.length === 0) continue;
        if (kring.differentielen.some((id) => gevoeligheid(id) <= p.overigeKringenDifferentieelMax_mA)) continue;
        bevindingen.push({
          regelId: ID,
          ernst,
          nodeIds: [kring.beveiligingId],
          berichtSleutel: `${ID}.kring-onbeschermd`,
          parameters: { kring: kring.label, max: p.overigeKringenDifferentieelMax_mA },
        });
      }

      if (contactdozenPerDifferentieel.size < p.minDifferentielenBovenGrens) {
        bevindingen.push({
          regelId: ID,
          ernst,
          nodeIds: [analyse.tellerId ?? doc.rootId],
          berichtSleutel: `${ID}.te-weinig-differentielen`,
          parameters: { aantal: contactdozenPerDifferentieel.size, min: p.minDifferentielenBovenGrens },
        });
      }
      for (const [id, aantal] of contactdozenPerDifferentieel) {
        if (aantal <= p.maxContactdozenPerDifferentieelBovenGrens) continue;
        bevindingen.push({
          regelId: ID,
          ernst,
          nodeIds: [id],
          berichtSleutel: `${ID}.te-veel-contactdozen`,
          parameters: { aantal, max: p.maxContactdozenPerDifferentieelBovenGrens },
        });
      }
      return bevindingen;
    },
  };
}
