import { analyseer } from "@elentrik/arei";
import type { InstallatieDocument, NodeId } from "@elentrik/model";
import { KOLOM_BREEDTE_MM, tekenSymbool, type Symbool } from "@elentrik/symbols";
import { beveiligingLabel, leidingLabel } from "./labels";
import {
  RAIL_AFSTAND_MM,
  STROOK_MARGE_MM,
  VERTICALE_AFSTAND_MM,
  type SchemaElement,
  type Strook,
} from "./types";

/**
 * Legt het document in één strook: elk blad krijgt een eigen kolom en een node met kinderen staat
 * in de kolom van zijn eerste kind. Per node volgen op elkaar: het symbool, de teksten (kring,
 * beveiliging, leiding, punt, onderbord) en de verbindingen naar de kinderen. Alle doorlopingen
 * zijn iteratief. De teksten blijven ruw; escapen gebeurt in render.
 */
export function maakStrook(doc: InstallatieDocument): Strook {
  // Verwijzingen naar ontbrekende nodes worden overgeslagen.
  const kinderenVan = (id: NodeId): NodeId[] =>
    doc.nodes[id]!.kinderen.filter((kind) => Object.hasOwn(doc.nodes, kind));

  const preOrder: NodeId[] = [];
  const stapel: NodeId[] = [doc.rootId];
  while (stapel.length > 0) {
    const id = stapel.pop()!;
    preOrder.push(id);
    const kinderen = kinderenVan(id);
    for (let i = kinderen.length - 1; i >= 0; i--) stapel.push(kinderen[i]!);
  }

  // Omgekeerde pre-order: elk kind komt voor zijn ouder.
  const bladen = new Map<NodeId, number>();
  for (let i = preOrder.length - 1; i >= 0; i--) {
    const id = preOrder[i]!;
    const kinderen = kinderenVan(id);
    let som = 0;
    for (const kind of kinderen) som += bladen.get(kind)!;
    bladen.set(id, kinderen.length === 0 ? 1 : som);
  }

  const symbolen = new Map<NodeId, Symbool>();
  for (const id of preOrder) symbolen.set(id, tekenSymbool(doc.nodes[id]!));

  const analyse = analyseer(doc);
  const kringLabelVan = new Map<NodeId, string>();
  for (const kring of analyse.kringen) kringLabelVan.set(kring.beveiligingId, kring.label);

  const kolomVan: Record<NodeId, number> = { [doc.rootId]: 0 };
  const yVan = new Map<NodeId, number>([[doc.rootId, STROOK_MARGE_MM]]);
  const cx = (id: NodeId): number => STROOK_MARGE_MM + kolomVan[id]! * KOLOM_BREEDTE_MM + KOLOM_BREEDTE_MM / 2;

  const elementen: SchemaElement[] = [];
  let onderkant = STROOK_MARGE_MM;

  // In pre-order ligt de plaats van de ouder vast voordat de kinderen aan bod komen.
  for (const id of preOrder) {
    const node = doc.nodes[id]!;
    const symbool = symbolen.get(id)!;
    const { breedte, hoogte, uit } = symbool.maat;
    const x = cx(id);
    const y = yVan.get(id)!;
    elementen.push({ soort: "symbool", nodeId: id, x: x - breedte / 2, y, symbool });
    onderkant = Math.max(onderkant, y + hoogte);

    const rechts = x + breedte / 2 + 1;
    const midden = y + hoogte / 2;
    const kringLabel = kringLabelVan.get(id);
    if (kringLabel !== undefined) {
      // Links van de lijn naar beneden, zodat de verbinding de letter niet doorsnijdt.
      elementen.push({ soort: "tekst", x: x - 1, y: y - 1, tekst: kringLabel, grootte: 3, anker: "end", rol: "kring" });
    }
    if (node.type === "automaat" || node.type === "zekering" || node.type === "differentieel") {
      elementen.push({
        soort: "tekst",
        x: rechts,
        y: midden + 0.7,
        tekst: beveiligingLabel(node),
        grootte: 2,
        anker: "start",
        rol: "beveiliging",
      });
    }
    if (node.type === "leiding") {
      elementen.push({
        soort: "tekst",
        x: x + 2,
        y: midden + 0.7,
        tekst: leidingLabel(node),
        grootte: 2,
        anker: "start",
        rol: "leiding",
      });
    }
    const puntLabel = analyse.puntLabels[id];
    if (puntLabel !== undefined) {
      elementen.push({
        soort: "tekst",
        x: x - breedte / 2 - 1,
        y: midden + 0.9,
        tekst: puntLabel,
        grootte: 2.5,
        anker: "end",
        rol: "punt",
      });
    }
    if (node.type === "verdeelbord" && node.naam !== undefined && node.naam.trim() !== "") {
      elementen.push({
        soort: "tekst",
        x: rechts,
        y: midden + 0.7,
        tekst: node.naam,
        grootte: 2.5,
        anker: "start",
        rol: "onderbord",
      });
    }

    const kinderen = kinderenVan(id);
    if (kinderen.length === 0) continue;
    const yUit = y + uit.y;
    const yRail = y + hoogte + VERTICALE_AFSTAND_MM;
    const yKind = kinderen.length > 1 ? yRail + RAIL_AFSTAND_MM : yRail;
    let kolom = kolomVan[id]!;
    for (const kind of kinderen) {
      kolomVan[kind] = kolom;
      yVan.set(kind, yKind);
      kolom += bladen.get(kind)!;
    }
    const yIn = (kind: NodeId): number => yKind + symbolen.get(kind)!.maat.in.y;

    if (kinderen.length === 1) {
      const kind = kinderen[0]!;
      elementen.push({ soort: "lijn", x1: x, y1: yUit, x2: cx(kind), y2: yIn(kind), rol: "verbinding" });
      continue;
    }
    elementen.push({ soort: "lijn", x1: x, y1: yUit, x2: x, y2: yRail, rol: "verbinding" });
    elementen.push({
      soort: "lijn",
      x1: cx(kinderen[0]!),
      y1: yRail,
      x2: cx(kinderen[kinderen.length - 1]!),
      y2: yRail,
      rol: node.type === "verdeelbord" ? "rail" : "verbinding",
    });
    for (const kind of kinderen) {
      elementen.push({ soort: "lijn", x1: cx(kind), y1: yRail, x2: cx(kind), y2: yIn(kind), rol: "verbinding" });
    }
  }

  const grenzen = new Set<number>();
  for (const kring of analyse.kringen) {
    const kolom = kolomVan[kring.beveiligingId];
    if (kolom !== undefined) grenzen.add(STROOK_MARGE_MM + kolom * KOLOM_BREEDTE_MM);
  }

  return {
    breedte: 2 * STROOK_MARGE_MM + bladen.get(doc.rootId)! * KOLOM_BREEDTE_MM,
    hoogte: onderkant + STROOK_MARGE_MM,
    elementen,
    kolomVan,
    kringGrenzen: [...grenzen].sort((a, b) => a - b),
  };
}
