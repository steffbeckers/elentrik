import type { InstallatieDocument, NodeType, NodeVan } from "@elentrik/model";

/** Nearest board context is shared by the canvas insertion chooser, assembly dialogs and the print. */
export function bordVanNode(doc: InstallatieDocument, id: string): string | undefined {
  const gezien = new Set<string>();
  let node = Object.hasOwn(doc.nodes, id) ? doc.nodes[id] : undefined;
  while (node && !gezien.has(node.id)) {
    gezien.add(node.id);
    if (node.type === "verdeelbord") return node.id;
    node = node.parentId !== null && Object.hasOwn(doc.nodes, node.parentId) ? doc.nodes[node.parentId] : undefined;
  }
  return undefined;
}

/**
 * De naam van een differentieel: "Differentieel B · 30 mA". Zonder referentie
 * staat er zijn plaats in het bord ("Differentieel 2 · 30 mA"), met dezelfde gevoeligheid erbij.
 */
export function differentieelNaam(node: NodeVan<"differentieel">, plaats: number, typeNaam: (type: NodeType) => string): string {
  return `${typeNaam("differentieel")} ${node.referentie || plaats} · ${node.gevoeligheid_mA} mA`;
}

/** Per differentieel zijn plaats (vanaf 1) onder de differentiëlen van hetzelfde bord, in de volgorde van `ids`. */
export function differentieelPlaatsen(doc: InstallatieDocument, ids: readonly string[]): Map<string, number> {
  const perBord = new Map<string, number>();
  const plaatsen = new Map<string, number>();
  for (const id of ids) {
    if (doc.nodes[id]?.type !== "differentieel") continue;
    const bord = bordVanNode(doc, id) ?? "";
    const plaats = (perBord.get(bord) ?? 0) + 1;
    perBord.set(bord, plaats);
    plaatsen.set(id, plaats);
  }
  return plaatsen;
}
