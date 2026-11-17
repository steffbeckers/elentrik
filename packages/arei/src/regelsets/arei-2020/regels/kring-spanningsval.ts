import type { InstallatieDocument, NodeId } from "@elentrik/model";
import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.kring.spanningsval";

/** Totale lengte en kleinste doorsnede van de leidingen; null zodra één leiding geen lengte of doorsnede heeft. */
function trace(
  doc: InstallatieDocument,
  leidingIds: readonly NodeId[],
): { lengte_m: number; doorsnede_mm2: number } | null {
  if (leidingIds.length === 0) return null;
  let lengte_m = 0;
  let doorsnede_mm2 = Infinity;
  for (const id of leidingIds) {
    const leiding = doc.nodes[id];
    // Een doorsnede van 0 betekent "niet ingevuld".
    if (leiding?.type !== "leiding" || leiding.lengte_m === undefined || leiding.doorsnede_mm2 <= 0) return null;
    lengte_m += leiding.lengte_m;
    if (leiding.doorsnede_mm2 < doorsnede_mm2) doorsnede_mm2 = leiding.doorsnede_mm2;
  }
  return { lengte_m, doorsnede_mm2 };
}

/**
 * Schat de spanningsval van een kring: ΔU = k · L · In · ρ / S, met L de som van de lengtes van
 * alle leidingen van de kring, S de kleinste doorsnede, In de nominale stroom van de
 * kringbeveiliging en k = 2 (tweepolig) of √3 (drie- of vierpolig). De waarde staat tegenover
 * 230 V, of 400 V voor een drie- of vierpolige kring op 3N400V. Een zekering heeft geen polen in
 * het model en rekent tweepolig.
 * De regel werkt alleen als elke leiding van de kring een lengte en een doorsnede heeft, en meldt
 * alleen een waarde boven de richtwaarde (3 % voor een kring met alleen verlichting, anders 5 %).
 * Herkomst: elektricien-review van 16 november 2026. Een richtwaarde uit de praktijk, geen
 * AREI-eis: daarom info en geen artikel.
 */
export function maakRegelKringSpanningsval(p: Arei2020Parameters): Regel {
  return {
    id: ID,
    artikel: "",
    ernst: "info",
    nagekeken: false,
    berichtSleutels: [`${ID}.te-hoog`],
    check(analyse, doc) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const kring of analyse.kringen) {
        const beveiliging = doc.nodes[kring.beveiligingId];
        if (beveiliging?.type !== "automaat" && beveiliging?.type !== "zekering") continue;
        const leidingen = trace(doc, kring.leidingIds);
        if (leidingen === null) continue;

        const driefasig = beveiliging.type === "automaat" && beveiliging.polen >= 3;
        const k = driefasig ? Math.sqrt(3) : 2;
        const spanning_V = driefasig && doc.voeding.stroomtype === "3N400V" ? 400 : 230;
        const val_V =
          (k * leidingen.lengte_m * beveiliging.nominaal_A * p.soortelijkeWeerstandKoper_ohm_mm2_per_m) /
          leidingen.doorsnede_mm2;
        // Eén decimaal, zodat de melding nooit een waarde toont die gelijk is aan de richtwaarde.
        const spanningsval = Math.round((val_V / spanning_V) * 1000) / 10;

        const { lichtpunten, contactdoosPunten, toestellen } = kring.tellingen;
        const alleenVerlichting = lichtpunten > 0 && contactdoosPunten === 0 && toestellen === 0;
        const max = alleenVerlichting ? p.maxSpanningsvalVerlichting_pct : p.maxSpanningsval_pct;
        if (spanningsval <= max) continue;

        bevindingen.push({
          regelId: ID,
          ernst: "info",
          nodeIds: [kring.beveiligingId],
          berichtSleutel: `${ID}.te-hoog`,
          parameters: { kring: kring.label, spanningsval, max },
        });
      }
      return bevindingen;
    },
  };
}
