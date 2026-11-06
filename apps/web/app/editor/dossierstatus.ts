import type { Analyse } from "@elentrik/arei";
import type { InstallatieDocument, NodeId } from "@elentrik/model";
import { ongeplaatstNaam, TEKSTEN, type Taal } from "@elentrik/render";

export { dossierStatus } from "@elentrik/render";

/** De ongeplaatste onderdelen met dezelfde benoeming als de bijlage van de pdf ("I3", "PV-installatie", "aardingsonderbreker"). */
export function ongeplaatsteOnderdelen(doc: InstallatieDocument, analyse: Analyse, ids: readonly NodeId[], taal: Taal): { id: NodeId; naam: string }[] {
  return ids.map((id) => ({ id, naam: ongeplaatstNaam(doc, analyse, id, TEKSTEN[taal]) })).filter((o) => o.naam !== "");
}

/** Selecteert een ongeplaatst onderdeel op het eendraadschema, waar elk onderdeel te vinden is. */
export function kiesOngeplaatst(store: { selectie: NodeId[]; tabblad: string }, id: NodeId): void {
  store.tabblad = "eendraadschema";
  store.selectie = [id];
}
