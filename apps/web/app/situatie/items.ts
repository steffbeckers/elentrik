// Pure afleiding van het situatieschema uit het document; expliciete imports (ruling E1).
import type { Analyse } from "@elentrik/arei";
import type { InstallatieDocument, NodeId } from "@elentrik/model";
import type { SituatieItem } from "@elentrik/render";
import { tekenSymbool } from "@elentrik/symbols";

/** Het label van de groep met niet-geplaatste verdeelborden; de UI vertaalt deze sleutel. */
export const GROEP_VERDEELBORDEN = "Verdeelborden";
/** Het label van de groep met punten zonder kring. */
export const GROEP_ZONDER_KRING = "—";

export type TePlaatsenGroep = { kringLabel: string; nodeIds: NodeId[] };

/**
 * Het label van een node op het plan en in "Te plaatsen": het puntlabel uit de analyse, voor een
 * verdeelbord zijn naam. Een punt zonder kring, een naamloos bord of een onbekende node geeft "".
 */
export function nodeLabel(doc: InstallatieDocument, analyse: Analyse, nodeId: NodeId): string {
  const node = doc.nodes[nodeId];
  if (!node) return "";
  return analyse.puntLabels[nodeId] ?? (node.type === "verdeelbord" ? (node.naam ?? "") : "");
}

/**
 * De geplaatste symbolen van één pagina. Het label volgt het eendraadschema (`puntLabels`),
 * dus het hernummert mee als er een punt wegvalt. Een onbekende pagina geeft een lege lijst.
 */
export function situatieItems(doc: InstallatieDocument, analyse: Analyse, paginaId: string): SituatieItem[] {
  const pagina = doc.situatie.paginas.find((p) => p.id === paginaId);
  if (!pagina) return [];
  const items: SituatieItem[] = [];
  for (const plaatsing of pagina.plaatsingen) {
    const node = doc.nodes[plaatsing.nodeId];
    if (!node) continue;
    items.push({
      nodeId: plaatsing.nodeId,
      symbool: tekenSymbool(node),
      x: plaatsing.x,
      y: plaatsing.y,
      rotatie: plaatsing.rotatie,
      label: nodeLabel(doc, analyse, plaatsing.nodeId),
    });
  }
  return items;
}

/** De verdeelborden van het document in pre-order. */
function verdeelbordenInVolgorde(doc: InstallatieDocument): NodeId[] {
  const borden: NodeId[] = [];
  const stapel: NodeId[] = [doc.rootId];
  while (stapel.length > 0) {
    const node = doc.nodes[stapel.pop()!];
    if (!node) continue;
    if (node.type === "verdeelbord") borden.push(node.id);
    for (let i = node.kinderen.length - 1; i >= 0; i--) stapel.push(node.kinderen[i]!);
  }
  return borden;
}

/**
 * Wat nog op een plan moet: de niet-geplaatste punten per kring (in volgorde van de kringen),
 * dan de punten zonder kring, dan de niet-geplaatste verdeelborden. Lege groepen vallen weg.
 */
export function tePlaatsen(doc: InstallatieDocument, analyse: Analyse): TePlaatsenGroep[] {
  const nietGeplaatst = new Set(analyse.nietGeplaatst);
  const groepen: TePlaatsenGroep[] = [];

  for (const kring of analyse.kringen) {
    const nodeIds = kring.puntIds.filter((id) => nietGeplaatst.has(id));
    if (nodeIds.length > 0) groepen.push({ kringLabel: kring.label, nodeIds });
  }

  const zonderKring = analyse.zonderKring.filter((id) => nietGeplaatst.has(id));
  if (zonderKring.length > 0) groepen.push({ kringLabel: GROEP_ZONDER_KRING, nodeIds: zonderKring });

  const geplaatst = new Set<NodeId>();
  for (const pagina of doc.situatie.paginas) {
    for (const plaatsing of pagina.plaatsingen) geplaatst.add(plaatsing.nodeId);
  }
  const borden = verdeelbordenInVolgorde(doc).filter((id) => !geplaatst.has(id));
  if (borden.length > 0) groepen.push({ kringLabel: GROEP_VERDEELBORDEN, nodeIds: borden });

  return groepen;
}
