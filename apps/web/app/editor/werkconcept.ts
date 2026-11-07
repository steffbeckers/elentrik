/** Optional nested fields use the same dot path as the document command. */
export function veldWaarde(node: unknown, sleutel: string): unknown {
  return sleutel.split(".").reduce<unknown>((waarde, deel) =>
    waarde && typeof waarde === "object" && Object.hasOwn(waarde, deel)
      ? (waarde as Record<string, unknown>)[deel] : undefined, node);
}
type VerlatenConcept = { ids: string[]; waarden: Record<string, string> };
/** Invalid text belongs to its selection, never to whichever node is selected next. */
export class Werkconcepten {
  tekst: Record<string, string> = {};
  ongeldig: Record<string, boolean> = {};
  verlaten: VerlatenConcept[] = [];
  private ids: string[] = [];
  selecteer(ids: readonly string[]): void {
    const waarden = Object.fromEntries(Object.entries(this.tekst).filter(([sleutel]) => this.ongeldig[sleutel]));
    this.verwerp(this.ids);
    if (Object.keys(waarden).length) this.verlaten.push({ ids: [...this.ids], waarden });
    this.ids = [...ids];
    const oud = this.verlaten.find(c => this.sleutel(c.ids) === this.sleutel(ids));
    this.tekst = { ...oud?.waarden };
    this.ongeldig = Object.fromEntries(Object.keys(this.tekst).map(k => [k, true]));
    this.verwerp(ids);
  }
  invoer(sleutel: string, tekst: string, geldig: boolean): void {
    this.tekst[sleutel] = tekst;
    this.ongeldig[sleutel] = !geldig;
  }
  verlaat(sleutel: string): void { if (!this.ongeldig[sleutel]) this.herstel(sleutel); }
  herstel(sleutel: string): void { delete this.tekst[sleutel]; delete this.ongeldig[sleutel]; }
  verwerp(ids: readonly string[]): void { this.verlaten = this.verlaten.filter(c => this.sleutel(c.ids) !== this.sleutel(ids)); }
  private sleutel(ids: readonly string[]): string { return JSON.stringify([...ids].sort()); }
}
