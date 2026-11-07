// Pure afleiding van het situatieschema uit het document; expliciete imports (ruling E1).
import type { Analyse } from "@elentrik/arei";
import { PLAATSBARE_TYPES, PUNT_TYPES, type InstallatieDocument, type NodeId } from "@elentrik/model";

/** Het label van de groep met niet-geplaatste verdeelborden; de UI vertaalt deze sleutel. */
export const GROEP_VERDEELBORDEN = "Verdeelborden";
/** Het label van de groep met punten zonder kring. */
export const GROEP_ZONDER_KRING = "—";
export const GROEP_INSTALLATIE = "Installatieonderdelen";

export type TePlaatsenGroep = { kringLabel: string; nodeIds: NodeId[] };

/** Placeable infrastructure in pre-order; uses the same catalogue as the placement command. */
function installatieInVolgorde(doc: InstallatieDocument): NodeId[] {
  const borden: NodeId[] = [];
  const stapel: NodeId[] = [doc.rootId];
  const gezien = new Set<NodeId>();
  while (stapel.length > 0) {
    const id = stapel.pop()!;
    if (gezien.has(id) || !Object.hasOwn(doc.nodes, id)) continue;
    gezien.add(id);
    const node = doc.nodes[id];
    if (!node) continue;
    if ((PLAATSBARE_TYPES as readonly string[]).includes(node.type) && !(PUNT_TYPES as readonly string[]).includes(node.type)) borden.push(node.id);
    for (let i = node.kinderen.length - 1; i >= 0; i--) stapel.push(node.kinderen[i]!);
  }
  return borden;
}

/**
 * Wat nog op een plan moet: de niet-geplaatste punten per kring (in volgorde van de kringen),
 * dan de punten zonder kring, borden en overige plaatsbare installatieonderdelen.
 * Infrastructuur is plaatsbaar zoals een bord; ze wordt daardoor geen verplicht elektrisch punt.
 */
export function tePlaatsen(doc: InstallatieDocument, analyse: Analyse): TePlaatsenGroep[] {
  const geplaatst = new Set(doc.situatie.paginas.filter(p => !p.referentie).flatMap(p => p.plaatsingen.map(v => v.nodeId)));
  const nietGeplaatst = new Set([...analyse.kringen.flatMap(k => k.puntIds), ...analyse.zonderKring].filter(id => !geplaatst.has(id)));
  const groepen: TePlaatsenGroep[] = [];

  for (const kring of analyse.kringen) {
    const nodeIds = kring.puntIds.filter((id) => nietGeplaatst.has(id));
    if (nodeIds.length > 0) groepen.push({ kringLabel: kring.label, nodeIds });
  }

  const zonderKring = analyse.zonderKring.filter((id) => nietGeplaatst.has(id));
  if (zonderKring.length > 0) groepen.push({ kringLabel: GROEP_ZONDER_KRING, nodeIds: zonderKring });

  const installatie = installatieInVolgorde(doc).filter((id) => !geplaatst.has(id));
  const borden = installatie.filter(id => doc.nodes[id]!.type === "verdeelbord");
  if (borden.length > 0) groepen.push({ kringLabel: GROEP_VERDEELBORDEN, nodeIds: borden });
  const andere = installatie.filter(id => doc.nodes[id]!.type !== "verdeelbord");
  if (andere.length > 0) groepen.push({ kringLabel: GROEP_INSTALLATIE, nodeIds: andere });

  return groepen;
}
