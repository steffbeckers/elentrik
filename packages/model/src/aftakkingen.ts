import type { Node } from "./schema";

/** Alleen schakelaars en lichtpunten kunnen lid zijn van een horizontale aftakking. */
export function isAftakkingNode(node: { type: string; aftakking?: true }): node is Node & { aftakking: true } {
  return (node.type === "schakelaar" || node.type === "lichtpunt") && node.aftakking === true;
}

/** Een gemarkeerde reeks begint aan een leiding en heeft hoogstens één opvolger per symbool. */
export function magAftakkingKind(
  ouder: { type: string; aftakking?: true },
  kind: { type: string; aftakking?: true },
  aantalKinderen: number,
): boolean {
  if (isAftakkingNode(ouder)) return isAftakkingNode(kind) && aantalKinderen === 0;
  return !isAftakkingNode(kind) || ouder.type === "leiding";
}
