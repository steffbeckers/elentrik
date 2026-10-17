import { DocumentFout } from "./fouten";
import { nieuwId } from "./ids";
import {
  controleerIndex,
  controleerType,
  resultaat,
  vereis,
  type NodeInvoer,
  type OperatieResultaat,
} from "./operaties";
import { NodeSchema, type InstallatieDocument, type Node, type NodeId } from "./schema";
import { TOEGELATEN_KINDEREN } from "./structuur";

/** Een node van een sjabloon; `kinderen` zijn de geneste sjabloonnodes (geen id's). */
export type SjabloonNode = NodeInvoer & { kinderen?: SjabloonNode[] };

export type Sjabloon = { id: string; naam: string; boom: SjabloonNode };

type Werk = {
  invoer: SjabloonNode;
  id: NodeId;
  parentId: NodeId;
  ouderType: Node["type"];
};

function ongeldig(reden: string): DocumentFout {
  return new DocumentFout("ONGELDIG_SCHEMA", { reden });
}

/**
 * Past een sjabloon toe onder `parentId` als één operatie (één undo-stap).
 * Het hele sjabloon wordt gevalideerd voor er iets gewijzigd wordt; elke node
 * krijgt een nieuw id. `index` volgt de regels van `voegToe`. `id` in het
 * resultaat is de root van het ingevoegde sjabloon.
 */
export function pasSjabloonToe(
  doc: InstallatieDocument,
  parentId: NodeId,
  sjabloon: Sjabloon,
  index?: number,
): OperatieResultaat & { id: NodeId } {
  const ouder = vereis(doc, parentId);
  const plek = index ?? ouder.kinderen.length;
  controleerIndex(plek, ouder.kinderen.length);

  const rootId = nieuwId();
  const nieuweNodes: Node[] = [];
  // Iteratief (geen recursie): een diep sjabloon mag de stack niet laten overlopen.
  const stapel: Werk[] = [{ invoer: sjabloon.boom, id: rootId, parentId, ouderType: ouder.type }];

  while (stapel.length > 0) {
    const { invoer, id, parentId: nodeOuderId, ouderType } = stapel.pop()!;
    if (typeof invoer !== "object" || invoer === null) throw ongeldig("sjabloonnode is geen object");
    if (Object.hasOwn(invoer, "id") || Object.hasOwn(invoer, "parentId")) {
      throw ongeldig("id en parentId zijn niet toegelaten in een sjabloonnode");
    }
    const { kinderen: sjabloonKinderen, ...eigen } = invoer;
    if (sjabloonKinderen !== undefined && !Array.isArray(sjabloonKinderen)) {
      throw ongeldig("kinderen van een sjabloonnode moet een lijst zijn");
    }

    // Een onbekend type valt door naar de schemacontrole (ONGELDIG_SCHEMA).
    if (Object.hasOwn(TOEGELATEN_KINDEREN, eigen.type)) {
      controleerType({ type: ouderType }, eigen);
    }

    const kinderen = (sjabloonKinderen ?? []).map((kind) => ({
      invoer: kind,
      id: nieuwId(),
    }));
    const geparsed = NodeSchema.safeParse({
      ...eigen,
      id,
      parentId: nodeOuderId,
      kinderen: kinderen.map((kind) => kind.id),
    });
    if (!geparsed.success) {
      throw new DocumentFout("ONGELDIG_SCHEMA", { issues: geparsed.error.issues });
    }
    nieuweNodes.push(geparsed.data);
    for (const kind of kinderen) {
      stapel.push({ ...kind, parentId: id, ouderType: geparsed.data.type });
    }
  }

  return resultaat(
    doc,
    (draft) => {
      for (const node of nieuweNodes) draft.nodes[node.id] = node;
      draft.nodes[parentId]!.kinderen.splice(plek, 0, rootId);
    },
    { id: rootId },
  );
}
