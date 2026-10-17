import type { Bevinding, Regel } from "../../../types";
import type { Arei2020Parameters } from "../parameters";

const ID = "arei.kring.max-contactdozen";

/** Regel 4: een kring heeft niet meer contactdozen dan het toegelaten maximum. */
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
        const aantal = kring.tellingen.contactdozen;
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
