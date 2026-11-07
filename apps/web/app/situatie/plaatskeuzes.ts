import type { TePlaatsenGroep } from "./items";
export function filterPlaatskeuzes(groepen: readonly TePlaatsenGroep[], labels: ReadonlyMap<string, string>, zoek: string, kring: string): TePlaatsenGroep[] {
  const term = zoek.trim().toLocaleLowerCase();
  return groepen.filter(g => !kring || g.kringLabel === kring).map(g => ({
    ...g, nodeIds: g.nodeIds.filter(id => !term || (labels.get(id) ?? "").toLocaleLowerCase().includes(term)),
  })).filter(g => g.nodeIds.length > 0);
}
/** Wat "Doorgaan met volgend punt" na een plaatsing doet. */
export type Doorgaan =
  | { soort: "volgend"; nodeId: string }
  /** De groep (kring) van het geplaatste punt is af: stoppen en dat melden. */
  | { soort: "kringKlaar"; kringLabel: string }
  | { soort: "stop" };

/**
 * Het volgende punt na `huidig`, binnen dezelfde groep (kring). Aan het einde van de groep stopt het:
 * het gaat nooit stil naar een volgende kring of naar de verdeelborden.
 */
export function volgendPunt(groepen: readonly TePlaatsenGroep[], huidig: string): Doorgaan {
  for (const groep of groepen) {
    const index = groep.nodeIds.indexOf(huidig);
    if (index < 0) continue;
    const volgend = groep.nodeIds[index + 1];
    return volgend === undefined ? { soort: "kringKlaar", kringLabel: groep.kringLabel } : { soort: "volgend", nodeId: volgend };
  }
  return { soort: "stop" };
}
