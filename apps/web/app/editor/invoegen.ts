import type { InstallatieDocument, Node, NodeId, SjabloonDoel } from '@elentrik/model';

/** Alleen zichtbare, structureel geldige doelen. Een differentieel voor het bord ontbreekt. */
export function invoegBestemmingen(doc: InstallatieDocument): SjabloonDoel[] {
  const doelen: SjabloonDoel[] = [];
  const stapel = [{ id: doc.rootId, bordBoven: false }];
  const gezien = new Set<NodeId>();
  while (stapel.length) {
    const { id, bordBoven } = stapel.pop()!;
    if (gezien.has(id)) continue;
    gezien.add(id);
    const node = doc.nodes[id];
    if (!node) continue;
    if (node.type === 'verdeelbord') doelen.push({ soort: 'nieuw-op-bord', nodeId: id });
    if (node.type === 'differentieel' && bordBoven) doelen.push({ soort: 'bestaande-differentieel', nodeId: id });
    for (let i = node.kinderen.length - 1; i >= 0; i--) {
      stapel.push({ id: node.kinderen[i]!, bordBoven: bordBoven || node.type === 'verdeelbord' });
    }
  }
  return doelen;
}
export function doelBijSelectie<T extends { nodeId: NodeId }>(doelen: T[], selectie: NodeId[]): T | undefined {
  return selectie.length === 1 ? doelen.find(d => d.nodeId === selectie[0]) : undefined;
}
/** Technische waarden blijven taal-onafhankelijk; omschrijvingen blijven apart. */
export function invoegSpecificatie(node: Node): string {
  switch (node.type) {
    case 'differentieel': return `${node.gevoeligheid_mA} mA / ${node.nominaal_A} A / ${node.klasse} / ${node.polen}P`;
    case 'automaat': return `${node.curve}${node.nominaal_A} / ${node.polen}P`;
    case 'leiding': return `${node.kabeltype} ${node.aantalGeleiders}G${String(node.doorsnede_mm2).replace('.', ',')}`;
    case 'lichtpunt': return `${node.aantal}`;
    default: return '';
  }
}
