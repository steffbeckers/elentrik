import { expect, test } from "vitest";
import * as m from "../src/index";
import { analyseer } from "../../arei/src/index";
function start() {
  const doc = m.nieuwProjectDocument({
    klantNaam: "Bron",
    stroomtype: "2x230V",
  });
  const diff = Object.values(doc.nodes).find(
    (n) => n.type === "differentieel",
  )!;
  const bord = Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!;
  return { doc, diff: diff.id, bord: bord.id, teller: diff.parentId! };
}
test("main cable inserts between meter and existing main RCD with all existing ids retained", () => {
  const x = start();
  const before = m.wijzigEigenschappen(x.doc, x.diff, { referentie: "A" }).doc;
  const r = m.voegInVoor(before, x.diff, {
    type: "leiding",
    kabeltype: "XVB",
    aantalGeleiders: 4,
    doorsnede_mm2: 10,
    metBeschermingsgeleider: false,
  });
  expect(r.doc.nodes[x.teller]!.kinderen).toEqual([r.id]);
  expect(r.doc.nodes[r.id]!.kinderen).toEqual([x.diff]);
  expect(r.doc.nodes[x.diff]).toMatchObject({
    ...before.nodes[x.diff],
    parentId: r.id,
  });
  expect(Object.keys(r.doc.nodes).filter((id) => id !== r.id)).toEqual(
    Object.keys(before.nodes),
  );
  expect(m.valideerStructuur(r.doc)).toEqual([]);
  expect(m.pasPatchesToe(r.doc, r.inversePatches)).toEqual(before);
  expect(m.pasPatchesToe(before, r.patches)).toEqual(r.doc);
});
test("EV RCD inserts between B breaker and cable without moving siblings descendants placements or references", () => {
  const x = start();
  const a = m.voegOnderdeelToe(
    x.doc,
    { soort: "rail-einde", nodeId: x.bord },
    "lichtpunt",
  );
  const b = m.voegOnderdeelToe(
    a.doc,
    { soort: "rail-einde", nodeId: x.bord },
    "toestel",
    { soort: "laadpaal" },
  );
  const fixed = m.wijzigEigenschappen(b.doc, b.ids[0]!, { kringCode: "B" }).doc;
  const before = JSON.parse(JSON.stringify(fixed)) as m.InstallatieDocument;
  before.situatie.paginas = [
    {
      id: "plan",
      titel: "Plan",
      plaatsingen: [{ nodeId: b.ids[2]!, x: 12, y: 34, rotatie: 90 }],
    },
  ];
  const r = m.voegInVoor(before, b.ids[1]!, m.STANDAARD.differentieel);
  expect(r.doc.nodes[b.ids[0]!]!.kinderen).toEqual([r.id]);
  expect(r.doc.nodes[r.id]!.kinderen).toEqual([b.ids[1]]);
  expect(r.doc.nodes[b.ids[1]!]!.parentId).toBe(r.id);
  expect(r.doc.nodes[b.ids[2]!]).toEqual(before.nodes[b.ids[2]!]);
  expect(r.doc.nodes[x.bord]!.kinderen).toEqual(before.nodes[x.bord]!.kinderen);
  expect(r.doc.situatie).toEqual(before.situatie);
  expect(analyseer(r.doc).puntLabels).toEqual(analyseer(before).puntLabels);
  expect(m.valideerStructuur(r.doc)).toEqual([]);
  expect(m.pasPatchesToe(r.doc, r.inversePatches)).toEqual(before);
});
test("invalid link root incompatible type and aftakking boundary never mutate the document", () => {
  const x = start();
  const k = m.voegOnderdeelToe(
    x.doc,
    { soort: "rail-einde", nodeId: x.bord },
    "leiding",
  );
  const branch = m.voegOnderdeelToe(
    k.doc,
    { soort: "aftakking", nodeId: k.ids[1]! },
    "schakelaar",
  );
  const cases: [string, m.NodeInvoer][] = [
    [branch.doc.rootId, m.STANDAARD.leiding],
    [x.teller, m.STANDAARD.leiding],
    [branch.ids[0]!, m.STANDAARD.leiding],
    [k.ids[1]!, m.STANDAARD.lichtpunt],
    ["constructor", m.STANDAARD.leiding],
  ];
  for (const [id, invoer] of cases) {
    const before = JSON.stringify(branch.doc);
    expect(m.magInvoegenVoor(branch.doc, id, invoer)).toBe(false);
    expect(() => m.voegInVoor(branch.doc, id, invoer)).toThrow(m.DocumentFout);
    expect(JSON.stringify(branch.doc)).toBe(before);
  }
  const raw = JSON.parse(JSON.stringify(k.doc));
  raw.nodes[k.ids[0]!].kinderen = [];
  const before = JSON.stringify(raw);
  expect(() => m.voegInVoor(raw, k.ids[1]!, m.STANDAARD.differentieel)).toThrow(
    m.DocumentFout,
  );
  expect(JSON.stringify(raw)).toBe(before);
});

test("inserting an explicitly referenced RCD cannot silently renumber existing automatic circuits", () => {
  const x = start();
  const k = m.voegOnderdeelToe(
    x.doc,
    { soort: "rail-einde", nodeId: x.bord },
    "leiding",
  );
  const input = {
    ...m.STANDAARD.differentieel,
    referentie: "A",
  } as m.NodeInvoer;
  expect(m.magInvoegenVoor(k.doc, k.ids[1]!, input)).toBe(false);
  expect(() => m.voegInVoor(k.doc, k.ids[1]!, input)).toThrow(m.DocumentFout);
  expect(analyseer(k.doc).kringen.map((k) => k.label)).toEqual(["A"]);
});

test("new-to-child validation and injected structure fields reject before any mutation", () => {
  const x = start();
  const k = m.voegOnderdeelToe(
    x.doc,
    { soort: "rail-einde", nodeId: x.bord },
    "contactdoos",
  );
  const before = JSON.stringify(k.doc);
  expect(m.magInvoegenVoor(k.doc, k.ids[2]!, m.STANDAARD.differentieel)).toBe(
    false,
  );
  expect(() =>
    m.voegInVoor(k.doc, k.ids[2]!, m.STANDAARD.differentieel),
  ).toThrow(m.DocumentFout);
  expect(() =>
    m.voegInVoor(k.doc, k.ids[1]!, {
      ...m.STANDAARD.leiding,
      id: "injected",
    } as unknown as m.NodeInvoer),
  ).toThrow(m.DocumentFout);
  expect(JSON.stringify(k.doc)).toBe(before);
});
