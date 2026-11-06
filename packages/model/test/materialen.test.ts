import { describe, expect, test } from "vitest";
import * as model from "../src/index";
import type { InstallatieDocument, NodeInvoer } from "../src/index";

function installatie(
  invoer: (NodeInvoer | Record<string, unknown>)[],
): InstallatieDocument {
  let doc = model.nieuwDocument();
  const teller = doc.nodes[doc.rootId]!.kinderen[0]!;
  const bord = model.voegToe(doc, teller, { type: "verdeelbord" });
  const kring = model.voegToe(bord.doc, bord.id, {
    type: "automaat",
    nominaal_A: 16,
    polen: 2,
    curve: "B",
  });
  doc = kring.doc;
  for (const node of invoer) {
    let ouder = kring.id;
    if (node.type !== "leiding") {
      const leiding = model.voegToe(doc, ouder, model.STANDAARD.leiding);
      doc = leiding.doc;
      ouder = leiding.id;
    }
    doc = model.voegToe(doc, ouder, node as NodeInvoer).doc;
  }
  return doc;
}

describe("materiaallijst", () => {
  test("sorteert op soort en dan op specificatie, zodat 30 mA en 300 mA naast elkaar staan", () => {
    let doc = model.nieuwDocument();
    const teller = doc.nodes[doc.rootId]!.kinderen[0]!;
    const bord = model.voegToe(doc, teller, { type: "verdeelbord" });
    doc = bord.doc;
    for (const mA of [300, 30, 300, 100]) {
      doc = model.voegToe(doc, bord.id, { ...model.STANDAARD.differentieel, gevoeligheid_mA: mA } as NodeInvoer).doc;
    }
    const rijen = model.materiaallijst(doc).filter((r) => r.type === "differentieel");
    expect(rijen.map((r) => r.eigenschappen.gevoeligheid_mA)).toEqual([30, 100, 300]);
    const types = model.materiaallijst(doc).map((r) => r.type);
    expect(types).toEqual([...types].sort());
  });

  test("groepeert identieke schakelaars en lampen samen ongeacht de aftakkingsindeling", () => {
    const doc = installatie([
      model.STANDAARD.schakelaar,
      { ...model.STANDAARD.schakelaar, aftakking: true },
      { type: "lichtpunt", aantal: 2 },
      { type: "lichtpunt", aantal: 3, aftakking: true },
    ]);
    const rijen = model
      .materiaallijst(doc)
      .filter((r) => r.type === "schakelaar" || r.type === "lichtpunt");
    expect(rijen.map((r) => [r.type, r.hoeveelheid, r.nodeIds.length])).toEqual(
      [
        ["lichtpunt", 5, 2],
        ["schakelaar", 2, 2],
      ],
    );
    expect(rijen.every((r) => !("aftakking" in r.eigenschappen))).toBe(true);
  });

  test("telt aantallen en groepeert uitvoeringen onafhankelijk van label of ruimte", () => {
    const doc = installatie([
      {
        ...model.STANDAARD.contactdoos,
        aantal: 3,
        label: "A",
        ruimte: "keuken",
        ruimteNaam: "Keuken",
      },
      {
        ...model.STANDAARD.contactdoos,
        aantal: 2,
        label: "B",
        ruimteNaam: "Berging",
      },
      { ...model.STANDAARD.contactdoos, waterdicht: true },
      model.STANDAARD.schakelaar,
      { ...model.STANDAARD.schakelaar, soort: "wissel" },
      { type: "lichtpunt", aantal: 4 },
    ]);
    expect(model.materiaallijst).toBeTypeOf("function");
    const rijen = model.materiaallijst(doc);
    expect(
      rijen.filter((r) => r.type === "contactdoos").map((r) => r.hoeveelheid),
    ).toEqual([5, 1]);
    expect(rijen.filter((r) => r.type === "schakelaar")).toHaveLength(2);
    expect(rijen.find((r) => r.type === "lichtpunt")?.hoeveelheid).toBe(4);
    expect(
      rijen.some((r) => r.type === "aansluiting" || r.type === "teller"),
    ).toBe(false);
  });

  test("telt XVB per kabelmeter en VOB per geleidermeter, zonder dubbeltelling van afnemers", () => {
    const doc = installatie([
      { ...model.STANDAARD.leiding, lengte_m: 10.5 },
      { ...model.STANDAARD.leiding, kabeltype: " xvb ", lengte_m: 2 },
      { ...model.STANDAARD.leiding, kabeltype: "VOB", lengte_m: 10 },
      {
        ...model.STANDAARD.leiding,
        kabeltype: "vob",
        aantalGeleiders: 5,
        lengte_m: 2,
      },
      { ...model.STANDAARD.leiding, doorsnede_mm2: 1.5, lengte_m: 4 },
    ]);
    const rijen = model.materiaallijst(doc).filter((r) => r.type === "leiding");
    expect(rijen.map((r) => r.hoeveelheid)).toEqual([4, 12.5, 40]);
    expect(rijen.every((r) => r.eenheid === "m")).toBe(true);
  });

  test("houdt ontbrekende lengtes bij naast gekende deelhoeveelheden; nul is een ingevulde lengte", () => {
    const doc = installatie([
      model.STANDAARD.leiding,
      { ...model.STANDAARD.leiding, lengte_m: 0 },
      { ...model.STANDAARD.leiding, lengte_m: 7.25 },
    ]);
    expect(
      model.materiaallijst(doc).find((r) => r.type === "leiding"),
    ).toMatchObject({ hoeveelheid: 7.25, ontbrekendeLengtes: 1 });
  });

  test("lege installatie heeft geen materialen", () => {
    expect(model.materiaallijst(model.nieuwDocument())).toEqual([]);
  });

  test("bewaart lengtes, valideert invoer en ondersteunt ongedaan maken en leegmaken", () => {
    const doc = installatie([model.STANDAARD.leiding]);
    const id = Object.values(doc.nodes).find((n) => n.type === "leiding")!.id;
    const gewijzigd = model.wijzigEigenschappen(doc, id, { lengte_m: 12.5 });
    expect(
      model.parseDocument(JSON.parse(JSON.stringify(gewijzigd.doc))),
    ).toEqual(gewijzigd.doc);
    expect(
      model.materiaallijst(gewijzigd.doc).find((r) => r.type === "leiding")
        ?.hoeveelheid,
    ).toBe(12.5);
    expect(
      model.pasPatchesToe(gewijzigd.doc, gewijzigd.inversePatches),
    ).toEqual(doc);
    const leeg = model.wijzigEigenschappen(gewijzigd.doc, id, {
      lengte_m: undefined,
    }).doc;
    expect(
      model.materiaallijst(leeg).find((r) => r.type === "leiding")
        ?.ontbrekendeLengtes,
    ).toBe(1);
    for (const lengte_m of [-1, Infinity, NaN]) {
      expect(() => model.wijzigEigenschappen(doc, id, { lengte_m })).toThrow();
    }
  });
});
test("fire classes distinguish cable materials while route installation and references do not", () => {
  const doc = installatie([
    {
      type: "leiding",
      kabeltype: "XVB",
      doorsnede_mm2: 2.5,
      aantalGeleiders: 3,
      lengte_m: 5,
      brandreactieklasse: "Cca",
      aanleg: { ligging: "inbouw", inBuis: true },
    },
    {
      type: "leiding",
      kabeltype: "XVB",
      doorsnede_mm2: 2.5,
      aantalGeleiders: 3,
      lengte_m: 7,
      brandreactieklasse: "Cca",
      aanleg: { ligging: "opbouw", inBuis: false },
    },
    {
      type: "leiding",
      kabeltype: "XVB",
      doorsnede_mm2: 2.5,
      aantalGeleiders: 3,
      lengte_m: 3,
      brandreactieklasse: "Eca",
    },
  ]);
  const rijen = model.materiaallijst(doc).filter((r) => r.type === "leiding");
  expect(
    rijen.map((r) => [r.eigenschappen.brandreactieklasse, r.hoeveelheid]),
  ).toEqual([
    ["Cca", 12],
    ["Eca", 3],
  ]);
});
