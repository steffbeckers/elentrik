import { enablePatches, applyPatches, produceWithPatches, type Draft, type Patch } from "immer";
import { DocumentFout } from "./fouten";
import { nieuwId } from "./ids";
import { NodeSchema, type InstallatieDocument, type Node, type NodeId } from "./schema";
import { TOEGELATEN_KINDEREN } from "./structuur";

enablePatches();

/** Eigenschappen van een nieuwe node: alles behalve de structuurvelden `id`, `parentId` en `kinderen`. */
export type NodeInvoer =
  Node extends infer N ? (N extends Node ? Omit<N, "id" | "parentId" | "kinderen"> : never) : never;

export type OperatieResultaat = {
  doc: InstallatieDocument;
  patches: Patch[];
  inversePatches: Patch[];
};

export type { Patch };

const STRUCTUURVELDEN = ["id", "type", "parentId", "kinderen"] as const;
const AFGELEIDE_VELDEN = ["id", "parentId", "kinderen"] as const;

// Object.hasOwn: ids als "constructor" mogen niet via de prototype resolven.
function haal(doc: InstallatieDocument, id: NodeId): Node | undefined {
  return Object.hasOwn(doc.nodes, id) ? doc.nodes[id] : undefined;
}

function vereis(doc: InstallatieDocument, id: NodeId): Node {
  const node = haal(doc, id);
  if (!node) throw new DocumentFout("ONBEKENDE_NODE", { nodeId: id });
  return node;
}

/** Alle node-id's van de subboom van `startId` (inclusief `startId`), iteratief doorlopen. */
function subboom(doc: InstallatieDocument, startId: NodeId): Set<NodeId> {
  const gezien = new Set<NodeId>([startId]);
  const stapel: NodeId[] = [startId];
  while (stapel.length > 0) {
    const node = haal(doc, stapel.pop()!);
    if (!node) continue;
    for (const kindId of node.kinderen) {
      if (gezien.has(kindId)) continue;
      gezien.add(kindId);
      stapel.push(kindId);
    }
  }
  return gezien;
}

function controleerType(ouder: Node, kind: { type: string }): void {
  const toegelaten: readonly string[] = TOEGELATEN_KINDEREN[ouder.type];
  if (!toegelaten.includes(kind.type)) {
    throw new DocumentFout("NIET_TOEGELATEN_KIND", { ouder: ouder.type, kind: kind.type });
  }
}

function controleerIndex(index: number, lengte: number): void {
  if (!Number.isInteger(index) || index < 0 || index > lengte) {
    throw new DocumentFout("ONGELDIGE_INDEX", { index, lengte });
  }
}

function resultaat<T extends object>(
  doc: InstallatieDocument,
  recept: (draft: Draft<InstallatieDocument>) => void,
  extra?: T,
): OperatieResultaat & T {
  const [nieuw, patches, inversePatches] = produceWithPatches(doc, recept);
  return { ...(extra as T), doc: nieuw, patches, inversePatches };
}

export function voegToe(
  doc: InstallatieDocument,
  parentId: NodeId,
  invoer: NodeInvoer,
  index?: number,
): OperatieResultaat & { id: NodeId } {
  const ouder = vereis(doc, parentId);
  if (AFGELEIDE_VELDEN.some((veld) => Object.hasOwn(invoer, veld))) {
    throw new DocumentFout("ONGELDIG_SCHEMA", {
      reden: "id, parentId en kinderen zijn niet toegelaten in de invoer",
    });
  }
  // Een onbekend type valt door naar de schemacontrole (ONGELDIG_SCHEMA).
  if (Object.hasOwn(TOEGELATEN_KINDEREN, invoer.type)) controleerType(ouder, invoer);
  const plek = index ?? ouder.kinderen.length;
  controleerIndex(plek, ouder.kinderen.length);

  const id = nieuwId();
  const geparsed = NodeSchema.safeParse({ ...invoer, id, parentId, kinderen: [] });
  if (!geparsed.success) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { issues: geparsed.error.issues });
  }
  const node = geparsed.data;

  return resultaat(
    doc,
    (draft) => {
      draft.nodes[id] = node;
      draft.nodes[parentId]!.kinderen.splice(plek, 0, id);
    },
    { id },
  );
}

