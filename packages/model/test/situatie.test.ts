import { describe, expect, test } from "vitest";
import {
  PLAATSBARE_TYPES,
  hernoemPagina,
  nieuwDocument,
  pasPatchesToe,
  plaats,
  valideerStructuur,
  verplaatsPagina,
  verwijderPagina,
  verwijderPlaatsing,
  voegPaginaToe,
  voegToe,
  zetAchtergrond,
  zetSchaal,
  type InstallatieDocument,
  type NodeId,
} from "../src/index";
import { kloon, vangFout } from "./hulp";

const ACHTERGROND = {
  origineelBestandId: "orig-1",
  rasterBestandId: "raster-1",
  pdfPagina: 2,
  breedte_px: 1200,
  hoogte_px: 800,
  schaal: { mmPerPx: 4.5 },
} as const;

/** Document met twee pagina's en een contactdoos, een automaat en een verdeelbord. */
function opstelling(): {
  doc: InstallatieDocument;
  p1: string;
  p2: string;
  doos: NodeId;
  automaat: NodeId;
  bord: NodeId;
} {
  const doc0 = nieuwDocument();
  const teller = doc0.nodes[doc0.rootId]!.kinderen[0]!;
  const bord = voegToe(doc0, teller, { type: "verdeelbord" });
  const automaat = voegToe(bord.doc, bord.id, {
    type: "automaat",
    nominaal_A: 16,
    polen: 2,
    curve: "B",
  });
  const leiding = voegToe(automaat.doc, automaat.id, {
    type: "leiding",
    kabeltype: "",
    doorsnede_mm2: 0,
    aantalGeleiders: 3,
  });
  const doos = voegToe(leiding.doc, leiding.id, {
    type: "contactdoos",
    aantal: 1,
    randaarde: true,
    kinderbeveiliging: false,
    waterdicht: false,
  });
  const p1 = voegPaginaToe(doos.doc, "Gelijkvloers");
  const p2 = voegPaginaToe(p1.doc, "Verdieping");
  return { doc: p2.doc, p1: p1.id, p2: p2.id, doos: doos.id, automaat: automaat.id, bord: bord.id };
}

describe("PLAATSBARE_TYPES", () => {
  test("bevat de punttypes en het verdeelbord", () => {
    expect([...PLAATSBARE_TYPES]).toEqual([
      "contactdoos",
      "lichtpunt",
      "schakelaar",
      "toestel",
      "verdeelbord",
    ]);
  });
});

describe("voegPaginaToe", () => {
  test("maakt een lege pagina zonder achtergrond", () => {
    const resultaat = voegPaginaToe(nieuwDocument(), "Gelijkvloers");
    expect(resultaat.doc.situatie.paginas).toEqual([
      { id: resultaat.id, titel: "Gelijkvloers", plaatsingen: [] },
    ]);
    expect(resultaat.patches.length).toBeGreaterThan(0);
  });

  test("geeft elke pagina een eigen id", () => {
    const { doc, p1, p2 } = opstelling();
    expect(p1).not.toBe(p2);
    expect(doc.situatie.paginas.map((p) => p.id)).toEqual([p1, p2]);
  });

  test("undo herstelt het origineel", () => {
    const doc0 = nieuwDocument();
    const origineel = kloon(doc0);
    const r = voegPaginaToe(doc0, "Kelder");
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(origineel);
    expect(doc0).toEqual(origineel);
  });
});

describe("zetAchtergrond", () => {
  test("zet de achtergrond op de pagina", () => {
    const { doc, p1, p2 } = opstelling();
    const r = zetAchtergrond(doc, p1, ACHTERGROND);
    expect(r.doc.situatie.paginas.find((p) => p.id === p1)!.achtergrond).toEqual(ACHTERGROND);
    expect(r.doc.situatie.paginas.find((p) => p.id === p2)!.achtergrond).toBeUndefined();
  });

  test("een onbekende pagina geeft ONBEKENDE_PAGINA", () => {
    const { doc } = opstelling();
    expect(vangFout(() => zetAchtergrond(doc, "bestaat-niet", ACHTERGROND)).code).toBe(
      "ONBEKENDE_PAGINA",
    );
  });

  test("een ongeldige achtergrond geeft ONGELDIG_SCHEMA", () => {
    const { doc, p1 } = opstelling();
    const fout = vangFout(() =>
      zetAchtergrond(doc, p1, { ...ACHTERGROND, breedte_px: "breed" } as never),
    );
    expect(fout.code).toBe("ONGELDIG_SCHEMA");
    const extra = vangFout(() => zetAchtergrond(doc, p1, { ...ACHTERGROND, extra: 1 } as never));
    expect(extra.code).toBe("ONGELDIG_SCHEMA");
    const leeg = vangFout(() => zetAchtergrond(doc, p1, undefined as never));
    expect(leeg.code).toBe("ONGELDIG_SCHEMA");
  });

  test("undo herstelt het origineel", () => {
    const { doc, p1 } = opstelling();
    const origineel = kloon(doc);
    const r = zetAchtergrond(doc, p1, ACHTERGROND);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(origineel);
  });
});

