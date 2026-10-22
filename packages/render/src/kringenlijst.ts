import type { Analyse } from "@elentrik/arei";
import { beveiligingLabel, leidingLabel } from "@elentrik/layout";
import type { InstallatieDocument, Node, NodeId } from "@elentrik/model";
import type { Teksten } from "./teksten/nl";

/** Eén rij van de kringenlijst: één punt, met de gegevens van zijn kring en keten als tekst. */
export type KringenlijstRij = {
  nodeId: string;
  kring: string;
  punt: string;
  type: string;
  ruimte: string;
  beveiliging: string;
  differentieel: string;
  leiding: string;
};

/** Het label van een punt zonder kring. */
const ZONDER_KRING = "—";

function typeTekst(node: Node, teksten: Teksten): string {
  const basis = teksten.types[node.type];
  return node.type === "toestel" ? `${basis} (${teksten.toestelsoorten[node.soort]})` : basis;
}

function beveiligingTekst(doc: InstallatieDocument, id: NodeId | null | undefined): string {
  const node = id ? doc.nodes[id] : undefined;
  if (node?.type === "automaat" || node?.type === "zekering" || node?.type === "differentieel") {
    return beveiligingLabel(node);
  }
  return "";
}

function rij(
  doc: InstallatieDocument,
  analyse: Analyse,
  teksten: Teksten,
  nodeId: NodeId,
  kring: string,
  beveiligingId: NodeId | null,
): KringenlijstRij | null {
  const node = doc.nodes[nodeId];
  if (!node) return null;
  const keten = analyse.ketens[nodeId];
  const differentieel = keten?.differentielen[0] ? doc.nodes[keten.differentielen[0]] : undefined;
  const leiding = keten?.leidingId ? doc.nodes[keten.leidingId] : undefined;
  return {
    nodeId,
    kring,
    punt: analyse.puntLabels[nodeId] ?? "",
    type: typeTekst(node, teksten),
    ruimte: node.ruimte ? teksten.ruimtes[node.ruimte] : "",
    beveiliging: beveiligingTekst(doc, beveiligingId),
    differentieel:
      differentieel?.type === "differentieel"
        ? `${differentieel.gevoeligheid_mA} ${teksten.differentieel.eenheid} ${teksten.differentieel.type} ${differentieel.klasse}`
        : "",
    leiding: leiding?.type === "leiding" ? leidingLabel(leiding) : "",
  };
}

/**
 * De rijen van de kringenlijst: de kringen in de volgorde van de analyse, daarbinnen de punten in
 * pre-order, daarna de punten zonder kring (kring "—", zonder beveiliging). Een project zonder
 * punten geeft een lege lijst.
 */
export function kringenlijst(doc: InstallatieDocument, analyse: Analyse, teksten: Teksten): KringenlijstRij[] {
  const rijen: KringenlijstRij[] = [];
  for (const kring of analyse.kringen) {
    for (const id of kring.puntIds) {
      const r = rij(doc, analyse, teksten, id, kring.label, kring.beveiligingId);
      if (r) rijen.push(r);
    }
  }
  for (const id of analyse.zonderKring) {
    const r = rij(doc, analyse, teksten, id, ZONDER_KRING, null);
    if (r) rijen.push(r);
  }
  return rijen;
}
