import type { TePlaatsenGroep } from "./items";
export function filterPlaatskeuzes(groepen: readonly TePlaatsenGroep[], labels: ReadonlyMap<string, string>, zoek: string, kring: string): TePlaatsenGroep[] {
  const term = zoek.trim().toLocaleLowerCase();
  return groepen.filter(g => !kring || g.kringLabel === kring).map(g => ({
    ...g, nodeIds: g.nodeIds.filter(id => !term || (labels.get(id) ?? "").toLocaleLowerCase().includes(term)),
  })).filter(g => g.nodeIds.length > 0);
}
export function volgendPunt(ids: readonly string[], huidig: string): string | null {
  const index = ids.indexOf(huidig);
  return index < 0 ? null : ids[index + 1] ?? null;
}
