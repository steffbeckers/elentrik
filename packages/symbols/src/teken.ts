import type { Node } from "@elentrik/model";
import { tekenAutomaat, tekenDifferentieel, tekenZekering } from "./beveiliging";
import { tekenLeiding, tekenVerdeelbord } from "./leiding";
import { tekenContactdoos, tekenLichtpunt, tekenSchakelaar, tekenToestel } from "./punten";
import type { Symbool } from "./types";
import { tekenAansluiting, tekenTeller } from "./voeding";

/**
 * Tekent het symbool van een node. Uitputtende `switch`: een nieuw nodetype geeft een
 * compilatiefout.
 */
export function tekenSymbool(node: Node): Symbool {
  switch (node.type) {
    case "aansluiting":
      return tekenAansluiting(node);
    case "teller":
      return tekenTeller(node);
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
      return tekenContactdoos(node);
    case "lichtpunt":
      return tekenLichtpunt(node);
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
