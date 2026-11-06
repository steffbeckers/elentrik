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
test.each(["A", "B"])(
  "duplication rejects effective automatic code %s without renumbering existing circuits",
  (code) => {
    const x = basis();
    const voor = JSON.stringify(x.doc);
    expect(() => m.dupliceerKring(x.doc, x.a, code)).toThrowError(
      expect.objectContaining({
        code: "ONGELDIG_SCHEMA",
        details: expect.objectContaining({ reden: "dubbele referentie", code }),
      }),
    );
    expect(JSON.stringify(x.doc)).toBe(voor);
    expect(m.bepaalKringCodes(x.doc)).toMatchObject({ [x.a]: "A", [x.b]: "B" });
  },
);

test("duplication chooses a free local code while independent subboard codes stay available", () => {
  const x = basis();
  const main = m.dupliceerKring(x.doc, x.a, "C");
  expect(m.bepaalKringCodes(main.doc)).toMatchObject({
    [x.a]: "A",
    [x.b]: "B",
    [main.id]: "C",
  });
  const l = Object.values(x.doc.nodes).find((n) => n.type === "lichtpunt")!;
  const sub = m.voegOnderdeelToe(
    x.doc,
    { soort: "kring-einde", nodeId: l.id },
    "onderbord",
  );
  const k = m.voegOnderdeelToe(
    sub.doc,
    { soort: "rail-einde", nodeId: sub.ids.at(-1)! },
    "lichtpunt",
  );
  const copy = m.dupliceerKring(k.doc, k.ids[0]!, "B");
  expect(m.bepaalKringCodes(copy.doc)).toMatchObject({
    [x.a]: "A",
    [x.b]: "B",
    [k.ids[0]!]: "A",
    [copy.id]: "B",
  });
});

test("an empty node id cannot bypass imported explicit reference collision evidence", () => {
  const x = basis();
  const raw = JSON.parse(JSON.stringify(x.doc).replaceAll(x.a, ""));
  raw.nodes[""].kringCode = "J";
  raw.nodes[x.b].kringCode = "J";
  expect(m.valideerStructuur(raw)).toEqual([]);
  expect(() => m.migreer(raw)).toThrowError(
    expect.objectContaining({
      code: "ONGELDIG_SCHEMA",
      details: { reden: "dubbele referentie", code: "J", nodeIds: ["", x.b] },
    }),
  );
});
test.each([false, true])('imported subboard id hoofd keeps its independent namespace (fixed=%s)', (fixed) => {
  const x = basis();
  const lamp = Object.values(x.doc.nodes).find(n => n.type === 'lichtpunt')!;
  const sub = m.voegOnderdeelToe(x.doc, { soort: 'kring-einde', nodeId: lamp.id }, 'onderbord');
  const kring = m.voegOnderdeelToe(sub.doc, { soort: 'rail-einde', nodeId: sub.ids.at(-1)! }, 'lichtpunt');
  let doc = kring.doc;
  if (fixed) {
    doc = m.wijzigEigenschappen(doc, x.a, { kringCode: 'J' }).doc;
    doc = m.wijzigEigenschappen(doc, kring.ids[0]!, { kringCode: 'J' }).doc;
  }
  const raw = JSON.parse(JSON.stringify(doc).replaceAll(sub.ids.at(-1)!, 'hoofd'));
  if (!fixed) raw.schemaVersion = 1;
  expect(m.valideerStructuur(raw)).toEqual([]);
  const migrated = m.migreer(raw);
  expect(analyseer(migrated).kringen.map(k => k.label)).toEqual(fixed ? ['J','A','A.J'] : ['A','B','B.A']);
  expect(migrated.nodes['hoofd']!.id).toBe('hoofd');
});
function labelsVan(doc: m.InstallatieDocument, ids: string[]): string[] {
  const codes = m.bepaalKringCodes(doc);
  return ids.map((id) => codes[id]!);
}
test("behoudKringCodes: invoegen voor A en B laat de oude kringen A en B", () => {
  const x = basis();
  expect(labelsVan(x.doc, [x.a, x.b])).toEqual(["A", "B"]);
  const nieuw = m.voegToe(x.doc, x.bord, m.NIEUWE_KRING_AUTOMAAT, 0);
  expect(labelsVan(nieuw.doc, [x.a, x.b])).toEqual(["B", "C"]);
  const r = m.behoudKringCodes(x.doc, nieuw.doc);
  expect(labelsVan(r.doc, [x.a, x.b, nieuw.id])).toEqual(["A", "B", "C"]);
  expect(m.pasPatchesToe(r.doc, r.inversePatches)).toEqual(nieuw.doc);
});
test("behoudKringCodes: ongewijzigd document komt ongewijzigd terug", () => {
  const x = basis();
  const r = m.behoudKringCodes(x.doc, x.doc);
  expect(r.patches).toEqual([]);
  expect(r.doc).toBe(x.doc);
});
test("behoudKringCodes: sjabloon vóór een lichtkring laat die kring B", () => {
  const x = basis();
  const d = m.voegToe(x.doc, x.bord, m.STANDAARD.differentieel, 0);
  const na = m.voegSjabloonToe(d.doc, { soort: "bestaande-differentieel", nodeId: d.id }, "badkamer");
  expect(labelsVan(na.doc, [x.b])).not.toEqual(["B"]);
  const r = m.behoudKringCodes(d.doc, na.doc);
  expect(labelsVan(r.doc, [x.a, x.b])).toEqual(["A", "B"]);
});
test("behoudKringCodes: hernummerKringen volgt daarna weer de volgorde", () => {
  const x = basis();
  const nieuw = m.voegToe(x.doc, x.bord, m.NIEUWE_KRING_AUTOMAAT, 0);
  const vast = m.behoudKringCodes(x.doc, nieuw.doc);
  const h = m.hernummerKringen(vast.doc);
  expect(labelsVan(h.doc, [nieuw.id, x.a, x.b])).toEqual(["A", "B", "C"]);
});
test("behoudKringCodes: onderborden houden hun eigen reeks", () => {
  const x = basis();
  const lamp = Object.values(x.doc.nodes).find((n) => n.type === "lichtpunt")!;
  const sub = m.voegOnderdeelToe(x.doc, { soort: "kring-einde", nodeId: lamp.id }, "onderbord");
  const subBord = sub.ids.at(-1)!;
  const k1 = m.voegToe(sub.doc, subBord, m.NIEUWE_KRING_AUTOMAAT);
  const k2 = m.voegToe(k1.doc, subBord, m.NIEUWE_KRING_AUTOMAAT, 0);
  const r = m.behoudKringCodes(k1.doc, k2.doc);
  const codes = m.bepaalKringCodes(r.doc);
  expect(codes[k1.id]).toBe("A");
  expect(codes[k2.id]).toBe("B");
  expect(codes[x.a]).toBe("A");
  expect(codes[x.b]).toBe("B");
});