describe("plaats", () => {
  test("plaatst een contactdoos op een pagina", () => {
    const { doc, p1, doos } = opstelling();
    const r = plaats(doc, p1, doos, { x: 10, y: 20, rotatie: 90 });
    expect(r.doc.situatie.paginas[0]!.plaatsingen).toEqual([
      { nodeId: doos, x: 10, y: 20, rotatie: 90 },
    ]);
    expect(valideerStructuur(r.doc)).toEqual([]);
  });

  test("een verdeelbord is plaatsbaar", () => {
    const { doc, p1, bord } = opstelling();
    const r = plaats(doc, p1, bord, { x: 0, y: 0, rotatie: 0 });
    expect(r.doc.situatie.paginas[0]!.plaatsingen).toHaveLength(1);
  });

  test("eerst op pagina 1, daarna op pagina 2: alleen nog op pagina 2", () => {
    const { doc, p1, p2, doos } = opstelling();
    const eerst = plaats(doc, p1, doos, { x: 1, y: 2, rotatie: 0 });
    const daarna = plaats(eerst.doc, p2, doos, { x: 3, y: 4, rotatie: 180 });
    const [pagina1, pagina2] = daarna.doc.situatie.paginas;
    expect(pagina1!.plaatsingen).toEqual([]);
    expect(pagina2!.plaatsingen).toEqual([{ nodeId: doos, x: 3, y: 4, rotatie: 180 }]);
  });

  test("opnieuw plaatsen op dezelfde pagina vervangt de plaatsing", () => {
    const { doc, p1, doos } = opstelling();
    const eerst = plaats(doc, p1, doos, { x: 1, y: 2, rotatie: 0 });
    const daarna = plaats(eerst.doc, p1, doos, { x: 5, y: 6, rotatie: 45 });
    expect(daarna.doc.situatie.paginas[0]!.plaatsingen).toEqual([
      { nodeId: doos, x: 5, y: 6, rotatie: 45 },
    ]);
  });

  test("normaliseert de rotatie naar [0, 360)", () => {
    const { doc, p1, doos } = opstelling();
    const rotatieNa = (rotatie: number): number =>
      plaats(doc, p1, doos, { x: 0, y: 0, rotatie }).doc.situatie.paginas[0]!.plaatsingen[0]!
        .rotatie;
    expect(rotatieNa(-15)).toBe(345);
    expect(rotatieNa(375)).toBe(15);
    expect(rotatieNa(360)).toBe(0);
    expect(rotatieNa(720)).toBe(0);
    expect(Object.is(rotatieNa(-0), 0)).toBe(true);
    expect(Object.is(rotatieNa(-360), 0)).toBe(true);
    expect(rotatieNa(22.5)).toBe(22.5);
  });

  test("een automaat is niet plaatsbaar", () => {
    const { doc, p1, automaat } = opstelling();
    expect(vangFout(() => plaats(doc, p1, automaat, { x: 0, y: 0, rotatie: 0 })).code).toBe(
      "NIET_PLAATSBAAR",
    );
  });

  test("een onbekende pagina geeft ONBEKENDE_PAGINA", () => {
    const { doc, doos } = opstelling();
    expect(vangFout(() => plaats(doc, "weg", doos, { x: 0, y: 0, rotatie: 0 })).code).toBe(
      "ONBEKENDE_PAGINA",
    );
  });

  test("een onbekende node geeft ONBEKENDE_NODE", () => {
    const { doc, p1 } = opstelling();
    expect(vangFout(() => plaats(doc, p1, "weg", { x: 0, y: 0, rotatie: 0 })).code).toBe(
      "ONBEKENDE_NODE",
    );
    expect(vangFout(() => plaats(doc, p1, "constructor", { x: 0, y: 0, rotatie: 0 })).code).toBe(
      "ONBEKENDE_NODE",
    );
  });

  test("niet-eindige coordinaten of rotatie geven ONGELDIG_SCHEMA", () => {
    const { doc, p1, doos } = opstelling();
    for (const positie of [
      { x: Number.NaN, y: 0, rotatie: 0 },
      { x: 0, y: Number.POSITIVE_INFINITY, rotatie: 0 },
      { x: 0, y: 0, rotatie: Number.NEGATIVE_INFINITY },
      { x: 0, y: 0, rotatie: Number.NaN },
    ]) {
      expect(vangFout(() => plaats(doc, p1, doos, positie)).code).toBe("ONGELDIG_SCHEMA");
    }
  });

  test("undo herstelt het origineel, ook na verplaatsing naar een andere pagina", () => {
    const { doc, p1, p2, doos } = opstelling();
    const eerst = plaats(doc, p1, doos, { x: 1, y: 2, rotatie: 0 });
    const origineel = kloon(eerst.doc);
    const daarna = plaats(eerst.doc, p2, doos, { x: 3, y: 4, rotatie: 10 });
    expect(pasPatchesToe(daarna.doc, daarna.inversePatches)).toEqual(origineel);
    expect(pasPatchesToe(eerst.doc, eerst.inversePatches)).toEqual(kloon(doc));
  });
});

