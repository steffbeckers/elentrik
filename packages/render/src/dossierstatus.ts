import type { Analyse } from "@elentrik/arei";
import type { InstallatieDocument, NodeId } from "@elentrik/model";
import { nodeLabel } from "./situatie-items";
import { tePlaatsen } from "./te-plaatsen";
import type { Teksten } from "./teksten/index";

/** Completeness includes all placeable components, including infrastructure. This is separate
 * from electrical point findings: an unplaced meter is incomplete, not an electrical violation.
 * Missing measurements are incomplete too; a recorded value is never judged (0 counts as filled in). */
export function dossierStatus(doc: InstallatieDocument | null, analyse: Analyse | null) {
  const ontbreekt: ("klant" | "werfadres" | "context" | "schema" | "aardingsweerstand" | "isolatieweerstand")[] = [];
  if (!doc?.meta.klant.naam.trim()) ontbreekt.push("klant");
  const adres = doc?.meta.werfadres;
  if (!adres || ![adres.straat, adres.nummer, adres.postcode, adres.gemeente].every(v => v.trim())) ontbreekt.push("werfadres");
  if (!doc?.meta.installatieContext || doc.meta.installatieContext === "onbekend") ontbreekt.push("context");
  if (!analyse?.kringen.length) ontbreekt.push("schema");
  if (doc?.meta.metingen?.aardingsweerstand_ohm === undefined) ontbreekt.push("aardingsweerstand");
  if (doc?.meta.metingen?.isolatieweerstand_MOhm === undefined) ontbreekt.push("isolatieweerstand");
  const paginas = (doc?.situatie.paginas ?? []).filter(p => !p.referentie);
  const plannen = paginas.filter(p => p.achtergrond).length;
  const zonderPlan = paginas.filter(p => !p.achtergrond).length;
  const ongeplaatsteIds = doc && analyse ? tePlaatsen(doc, analyse).flatMap(g => g.nodeIds) : [];
  const ongeplaatst = ongeplaatsteIds.length;
  return { ontbreekt, plannen, zonderPlan, ongeplaatst, ongeplaatsteIds,
    volledig: !!doc && !!analyse && !ontbreekt.length && plannen > 0 && !zonderPlan && !ongeplaatst };
}

/** Het label van het onderwerp van een node: het puntlabel, "Kring A" voor een kringbeveiliging, anders `nodeLabel`. */
export function onderwerpLabel(doc: InstallatieDocument, analyse: Analyse, nodeId: NodeId, teksten: Teksten): string {
  const punt = analyse.puntLabels[nodeId];
  if (punt) return punt;
  const kring = analyse.kringen.find((k) => k.beveiligingId === nodeId);
  if (kring) return `${teksten.kolommen.kring} ${kring.label}`;
  return nodeLabel(doc, analyse, nodeId, (type) => teksten.types[type]);
}

/** Hoe een ongeplaatst onderdeel genoemd wordt in de dossierchecklist en in de bijlage van de pdf: label, naam en omschrijving, zonder dubbels. */
export function ongeplaatstNaam(doc: InstallatieDocument, analyse: Analyse, nodeId: NodeId, teksten: Teksten): string {
  const node = doc.nodes[nodeId];
  if (!node) return "";
  const naam = node.type === "toestel" ? `${teksten.types.toestel} (${teksten.toestelsoorten[node.soort]})` : onderwerpLabel(doc, analyse, nodeId, teksten);
  const omschrijving = node.label?.trim();
  const label = analyse.puntLabels[nodeId];
  return [...new Set([label, naam, omschrijving].filter(Boolean))].join(" — ");
}
