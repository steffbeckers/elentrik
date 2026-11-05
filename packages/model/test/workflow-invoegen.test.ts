import { expect, test } from "vitest";
import * as m from "../src/index";
import { analyseer } from "../../arei/src/index";
function start() {
  const doc = m.nieuwProjectDocument({
    klantNaam: "Test",
    stroomtype: "2x230V",
  });
  return {
    doc,
    bord: Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!.id,
    hoofd: Object.values(doc.nodes).find((n) => n.type === "differentieel")!.id,
  };
}
test("rejects main differential without mutation and reuses existing F unchanged", () => {
  const x = start();
  expect(() =>
    m.voegSjabloonToe(
      x.doc,
      { soort: "bestaande-differentieel", nodeId: x.hoofd },
      "wasmachine",
    ),
  ).toThrow();
  const d = m.voegToe(x.doc, x.bord, {
    ...m.STANDAARD.differentieel,
    referentie: "F",
    gevoeligheid_mA: 100,
  } as m.NodeInvoer);
  const r = m.voegSjabloonToe(
    d.doc,
    { soort: "bestaande-differentieel", nodeId: d.id },
    "wasmachine",
  );
  expect(
    Object.values(r.doc.nodes).filter((n) => n.type === "differentieel"),
  ).toHaveLength(2);
  expect(r.doc.nodes[d.id]).toMatchObject({
    referentie: "F",
    gevoeligheid_mA: 100,
  });
  expect(
    Object.values(r.doc.nodes).find((n) => n.type === "toestel"),
  ).not.toHaveProperty("ruimte");
  expect(m.pasPatchesToe(r.doc, r.inversePatches)).toEqual(d.doc);
});
test.each(["enkel", "wissel", "kruis"] as const)(
  "adds %s light assembly with one reference and separately placeable components",
  (soort) => {
    const x = start();
    const k = m.voegOnderdeelToe(
      x.doc,
      { soort: "rail-einde", nodeId: x.bord },
      "leiding",
    );
    const r = m.voegLichtschakelingToe(
      k.doc,
      { soort: "bestaande-kring", nodeId: k.ids[0]! },
      { schakeling: soort, aantal: 12, lichtsoort: "led" },
    );
    const nieuw = Object.values(r.doc.nodes).filter((n) => !k.doc.nodes[n.id]);
    expect(
      nieuw.filter((n) => n.type === "schakelaar").map((n) => n.soort),
    ).toEqual(
      soort === "enkel"
        ? ["enkel"]
        : soort === "wissel"
          ? ["wissel", "wissel"]
          : ["wissel", "kruis", "wissel"],
    );
    expect(nieuw.filter((n) => n.type === "lichtpunt")).toHaveLength(12);
    expect(
      nieuw.filter((n) => n.type === "lichtpunt").every((n) => n.aantal === 1),
    ).toBe(true);
    const a = analyseer(r.doc);
    expect(new Set(nieuw.map((n) => a.puntLabels[n.id])).size).toBe(1);
    expect(a.kringen[0]!.tellingen.lichtpunten).toBe(12);
    expect(m.valideerStructuur(r.doc)).toEqual([]);
    expect(m.pasPatchesToe(r.doc, r.inversePatches)).toEqual(k.doc);
  },
);
test("new light circuit uses explicit destination and one undo transaction", () => {
  const x = start();
  const r = m.voegLichtschakelingToe(
    x.doc,
    { soort: "nieuw-op-bord", nodeId: x.bord },
    { schakeling: "wissel", aantal: 1 },
  );
  expect(analyseer(r.doc).kringen).toHaveLength(1);
  expect(m.pasPatchesToe(r.doc, r.inversePatches)).toEqual(x.doc);
});
test("an upstream protection without a board ancestor is not an existing light circuit", () => {
  const doc = m.nieuwDocument();
  const teller = doc.nodes[doc.rootId]!.kinderen[0]!;
  const a = m.voegToe(doc, teller, m.NIEUWE_KRING_AUTOMAAT);
  const l = m.voegToe(a.doc, a.id, m.STANDAARD.leiding);
  expect(() =>
    m.voegLichtschakelingToe(
      l.doc,
      { soort: "bestaande-kring", nodeId: a.id },
      { schakeling: "enkel", aantal: 1 },
    ),
  ).toThrow();
});
