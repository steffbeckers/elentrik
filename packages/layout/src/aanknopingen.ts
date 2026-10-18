import { PUNT_TYPES, type Node } from "@elentrik/model";

const KRING_EINDE_TYPES: ReadonlySet<string> = new Set<string>([...PUNT_TYPES, "leiding", "automaat", "zekering"]);

/** Een node zonder kinderen krijgt een `kring-einde` als hij een punt, een leiding, een automaat of een zekering is. */
export function heeftKringEinde(node: Node, aantalKinderen: number): boolean {
  return aantalKinderen === 0 && KRING_EINDE_TYPES.has(node.type);
}

/** Een `rail-einde` hoort bij een verdeelbord en bij een differentieel dat in een verdeelbord of in een ander differentieel hangt. */
export function heeftRailEinde(node: Node, ouder: Node | undefined): boolean {
  if (node.type === "verdeelbord") return true;
  return node.type === "differentieel" && ouder !== undefined && (ouder.type === "verdeelbord" || ouder.type === "differentieel");
}
