import { analyseer } from "@elentrik/arei";
import type { InstallatieDocument, NodeId } from "@elentrik/model";
import { KOLOM_BREEDTE_MM, tekenSymbool, type Symbool } from "@elentrik/symbols";
import {
  RAIL_AFSTAND_MM,
  STROOK_MARGE_MM,
  VERTICALE_AFSTAND_MM,
  type SchemaElement,
  type Strook,
} from "./types";

/**
 * Legt het document in één strook: elk blad krijgt een eigen kolom en een node met kinderen staat
 * in de kolom van zijn eerste kind. Alle doorlopingen zijn iteratief.
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

  const kolomVan: Record<NodeId, number> = { [doc.rootId]: 0 };
  const yVan = new Map<NodeId, number>([[doc.rootId, STROOK_MARGE_MM]]);
  const cx = (id: NodeId): number => STROOK_MARGE_MM + kolomVan[id]! * KOLOM_BREEDTE_MM + KOLOM_BREEDTE_MM / 2;

  const elementen: SchemaElement[] = [];
  let onderkant = STROOK_MARGE_MM;

  // In pre-order ligt de plaats van de ouder vast voordat de kinderen aan bod komen.
  for (const id of preOrder) {
    const symbool: Symbool = tekenSymbool(doc.nodes[id]!);
    const { breedte, hoogte } = symbool.maat;
    const x = cx(id);
    const y = yVan.get(id)!;
    elementen.push({ soort: "symbool", nodeId: id, x: x - breedte / 2, y, symbool });
    onderkant = Math.max(onderkant, y + hoogte);

    const kinderen = kinderenVan(id);
    const yRail = y + hoogte + VERTICALE_AFSTAND_MM;
    const yKind = kinderen.length > 1 ? yRail + RAIL_AFSTAND_MM : yRail;
    let kolom = kolomVan[id]!;
    kinderen.forEach((kind, index) => {
      kolomVan[kind] = kolom;
      yVan.set(kind, yKind);
      kolom += bladen.get(kind)!;
      if (index === 0) {
        elementen.push({ soort: "lijn", x1: x, y1: y + hoogte, x2: x, y2: yKind, rol: "verbinding" });
      } else {
        const xKind = cx(kind);
        elementen.push(
          { soort: "lijn", x1: x, y1: y + hoogte, x2: x, y2: yRail, rol: "verbinding" },
          { soort: "lijn", x1: x, y1: yRail, x2: xKind, y2: yRail, rol: "verbinding" },
          { soort: "lijn", x1: xKind, y1: yRail, x2: xKind, y2: yKind, rol: "verbinding" },
        );
      }
    });
  }

  const grenzen = new Set<number>();
  for (const kring of analyseer(doc).kringen) {
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
