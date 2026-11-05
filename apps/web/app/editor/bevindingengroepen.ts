import type { Analyse, Bevinding } from "@elentrik/arei";
import type { InstallatieDocument, NodeId } from "@elentrik/model";

export type Bevindingengroep = {
  sleutel: string;
  kringId: NodeId | null;
  voorbeeld: Bevinding;
  bevindingen: Bevinding[];
};

/** Track the clicked point, not the representative point used for a grouped summary. */
export function bevindingVoorNode(groep: Bevindingengroep, nodeId: NodeId): Bevinding {
  return groep.bevindingen.find(b => b.nodeIds.includes(nodeId)) ?? groep.voorbeeld;
}

/** Alleen dezelfde oorzaak, parameters, kring en afwijkingsstatus delen een uitleg.
 * De originele bevindingen blijven intact voor aantallen en individuele motivatie. */
export function groepeerBevindingen(bevindingen: readonly Bevinding[], analyse: Analyse | null): Bevindingengroep[] {
  const groepen = new Map<string, Bevindingengroep>();
  for (const b of bevindingen) {
    const kringIds = b.nodeIds.map(id => analyse?.kringVanNode[id]);
    const kringId = kringIds.length > 0 && kringIds.every(id => id !== undefined && id === kringIds[0]) ? kringIds[0]! : null;
    const sleutel = JSON.stringify([
      b.ernst, b.regelId, b.berichtSleutel, b.afgeweken,
      Object.entries(b.parameters).sort(([a], [c]) => a.localeCompare(c)),
      kringId ?? [...b.nodeIds].sort(),
    ]);
    const groep = groepen.get(sleutel);
    if (groep) groep.bevindingen.push(b);
    else groepen.set(sleutel, { sleutel, kringId, voorbeeld: b, bevindingen: [b] });
  }
  return [...groepen.values()];
}

export type HerstelDoel = { nodeId: NodeId; soort: "beveiliging" | "kring" };

/** Navigatie, geen automatische reparatie. Een ontbrekende aanvullende RCD verwijst
 * naar de betrokken kring; de hoofddifferentieel aanpassen zou de oorzaak niet oplossen. */
export function herstelDoel(b: Bevinding, analyse: Analyse | null, doc: InstallatieDocument | null): HerstelDoel | null {
  const id = b.nodeIds[0];
  if (!id || !analyse || !doc?.nodes[id]) return null;
  const node = doc.nodes[id]!;
  if (node.type === "differentieel" || node.type === "automaat" || node.type === "zekering") {
    return { nodeId: id, soort: "beveiliging" };
  }
  if (b.regelId !== "arei.differentieel.aanvullend" && b.regelId !== "arei.differentieel.natte-ruimte") return null;
  const keten = analyse.ketens[id];
  const aanvullend = keten?.differentielen.find(diffId => diffId !== analyse.algemeenDifferentieelId && doc.nodes[diffId]?.type === "differentieel");
  if (aanvullend) return { nodeId: aanvullend, soort: "beveiliging" };
  const kringId = analyse.kringVanNode[id];
  return kringId && doc.nodes[kringId] ? { nodeId: kringId, soort: "kring" } : null;
}
