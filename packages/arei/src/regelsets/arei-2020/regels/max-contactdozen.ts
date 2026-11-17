import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.kring.max-contactdozen";

/**
 * Regel 4: een kring heeft niet meer contactdozen dan het toegelaten maximum. Het AREI telt
 * enkelvoudige of meervoudige contactdozen: een dubbele doos is er één. De regel telt daarom
 * de contactdoos-onderdelen en niet de som van `aantal`.
 */
export function maakRegelMaxContactdozen(p: Arei2020Parameters): Regel {
  const max = p.maxContactdozenPerKring;

  return {
    id: ID,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [`${ID}.overschreden`],
    check(analyse) {
      const bevindingen: Omit<Bevinding, "afgeweken">[] = [];
      for (const kring of analyse.kringen) {
        const aantal = kring.tellingen.contactdoosPunten;
        if (aantal <= max) continue;
        bevindingen.push({
          regelId: ID,
          ernst: "fout",
          nodeIds: [kring.beveiligingId],
          berichtSleutel: `${ID}.overschreden`,
          parameters: { kring: kring.label, aantal, max },
        });
      }
      return bevindingen;
    },
  };
}
