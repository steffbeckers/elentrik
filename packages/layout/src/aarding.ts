import type { InstallatieDocument, NodeId } from "@elentrik/model";
import { tekenSymbool } from "@elentrik/symbols";
import { tekstBreedte } from "./labels";
import type { Strook } from "./types";

/** Board containment is not a phase connection. Show earthing in a separate labelled PE section. */
export function voegAardingsSectiesToe(strook: Strook, doc: InstallatieDocument, roots: NodeId[], minTekst: number): void {
  const getekend = new Set<NodeId>();
  for (const rootId of roots) {
    if (getekend.has(rootId)) continue;
    const root = doc.nodes[rootId]!;
    const kinderen = root.type === "aardingsonderbreker" ? root.kinderen.filter(id => Object.hasOwn(doc.nodes, id) && doc.nodes[id]!.type === "aardelektrode" && !getekend.has(id)) : [];
    const bord = root.parentId && Object.hasOwn(doc.nodes, root.parentId) ? doc.nodes[root.parentId] : undefined;
    const titel = `PE${bord?.type === "verdeelbord" && bord.naam?.trim() ? ` · ${bord.naam}` : ""}`;
    const grootte = Math.max(2.5, minTekst);
    const links = strook.breedte + 4;
    const kolom = strook.kolomGrenzen.length - 1;
    const y = Math.max(10, strook.hoogte - (kinderen.length ? 32 : 18));
    const teken = (id: NodeId, x: number, top: number): void => {
      getekend.add(id);
      const symbool = tekenSymbool(doc.nodes[id]!);
      strook.elementen.push({ soort: "symbool", nodeId: id, x, y: top, symbool });
      strook.vakken[id] = { x, y: top, breedte: symbool.maat.breedte, hoogte: symbool.maat.hoogte };
      strook.kolomVan[id] = kolom;
    };
    strook.elementen.push({ soort: "tekst", rol: "technisch", tekst: titel, x: links, y: y - 3, grootte, anker: "start" });
    teken(rootId, links, y);
    for (const [i, id] of kinderen.entries()) {
      const x = links + i * 24;
      teken(id, x, y + 14);
      if (i === 0) strook.elementen.push({ soort: "lijn", rol: "aarding", x1: links + 5, y1: y + 10, x2: x + 5, y2: y + 14 });
      else {
        strook.elementen.push({ soort: "lijn", rol: "aarding", x1: links + 5, y1: y + 12, x2: x + 5, y2: y + 12 });
        strook.elementen.push({ soort: "lijn", rol: "aarding", x1: x + 5, y1: y + 12, x2: x + 5, y2: y + 14 });
      }
    }
    if (root.type === "aardingsonderbreker" && !kinderen.length) strook.aanknopingen.push({ soort: "kring-einde", nodeId: rootId, x: links + 5, y: y + 15 });
    strook.breedte = links + Math.max(24, kinderen.length * 24, tekstBreedte(titel, grootte) + 4);
    strook.hoogte = Math.max(strook.hoogte, y + (kinderen.length ? 28 : 20));
    strook.kolomGrenzen.push(strook.breedte);
  }
}
