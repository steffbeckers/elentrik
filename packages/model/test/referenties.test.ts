import { expect, test } from "vitest";
import * as m from "../src/index";
import { analyseer } from "../../arei/src/index";
function basis() {
  let doc = m.nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(
    (n) => n.type === "verdeelbord",
  )!.id;
  const a = m.voegOnderdeelToe(
    doc,
    { soort: "rail-einde", nodeId: bord },
    "contactdoos",
  );
  const b = m.voegOnderdeelToe(
    a.doc,
    { soort: "rail-einde", nodeId: bord },
    "lichtpunt",
  );
  return { doc: b.doc, bord, a: a.ids[0]!, b: b.ids[0]! };
}
test("manual J remains J with J1 after inserting ahead; undo and reload preserve ids", () => {
  const x = basis();
  const r = m.wijzigEigenschappen(x.doc, x.a, { kringCode: "J" });
  expect(analyseer(r.doc).kringen.map((k) => k.label)).toEqual(["J", "A"]);
  expect(Object.values(analyseer(r.doc).puntLabels)).toEqual(["J1", "A1"]);
  const n = m.voegToe(r.doc, x.bord, m.NIEUWE_KRING_AUTOMAAT, 0);
  expect(
    analyseer(m.migreer(JSON.parse(JSON.stringify(n.doc)))).kringen.map(
      (k) => k.label,
    ),
  ).toEqual(["A", "J", "B"]);
  expect(m.pasPatchesToe(n.doc, n.inversePatches)).toEqual(r.doc);
});
test("reserves differential references before automatic codes and rejects collisions atomically", () => {
  const x = basis();
  const d = m.voegToe(x.doc, x.bord, {
    ...m.STANDAARD.differentieel,
    referentie: "A",
  } as m.NodeInvoer);
  expect(analyseer(d.doc).kringen.map((k) => k.label)).toEqual(["B", "C"]);
  expect(() => m.wijzigEigenschappen(d.doc, x.a, { kringCode: "A" })).toThrow();
  expect(() =>
    m.wijzigEigenschappen(
      m.wijzigEigenschappen(x.doc, x.a, { kringCode: "J" }).doc,
      x.b,
      { kringCode: "J" },
    ),
  ).toThrow();
});
test("freeze and explicit renumber each produce one reversible transaction with preview", () => {
  const x = basis();
  const fixed = m.legKringCodesVast(x.doc);
  expect(fixed.doc.nodes[x.a]).toHaveProperty("kringCode", "A");
  const changed = m.wijzigEigenschappen(fixed.doc, x.a, { kringCode: "J" });
  expect(m.voorbeeldHernummering(changed.doc)).toContainEqual({
    nodeId: x.a,
    oud: "J",
    nieuw: "A",
  });
  const r = m.hernummerKringen(changed.doc);
  expect(analyseer(r.doc).kringen.map((k) => k.label)).toEqual(["A", "B"]);
  expect(m.pasPatchesToe(r.doc, r.inversePatches)).toEqual(changed.doc);
});
test("imported duplicate explicit references produce targeted error", () => {
  const x = basis();
  const raw = JSON.parse(JSON.stringify(x.doc));
  raw.nodes[x.a].kringCode = "J";
  raw.nodes[x.b].kringCode = "J";
  expect(() => m.migreer(raw)).toThrowError(
    expect.objectContaining({
      code: "ONGELDIG_SCHEMA",
      details: expect.objectContaining({
        reden: "dubbele referentie",
        code: "J",
      }),
    }),
  );
});

test("J point series survives freeze, removal, duplication with chosen code and undo", () => {
  const x = basis();
  let doc = m.wijzigEigenschappen(x.doc, x.a, { kringCode: "J" }).doc;
  let einde = Object.values(doc.nodes).find(
    (n) => n.type === "contactdoos",
  )!.id;
  for (let i = 1; i < 7; i++) {
    const r = m.voegOnderdeelToe(
      doc,
      { soort: "kring-einde", nodeId: einde },
      "contactdoos",
    );
    doc = r.doc;
    einde = r.ids[0]!;
  }
  expect(
    Object.values(analyseer(doc).puntLabels).filter((l) => l.startsWith("J")),
  ).toEqual(["J1", "J2", "J3", "J4", "J5", "J6", "J7"]);
  expect(() => m.dupliceerKring(doc, x.a, "J")).toThrow();
  const kopie = m.dupliceerKring(doc, x.a, "K");
  expect(analyseer(kopie.doc).kringen.map((k) => k.label)).toEqual([
    "J",
    "A",
    "K",
  ]);
  expect(m.pasPatchesToe(kopie.doc, kopie.inversePatches)).toEqual(doc);
  expect(
    analyseer(m.verwijder(kopie.doc, x.b).doc).kringen.map((k) => k.label),
  ).toEqual(["J", "K"]);
});
test("subboard references are local with the existing prefix", () => {
  const x = basis();
  const l = Object.values(x.doc.nodes).find((n) => n.type === "lichtpunt")!.id;
  const sub = m.voegOnderdeelToe(
    x.doc,
    { soort: "kring-einde", nodeId: l },
    "onderbord",
  );
  const b = m.wijzigEigenschappen(sub.doc, sub.ids.at(-1)!, { naam: "Garage" });
  const k = m.voegToe(b.doc, sub.ids.at(-1)!, {
    ...m.NIEUWE_KRING_AUTOMAAT,
    kringCode: "J",
  } as m.NodeInvoer);
  const hoofd = m.wijzigEigenschappen(k.doc, x.a, { kringCode: "J" });
  expect(analyseer(hoofd.doc).kringen.map((k) => k.label)).toEqual([
    "J",
    "A",
    "Garage.J",
  ]);
});
test("node ids matching Object prototype names still receive circuit codes", () => {
  const x = basis();
  const raw = JSON.parse(
    JSON.stringify(x.doc)
      .replaceAll(x.a, "constructor")
      .replaceAll(x.b, "__proto__"),
  );
  expect(analyseer(raw).kringen.map((k) => k.label)).toEqual(["A", "B"]);
});
