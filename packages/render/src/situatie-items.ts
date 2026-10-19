// Pure afleiding van het situatieschema uit het document.
import type { Analyse } from "@elentrik/arei";
import type { InstallatieDocument, NodeId, NodeType } from "@elentrik/model";
import { tekenSymbool } from "@elentrik/symbols";
import type { SituatieItem } from "./situatie-svg";

/** De tekst voor een node zonder label (een punt zonder kring, een naamloos bord); de UI vertaalt het type. */
export type LabelTerugval = (type: NodeType) => string;

const GEEN_TERUGVAL: LabelTerugval = () => "";

/** Een symbool op het plan is de lange zijde van het raster gedeeld door dit getal. */
export const SYMBOOL_DELER = 60;

/** Symboolgrootte in rasterpixels: de lange zijde van het raster / 60. Gedeeld door de editor en de pdf. */
export function symboolGrootte(achtergrond: { breedte_px: number; hoogte_px: number }): number {
  return Math.max(achtergrond.breedte_px, achtergrond.hoogte_px) / SYMBOOL_DELER;
}

/**
 * Het label van een node op het plan, in "Te plaatsen" en in meldingen: het puntlabel uit de
 * analyse, voor een verdeelbord zijn naam, anders `terugval(type)`. Een onbekende node geeft "".
 */
export function nodeLabel(
  doc: InstallatieDocument,
  analyse: Analyse,
  nodeId: NodeId,
  terugval: LabelTerugval = GEEN_TERUGVAL,
): string {
  const node = doc.nodes[nodeId];
  if (!node) return "";
  const label = analyse.puntLabels[nodeId] ?? (node.type === "verdeelbord" ? (node.naam ?? "") : "");
  return label || terugval(node.type);
}

/**
 * De geplaatste symbolen van één pagina. Het label volgt het eendraadschema (`puntLabels`),
 * dus het hernummert mee als er een punt wegvalt. Een onbekende pagina geeft een lege lijst.
 */
export function situatieItems(
  doc: InstallatieDocument,
  analyse: Analyse,
  paginaId: string,
  terugval: LabelTerugval = GEEN_TERUGVAL,
): SituatieItem[] {
  const pagina = doc.situatie.paginas.find((p) => p.id === paginaId);
  if (!pagina) return [];
  const items: SituatieItem[] = [];
  for (const plaatsing of pagina.plaatsingen) {
    const node = doc.nodes[plaatsing.nodeId];
    if (!node) continue;
    items.push({
      nodeId: plaatsing.nodeId,
      symbool: tekenSymbool(node),
      x: plaatsing.x,
      y: plaatsing.y,
      rotatie: plaatsing.rotatie,
      label: nodeLabel(doc, analyse, plaatsing.nodeId, terugval),
    });
  }
  return items;
}