export function verwijder(doc: InstallatieDocument, nodeId: NodeId): OperatieResultaat {
  const node = vereis(doc, nodeId);
  if (nodeId === doc.rootId) throw new DocumentFout("ROOT_NIET_WIJZIGBAAR", { nodeId });

  const weg = subboom(doc, nodeId);
  return resultaat(doc, (draft) => {
    if (node.parentId !== null && Object.hasOwn(draft.nodes, node.parentId)) {
      const kinderen = draft.nodes[node.parentId]!.kinderen;
      const positie = kinderen.indexOf(nodeId);
      if (positie !== -1) kinderen.splice(positie, 1);
    }
    for (const id of weg) delete draft.nodes[id];
    for (const pagina of draft.situatie.paginas) {
      if (pagina.plaatsingen.some((p) => weg.has(p.nodeId))) {
        pagina.plaatsingen = pagina.plaatsingen.filter((p) => !weg.has(p.nodeId));
      }
    }
    if (draft.afwijkingen.some((a) => weg.has(a.nodeId))) {
      draft.afwijkingen = draft.afwijkingen.filter((a) => !weg.has(a.nodeId));
    }
  });
}

/**
 * Verplaatst een node (met subboom) naar een nieuwe ouder. Binnen dezelfde ouder
 * is `index` een positie in de kinderlijst nadat de node eruit is gehaald
 * (geldig bereik 0..lengte); naar de huidige positie verplaatsen is een no-op.
 */
export function verplaats(
  doc: InstallatieDocument,
  nodeId: NodeId,
  nieuweParentId: NodeId,
  index?: number,
): OperatieResultaat {
  const node = vereis(doc, nodeId);
  if (nodeId === doc.rootId) throw new DocumentFout("ROOT_NIET_WIJZIGBAAR", { nodeId });
  const nieuweOuder = vereis(doc, nieuweParentId);
  if (subboom(doc, nodeId).has(nieuweParentId)) {
    throw new DocumentFout("CYCLUS", { nodeId, nieuweParentId });
  }
  controleerType(nieuweOuder, node);

  const zelfdeOuder = node.parentId === nieuweParentId;
  const doelLijst = zelfdeOuder
    ? nieuweOuder.kinderen.filter((id) => id !== nodeId)
    : nieuweOuder.kinderen;
  const plek = index ?? doelLijst.length;
  controleerIndex(plek, doelLijst.length);

  if (zelfdeOuder && nieuweOuder.kinderen.indexOf(nodeId) === plek) {
    return { doc, patches: [], inversePatches: [] };
  }

  return resultaat(doc, (draft) => {
    if (node.parentId !== null && Object.hasOwn(draft.nodes, node.parentId)) {
      const oud = draft.nodes[node.parentId]!.kinderen;
      const positie = oud.indexOf(nodeId);
      if (positie !== -1) oud.splice(positie, 1);
    }
    draft.nodes[nieuweParentId]!.kinderen.splice(plek, 0, nodeId);
    draft.nodes[nodeId]!.parentId = nieuweParentId;
  });
}

/**
 * Past eigenschappen van een node aan. Een `undefined`-waarde verwijdert een
 * optionele eigenschap. `id`, `type`, `parentId` en `kinderen` zijn niet wijzigbaar.
 */
export function wijzigEigenschappen(
  doc: InstallatieDocument,
  nodeId: NodeId,
  wijziging: Record<string, unknown>,
): OperatieResultaat {
  const node = vereis(doc, nodeId);
  const verboden = STRUCTUURVELDEN.filter((veld) => Object.hasOwn(wijziging, veld));
  if (verboden.length > 0) throw new DocumentFout("ONGELDIG_SCHEMA", { verboden });

  const samengevoegd: Record<string, unknown> = { ...node, ...wijziging };
  for (const [sleutel, waarde] of Object.entries(samengevoegd)) {
    if (waarde === undefined) delete samengevoegd[sleutel];
  }
  const geparsed = NodeSchema.safeParse(samengevoegd);
  if (!geparsed.success) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { issues: geparsed.error.issues });
  }
  const nieuw: Record<string, unknown> = geparsed.data;

  return resultaat(doc, (draft) => {
    const doel = draft.nodes[nodeId] as Record<string, unknown>;
    for (const sleutel of Object.keys(wijziging)) {
      if (Object.hasOwn(nieuw, sleutel)) doel[sleutel] = nieuw[sleutel];
      else delete doel[sleutel];
    }
  });
}

export function pasPatchesToe(doc: InstallatieDocument, patches: Patch[]): InstallatieDocument {
  return applyPatches(doc, patches);
}
