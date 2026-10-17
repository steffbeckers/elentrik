import type { Node } from "@elentrik/model";
import { tekenAutomaat, tekenDifferentieel, tekenZekering } from "./beveiliging";
import type { Symbool } from "./types";
import { tekenAansluiting, tekenTeller } from "./voeding";

/**
 * Tekent het symbool van een node. Uitputtende `switch`: een nieuw nodetype geeft een
 * compilatiefout. De types die nog geen symbool hebben, gooien tijdelijk `Error("NOG_NIET")`.
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
    case "leiding":
    case "contactdoos":
    case "lichtpunt":
    case "schakelaar":
    case "toestel":
      throw new Error("NOG_NIET");
    default: {
      const onbekend: never = node;
      throw new Error(`Onbekend nodetype: ${JSON.stringify(onbekend)}`);
    }
  }
}
