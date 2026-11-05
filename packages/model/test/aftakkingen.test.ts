import { describe, expect, test } from "vitest";
import {
  magToevoegen, nieuwProjectDocument, parseDocument, pasPatchesToe, valideerStructuur,
  verwijder, verwijderEnkel, voegOnderdeelToe, voegToe, wijzigEigenschappen,
} from "../src/index";

function basis() {
  const doc = nieuwProjectDocument({ klantNaam: "Aftakkingen", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!;
  const kring = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "leiding");
  return { doc: kring.doc, leiding: kring.ids[1]! };
}

describe("vrij opbouwbare aftakkingen", () => {
  test("twee aftakkingen aan dezelfde leiding, afzonderlijk uitbreiden en opslaan", () => {
    const { doc, leiding } = basis();
    const a = voegOnderdeelToe(doc, { soort: "aftakking", nodeId: leiding }, "schakelaar");
    const b = voegOnderdeelToe(a.doc, { soort: "aftakking", nodeId: leiding }, "schakelaar", { soort: "wissel" });
    const c = voegOnderdeelToe(b.doc, { soort: "aftakking-einde", nodeId: b.ids[0]! }, "schakelaar", { soort: "wissel" });
    const d = voegOnderdeelToe(c.doc, { soort: "aftakking-einde", nodeId: c.ids[0]! }, "lichtpunt", { aantal: 2 });
    expect(d.doc.nodes[leiding]!.kinderen).toEqual([a.ids[0], b.ids[0]]);
    for (const id of [...a.ids, ...b.ids, ...c.ids, ...d.ids]) expect(d.doc.nodes[id]).toMatchObject({ aftakking: true });
    expect(d.doc.nodes[d.ids[0]!]).toMatchObject({ type: "lichtpunt", aantal: 2 });
    expect(valideerStructuur(d.doc)).toEqual([]);
    expect(parseDocument(JSON.parse(JSON.stringify(d.doc)))).toEqual(d.doc);
    expect(pasPatchesToe(d.doc, d.inversePatches)).toEqual(c.doc);
    expect(pasPatchesToe(c.doc, d.patches)).toEqual(d.doc);
  });

  test("weigert ongeldige doelen, types en een splitsing binnen een aftakking", () => {
    const { doc, leiding } = basis();
    const a = voegOnderdeelToe(doc, { soort: "aftakking", nodeId: leiding }, "schakelaar");
    const id = a.ids[0]!;
    expect(magToevoegen(a.doc, { soort: "aftakking", nodeId: id }, "lichtpunt")).toBe(false);
    expect(magToevoegen(a.doc, { soort: "aftakking-einde", nodeId: leiding }, "lichtpunt")).toBe(false);
    expect(magToevoegen(a.doc, { soort: "aftakking-einde", nodeId: id }, "leiding")).toBe(false);
    expect(magToevoegen(a.doc, { soort: "kring-einde", nodeId: id }, "lichtpunt")).toBe(false);
    expect(() => voegToe(a.doc, id, { type: "lichtpunt", aantal: 1 })).toThrow();
    expect(() => wijzigEigenschappen(a.doc, id, { aftakking: undefined })).toThrow();
    const b = voegOnderdeelToe(a.doc, { soort: "aftakking-einde", nodeId: id }, "lichtpunt");
    expect(magToevoegen(b.doc, { soort: "aftakking-einde", nodeId: id }, "lichtpunt")).toBe(false);
    expect(magToevoegen(a.doc, { soort: "aftakking", nodeId: leiding }, "lichtpunt", { aantal: 0 })).toBe(false);
  });

  test("verwijderen van eerste, middelste, laatste en hele aftakking houdt structuur en undo intact", () => {
    const { doc, leiding } = basis();
    const a = voegOnderdeelToe(doc, { soort: "aftakking", nodeId: leiding }, "schakelaar");
    const b = voegOnderdeelToe(a.doc, { soort: "aftakking-einde", nodeId: a.ids[0]! }, "schakelaar");
    const c = voegOnderdeelToe(b.doc, { soort: "aftakking-einde", nodeId: b.ids[0]! }, "lichtpunt");
    for (const id of [a.ids[0]!, b.ids[0]!, c.ids[0]!]) {
      const r = verwijderEnkel(c.doc, id);
      expect(valideerStructuur(r.doc)).toEqual([]);
      expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(c.doc);
    }
    const weg = verwijder(c.doc, a.ids[0]!);
    expect(weg.doc.nodes[leiding]!.kinderen).toEqual([]);
    expect(pasPatchesToe(weg.doc, weg.inversePatches)).toEqual(c.doc);
    expect(verwijderEnkel(a.doc, a.ids[0]!).doc.nodes[leiding]!.kinderen).toEqual([]);
  });
});