describe("verwijderPlaatsing", () => {
  test("verwijdert de plaatsing van de node", () => {
    const { doc, p1, doos } = opstelling();
    const geplaatst = plaats(doc, p1, doos, { x: 1, y: 2, rotatie: 0 });
    const r = verwijderPlaatsing(geplaatst.doc, doos);
    expect(r.doc.situatie.paginas[0]!.plaatsingen).toEqual([]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(kloon(geplaatst.doc));
  });

  test("zonder plaatsing: zelfde doc en lege patches", () => {
    const { doc, doos } = opstelling();
    const r = verwijderPlaatsing(doc, doos);
    expect(r.doc).toBe(doc);
    expect(r.patches).toEqual([]);
    expect(r.inversePatches).toEqual([]);
  });

  test("een onbekende node gooit niet", () => {
    const { doc } = opstelling();
    const r = verwijderPlaatsing(doc, "bestaat-niet");
    expect(r.doc).toBe(doc);
    expect(r.patches).toEqual([]);
    expect(r.inversePatches).toEqual([]);
  });

  test("laat plaatsingen van andere nodes staan", () => {
    const { doc, p1, doos, bord } = opstelling();
    const a = plaats(doc, p1, doos, { x: 1, y: 2, rotatie: 0 });
    const b = plaats(a.doc, p1, bord, { x: 3, y: 4, rotatie: 0 });
    const r = verwijderPlaatsing(b.doc, doos);
    expect(r.doc.situatie.paginas[0]!.plaatsingen).toEqual([
      { nodeId: bord, x: 3, y: 4, rotatie: 0 },
    ]);
  });
});

describe("hernoemPagina", () => {
  test("trimt de titel", () => {
    const { doc, p1 } = opstelling();
    const r = hernoemPagina(doc, p1, "  Gelijkvloers ");
    expect(r.doc.situatie.paginas[0]!.titel).toBe("Gelijkvloers");
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(kloon(doc));
  });

  test("een lege titel geeft ONGELDIG_SCHEMA", () => {
    const { doc, p1 } = opstelling();
    expect(vangFout(() => hernoemPagina(doc, p1, "   ")).code).toBe("ONGELDIG_SCHEMA");
    expect(vangFout(() => hernoemPagina(doc, p1, "")).code).toBe("ONGELDIG_SCHEMA");
  });

  test("een onbekende pagina geeft ONBEKENDE_PAGINA", () => {
    const { doc } = opstelling();
    expect(vangFout(() => hernoemPagina(doc, "weg", "Kelder")).code).toBe("ONBEKENDE_PAGINA");
  });
});

describe("verwijderPagina", () => {
  test("verwijdert de pagina en haar plaatsingen, de nodes blijven", () => {
    const { doc, p1, p2, doos, bord } = opstelling();
    const a = plaats(doc, p1, doos, { x: 1, y: 2, rotatie: 0 });
    const b = plaats(a.doc, p1, bord, { x: 3, y: 4, rotatie: 0 });
    const r = verwijderPagina(b.doc, p1);
    expect(r.doc.situatie.paginas.map((p) => p.id)).toEqual([p2]);
    expect(Object.keys(r.doc.nodes)).toEqual(Object.keys(b.doc.nodes));
    expect(r.doc.nodes[doos]).toBeDefined();
    expect(r.doc.nodes[bord]).toBeDefined();
    expect(valideerStructuur(r.doc)).toEqual([]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(kloon(b.doc));
  });

  test("een onbekende pagina geeft ONBEKENDE_PAGINA", () => {
    const { doc } = opstelling();
    expect(vangFout(() => verwijderPagina(doc, "weg")).code).toBe("ONBEKENDE_PAGINA");
  });
});

describe("zetSchaal", () => {
  test("zet de schaal op de achtergrond", () => {
    const { doc, p1 } = opstelling();
    const met = zetAchtergrond(doc, p1, { ...ACHTERGROND, schaal: { mmPerPx: 4.5 } });
    const r = zetSchaal(met.doc, p1, 0.5);
    expect(r.doc.situatie.paginas[0]!.achtergrond!.schaal).toEqual({ mmPerPx: 0.5 });
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(kloon(met.doc));
  });

  test("undefined verwijdert de schaal", () => {
    const { doc, p1 } = opstelling();
    const met = zetAchtergrond(doc, p1, ACHTERGROND);
    const r = zetSchaal(met.doc, p1, undefined);
    expect(Object.hasOwn(r.doc.situatie.paginas[0]!.achtergrond!, "schaal")).toBe(false);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(kloon(met.doc));
  });

  test("een niet-positieve of niet-eindige schaal geeft ONGELDIG_SCHEMA", () => {
    const { doc, p1 } = opstelling();
    const met = zetAchtergrond(doc, p1, ACHTERGROND).doc;
    for (const waarde of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(vangFout(() => zetSchaal(met, p1, waarde)).code).toBe("ONGELDIG_SCHEMA");
    }
  });

  test("een pagina zonder achtergrond geeft GEEN_ACHTERGROND", () => {
    const { doc, p1 } = opstelling();
    expect(vangFout(() => zetSchaal(doc, p1, 0.5)).code).toBe("GEEN_ACHTERGROND");
    expect(vangFout(() => zetSchaal(doc, p1, undefined)).code).toBe("GEEN_ACHTERGROND");
  });

  test("een onbekende pagina geeft ONBEKENDE_PAGINA", () => {
    const { doc } = opstelling();
    expect(vangFout(() => zetSchaal(doc, "weg", 0.5)).code).toBe("ONBEKENDE_PAGINA");
  });
});

describe("verplaatsPagina", () => {
  function metDrie(): { doc: InstallatieDocument; a: string; b: string; c: string } {
    const { doc, p1, p2 } = opstelling();
    const derde = voegPaginaToe(doc, "Zolder");
    return { doc: derde.doc, a: p1, b: p2, c: derde.id };
  }

  test("verplaatst c naar voren", () => {
    const { doc, a, b, c } = metDrie();
    const r = verplaatsPagina(doc, c, 0);
    expect(r.doc.situatie.paginas.map((p) => p.id)).toEqual([c, a, b]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(kloon(doc));
  });

  test("verplaatst a naar achteren", () => {
    const { doc, a, b, c } = metDrie();
    const r = verplaatsPagina(doc, a, 2);
    expect(r.doc.situatie.paginas.map((p) => p.id)).toEqual([b, c, a]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(kloon(doc));
  });

  test("een ongeldige index geeft ONGELDIGE_INDEX", () => {
    const { doc, a } = metDrie();
    expect(vangFout(() => verplaatsPagina(doc, a, 3)).code).toBe("ONGELDIGE_INDEX");
    expect(vangFout(() => verplaatsPagina(doc, a, -1)).code).toBe("ONGELDIGE_INDEX");
    expect(vangFout(() => verplaatsPagina(doc, a, 1.5)).code).toBe("ONGELDIGE_INDEX");
  });

  test("naar de eigen index: zelfde doc en lege patches", () => {
    const { doc, b } = metDrie();
    const r = verplaatsPagina(doc, b, 1);
    expect(r.doc).toBe(doc);
    expect(r.patches).toEqual([]);
    expect(r.inversePatches).toEqual([]);
  });

  test("een onbekende pagina geeft ONBEKENDE_PAGINA", () => {
    const { doc } = metDrie();
    expect(vangFout(() => verplaatsPagina(doc, "weg", 0)).code).toBe("ONBEKENDE_PAGINA");
  });
});
