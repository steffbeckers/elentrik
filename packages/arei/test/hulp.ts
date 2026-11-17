import { expect } from "vitest";
import { nieuwDocument, voegToe, type InstallatieDocument, type NodeId } from "@elentrik/model";
import { controleer, type Bevinding, type Regel } from "../src/index";

/** Diepe kopie via JSON (structuredClone is niet beschikbaar met lib ES2023 zonder DOM/Node-types). */
export function kloon<T>(waarde: T): T {
  return JSON.parse(JSON.stringify(waarde)) as T;
}

/** Voert één regel uit op het document en controleert dat ze alleen aangekondigde sleutels gebruikt. */
export function draaiRegel(regel: Regel, doc: InstallatieDocument): Bevinding[] {
  const bevindingen = controleer(doc, { id: "test", versie: 1, gepubliceerd: false, regels: [regel] });
  verwachtBekendeSleutels(regel, bevindingen);
  return bevindingen;
}

/** Kopie van het document met de gegeven installatiecontext; zonder context verdwijnt het veld. */
export function metContext(
  doc: InstallatieDocument,
  context: "nieuw" | "bestaand" | "onbekend" | undefined,
): InstallatieDocument {
  const kopie = kloon(doc);
  delete kopie.meta.installatieContext;
  if (context !== undefined) kopie.meta.installatieContext = context;
  return kopie;
}

/** Kopie van het document met een geregistreerde aardingsweerstand. */
export function metAardingsweerstand(doc: InstallatieDocument, ohm: number): InstallatieDocument {
  const kopie = kloon(doc);
  kopie.meta.metingen = { ...kopie.meta.metingen, aardingsweerstand_ohm: ohm };
  return kopie;
}

export const tellerVan = (doc: InstallatieDocument): NodeId => doc.nodes[doc.rootId]!.kinderen[0]!;

/** Elke bevinding komt van de regel zelf en gebruikt een sleutel die de regel aankondigt. */
export function verwachtBekendeSleutels(regel: Regel, bevindingen: readonly Bevinding[]): void {
  for (const b of bevindingen) {
    expect(b.regelId, `regelId van ${b.berichtSleutel}`).toBe(regel.id);
    expect(regel.berichtSleutels, `sleutel ${b.berichtSleutel} van ${regel.id}`).toContain(b.berichtSleutel);
  }
}

/** Teller > automaat 32 A > leiding 6 mm² > `n` contactdozen (hintereen), zonder verdeelbord. */
export function automaatZonderBord(n: number): { doc: InstallatieDocument; puntIds: NodeId[] } {
  let doc = nieuwDocument();
  const teller = doc.nodes[doc.rootId]!.kinderen[0]!;
  const automaat = voegToe(doc, teller, { type: "automaat", nominaal_A: 32, polen: 2, curve: "B" });
  const leiding = voegToe(automaat.doc, automaat.id, {
    type: "leiding",
    kabeltype: "XVB",
    doorsnede_mm2: 6,
    aantalGeleiders: 3,
  });
  doc = leiding.doc;
  const puntIds: NodeId[] = [];
  let ouder = leiding.id;
  for (let i = 0; i < n; i++) {
    const punt = voegToe(doc, ouder, {
      type: "contactdoos",
      aantal: 1,
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
    });
    doc = punt.doc;
    puntIds.push(punt.id);
    ouder = punt.id;
  }
  return { doc, puntIds };
}
