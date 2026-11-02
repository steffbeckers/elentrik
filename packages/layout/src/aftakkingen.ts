import { isAftakkingNode, type InstallatieDocument, type NodeId } from "@elentrik/model";
import { tekenAftakkingSymbool, type Symbool } from "@elentrik/symbols";

const TUSSENRUIMTE = 4;
const START_X = 6;

export type AftakkingRij = { ids: NodeId[]; symbolen: Symbool[]; midden: number };
export type AftakkingBlok = {
  rijen: AftakkingRij[];
  xVanSymbool: number[];
  breedte: number;
  hoogte: number;
  knipGrenzen: number[];
};

/** Blokken op dezelfde verticale stam delen sleuven, zodat elke PDF-knip voor alle rijen veilig is. */
export function lijnAftakkingBlokkenUit(blokken: ReadonlyMap<NodeId, AftakkingBlok>, kolomVan: ReadonlyMap<NodeId, number>): void {
  const breedtesPerKolom = new Map<number, number[]>();
  for (const [id, blok] of blokken) {
    const kolom = kolomVan.get(id)!;
    const breedtes = breedtesPerKolom.get(kolom) ?? [];
    for (const rij of blok.rijen) for (const [i, s] of rij.symbolen.entries()) breedtes[i] = Math.max(breedtes[i] ?? 0, s.maat.breedte);
    breedtesPerKolom.set(kolom, breedtes);
  }
  for (const [id, blok] of blokken) {
    const breedtes = breedtesPerKolom.get(kolomVan.get(id)!)!;
    let x = START_X;
    blok.xVanSymbool = [];
    blok.knipGrenzen = [];
    for (const breedte of breedtes) {
      if (x > START_X) blok.knipGrenzen.push(x - TUSSENRUIMTE / 2);
      blok.xVanSymbool.push(x);
      x += breedte + TUSSENRUIMTE;
    }
    blok.breedte = x + 5;
  }
}

/** Haalt geldige horizontale reeksen uit de al opgeschoonde boom, met gedeelde symboolkolommen. */
export function maakAftakkingBlokken(
  doc: InstallatieDocument,
  volgorde: readonly NodeId[],
  kinderenVan: ReadonlyMap<NodeId, NodeId[]>,
): { blokken: Map<NodeId, AftakkingBlok>; leden: Set<NodeId> } {
  const blokken = new Map<NodeId, AftakkingBlok>();
  const leden = new Set<NodeId>();
  for (const id of volgorde) {
    if (doc.nodes[id]!.type !== "leiding") continue;
    const rijen: AftakkingRij[] = [];
    let hoogte = 0;
    for (const eerste of kinderenVan.get(id)!) {
      const ids: NodeId[] = [];
      let huidig: NodeId | undefined = eerste;
      let geldig = true;
      while (huidig !== undefined) {
        const node = doc.nodes[huidig]!;
        const kinderen: NodeId[] = kinderenVan.get(huidig)!;
        if (!isAftakkingNode(node) || kinderen.length > 1) { geldig = false; break; }
        ids.push(huidig);
        huidig = kinderen[0];
      }
      if (!geldig) continue;
      const symbolen = ids.map((nodeId, i) => {
        const node = doc.nodes[nodeId]!;
        if (node.type !== "schakelaar" && node.type !== "lichtpunt") throw new Error("Geen aftakkingssymbool");
        const s = tekenAftakkingSymbool(node, i === ids.length - 1);
        leden.add(nodeId);
        return s;
      });
      const rijHoogte = symbolen.reduce((max, s) => Math.max(max, s.maat.hoogte), 0);
      const midden = hoogte + TUSSENRUIMTE + rijHoogte / 2;
      hoogte = midden + rijHoogte / 2;
      rijen.push({ ids, symbolen, midden });
    }
    if (!rijen.length) continue;
    blokken.set(id, { rijen, xVanSymbool: [], breedte: 0, hoogte, knipGrenzen: [] });
  }
  return { blokken, leden };
}
