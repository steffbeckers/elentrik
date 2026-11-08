import type { Node } from "@elentrik/model";
import { tekenAutomaat, tekenDifferentieel, tekenZekering } from "./beveiliging";
import { tekenLeiding, tekenVerdeelbord } from "./leiding";
import { tekenContactdoos, tekenLichtpunt, tekenSchakelaar, tekenToestel } from "./punten";
import type { Symbool } from "./types";
import { tekenAansluiting, tekenTeller, tekenAarding } from "./voeding";

export type SymboolOpties = {
  /**
   * De node is het laatste punt: er loopt geen leiding verder naar een volgend punt. De
   * contactdoos en het lichtpunt laten de lijn dan in het symbool stoppen in plaats van door
   * te lopen tot `uit`.
   */
  einde?: boolean;
};

/**
 * Tekent het symbool van een node. Uitputtende `switch`: een nieuw nodetype geeft een
 * compilatiefout.
 */
export function tekenSymbool(node: Node, opties: SymboolOpties = {}): Symbool {
  switch (node.type) {
    case "aansluiting":
      return tekenAansluiting(node);
    case "teller":
      return tekenTeller(node);
    case "aardelektrode":
    case "aardingsonderbreker":
      return tekenAarding(node);
    case "differentieel":
      return tekenDifferentieel(node);
    case "automaat":
      return tekenAutomaat(node);
    case "zekering":
      return tekenZekering(node);
    case "verdeelbord":
      return tekenVerdeelbord(node);
    case "leiding":
      return tekenLeiding(node);
    case "contactdoos":
      return tekenContactdoos(node, false, opties.einde ?? false);
    case "lichtpunt":
      return tekenLichtpunt(node, false, opties.einde ?? false);
    case "schakelaar":
      return tekenSchakelaar(node);
    case "toestel":
      return tekenToestel(node);
    default: {
      const onbekend: never = node;
      throw new Error(`Onbekend nodetype: ${JSON.stringify(onbekend)}`);
    }
  }
}
