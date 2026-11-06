import type { InstallatieDocument, NodeId, NodeType } from "./schema";

export type MateriaalRij = {
  sleutel: string;
  type: NodeType;
  eigenschappen: Record<string, string | number | boolean>;
  hoeveelheid: number;
  eenheid: "stuks" | "m";
  nodeIds: NodeId[];
  ontbrekendeLengtes: number;
};

const GEEN_MATERIAALEIGENSCHAP = new Set([
  "id", "type", "parentId", "kinderen", "aftakking", "label", "ruimte", "ruimteNaam", "naam", "aantal", "aantalPanelen", "puntReferentie", "lengte_m", "plaatsing", "aanleg", "kringCode", "referentie", "metBeschermingsgeleider",
]);

/** Afgeleid van de onderdelen, nooit van plaatsingen of afnemers: elke leiding telt één keer. */
export function materiaallijst(doc: InstallatieDocument): MateriaalRij[] {
  const groepen = new Map<string, MateriaalRij>();
  for (const node of Object.values(doc.nodes)) {
    if (node.type === "aansluiting" || node.type === "teller") continue;
    const eigenschappen: MateriaalRij["eigenschappen"] = {};
    for (const [veld, waarde] of Object.entries(node).sort(([a], [b]) => a.localeCompare(b))) {
      if (!GEEN_MATERIAALEIGENSCHAP.has(veld) && waarde !== undefined) {
        eigenschappen[veld] = waarde as string | number | boolean;
      }
    }
    // Afwezige lichtpuntsoort is het standaardlichtpunt.
    if (node.type === "lichtpunt") eigenschappen.soort = node.soort ?? "standaard";
    const draad = node.type === "leiding" && node.kabeltype.trim().toUpperCase() === "VOB";
    if (node.type === "leiding") eigenschappen.kabeltype = node.kabeltype.trim().toUpperCase();
    if (node.type === "leiding") eigenschappen.metBeschermingsgeleider = node.metBeschermingsgeleider ?? true;
    // VOB wordt per losse draad verkocht; het aantal geleiders bepaalt de meters, niet de uitvoering.
    if (draad) delete eigenschappen.aantalGeleiders;
    const sleutel = JSON.stringify([node.type, eigenschappen]);
    let rij = groepen.get(sleutel);
    if (!rij) {
      rij = { sleutel, type: node.type, eigenschappen, hoeveelheid: 0,
        eenheid: node.type === "leiding" ? "m" : "stuks", nodeIds: [], ontbrekendeLengtes: 0 };
      groepen.set(sleutel, rij);
    }
    rij.nodeIds.push(node.id);
    if (node.type === "leiding") {
      if (node.lengte_m === undefined) rij.ontbrekendeLengtes++;
      else rij.hoeveelheid += node.lengte_m * (draad ? node.aantalGeleiders : 1);
    } else {
      rij.hoeveelheid += node.type === "contactdoos" || node.type === "lichtpunt" ? node.aantal : node.type === "toestel" && node.soort === "pvPaneel" ? node.aantalPanelen ?? 1 : 1;
    }
  }
  return [...groepen.values()];
}
