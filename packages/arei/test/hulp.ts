import { expect } from "vitest";
import { nieuwDocument, voegToe, type InstallatieDocument, type NodeId } from "@elentrik/model";
import type { Bevinding, Regel } from "../src/index";

/** Diepe kopie via JSON (structuredClone is niet beschikbaar met lib ES2023 zonder DOM/Node-types). */
export function kloon<T>(waarde: T): T {
  return JSON.parse(JSON.stringify(waarde)) as T;
}

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
