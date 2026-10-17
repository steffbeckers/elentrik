import { describe, expect, test } from "vitest";
import { analyseer } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import { nieuwId, valideerStructuur, type InstallatieDocument, type NodeId } from "@elentrik/model";
import { KOLOM_BREEDTE_MM, type Symbool } from "@elentrik/symbols";
import {
  MIN_SCHAAL,
  STANDAARD_PAPIER_A4,
  STROOK_MARGE_MM,
  bruikbaar,
  maakStrook,
  opmaak as opmaakZonderControle,
  papierMaat,
  type Papier,
  type SchemaElement,
  type SchemaOpmaak,
  type Strook,
} from "../src/index";
import { pagineer as pagineerZonderControle } from "../src/paginering";
import { kloon } from "./hulp";

/** Invariant voor elke paginering in dit bestand: geen enkele pagina is leeg. */
function geenLegePagina(opm: SchemaOpmaak): SchemaOpmaak {
  for (const pagina of opm.paginas) expect(pagina.elementen.length, `pagina ${pagina.index}`).toBeGreaterThan(0);
  return opm;
}
const opmaak = (...args: Parameters<typeof opmaakZonderControle>): SchemaOpmaak =>
  geenLegePagina(opmaakZonderControle(...args));
const pagineer = (...args: Parameters<typeof pagineerZonderControle>): SchemaOpmaak =>
  geenLegePagina(pagineerZonderControle(...args));

type SymboolElement = Extract<SchemaElement, { soort: "symbool" }>;
type LijnElement = Extract<SchemaElement, { soort: "lijn" }>;
type VervolgElement = Extract<SchemaElement, { soort: "vervolg" }>;

const PAPIER_A3: Papier = { ...STANDAARD_PAPIER_A4, formaat: "A3" };

const isHorizontaal = (e: SchemaElement): e is LijnElement => e.soort === "lijn" && e.x1 !== e.x2;
const symbolen = (elementen: SchemaElement[]): SymboolElement[] =>
  elementen.filter((e): e is SymboolElement => e.soort === "symbool");
const vervolgen = (elementen: SchemaElement[]): VervolgElement[] =>
  elementen.filter((e): e is VervolgElement => e.soort === "vervolg");

/** Een document met `n` kringen naast elkaar, elk een automaat, leiding en 3 contactdozen. */
function kringen(n: number): InstallatieDocument {
  return installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) => {
        for (let i = 0; i < n; i++) b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(3));
      }),
    )
    .bouw().doc;
}

/** Een keten van `n` contactdozen in één kring. */
function keten(n: number): InstallatieDocument {
  return installatie()
    .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(n))))
    .bouw().doc;
}

/** Een kring met `n` punten in een boom waarin elk punt tot drie kinderen heeft. */
function vertakteKring(n: number): InstallatieDocument {
  const { doc, ids } = installatie()
    .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("cd"))))
    .bouw();
  const groot = kloon(doc);
  const wachtrij: NodeId[] = [ids["cd"]!];
  for (let i = 1; i < n; i++) {
    const ouderId = wachtrij[0]!;
    const id = nieuwId();
    groot.nodes[id] = {
      id,
      parentId: ouderId,
      kinderen: [],
      type: "contactdoos",
      aantal: 1,
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
    };
    groot.nodes[ouderId]!.kinderen.push(id);
    if (groot.nodes[ouderId]!.kinderen.length === 3) wachtrij.shift();
    wachtrij.push(id);
  }
  expect(valideerStructuur(groot)).toEqual([]);
  return groot;
}

/** Elk element van de strook behalve een horizontale lijn staat op precies één pagina. */
function controleerElkElementEenKeer(opm: SchemaOpmaak): void {
  const telling = new Map<string, number>();
  for (const pagina of opm.paginas) {
    for (const e of pagina.elementen) {
      if (isHorizontaal(e) || e.soort === "vervolg") continue;
      const sleutel = JSON.stringify(e);
      telling.set(sleutel, (telling.get(sleutel) ?? 0) + 1);
    }
  }
  const verwacht = new Map<string, number>();
  for (const e of opm.strook.elementen) {
    if (isHorizontaal(e)) continue;
    const sleutel = JSON.stringify(e);
    verwacht.set(sleutel, (verwacht.get(sleutel) ?? 0) + 1);
  }
  expect(telling).toEqual(verwacht);

  // Elk symbool met een nodeId precies één keer, over alle pagina's samen.
  const nodeIds = opm.paginas.flatMap((p) => symbolen(p.elementen).map((s) => s.nodeId));
  const strookIds = symbolen(opm.strook.elementen).map((s) => s.nodeId);
  expect(new Set(nodeIds).size).toBe(nodeIds.length);
  expect([...nodeIds].sort()).toEqual([...strookIds].sort());
}

/** Elke horizontale lijn die over een knip loopt, heeft op beide pagina's het juiste vervolg. */
function controleerVervolgen(opm: SchemaOpmaak): number {
  const horizontaal = opm.strook.elementen.filter(isHorizontaal);
  let paren = 0;
  for (let i = 0; i < opm.paginas.length - 1; i++) {
    const links = opm.paginas[i]!;
    const rechts = opm.paginas[i + 1]!;
    const knip = links.xTot;
    const kruisend = horizontaal.filter((l) => Math.min(l.x1, l.x2) < knip && Math.max(l.x1, l.x2) > knip);
    expect(vervolgen(links.elementen).filter((v) => v.richting === "rechts")).toHaveLength(kruisend.length);
    expect(vervolgen(rechts.elementen).filter((v) => v.richting === "links")).toHaveLength(kruisend.length);
    for (const lijn of kruisend) {
      expect(links.elementen).toContainEqual({ soort: "vervolg", x: knip, y: lijn.y1, richting: "rechts", paginaNummer: i + 2 });
      expect(rechts.elementen).toContainEqual({ soort: "vervolg", x: knip, y: lijn.y1, richting: "links", paginaNummer: i + 1 });
      paren++;
    }
  }
  // Een vervolg volgt direct op het lijnstuk waar het bij hoort.
  for (const pagina of opm.paginas) {
    pagina.elementen.forEach((e, j) => {
      if (e.soort !== "vervolg") return;
      let k = j - 1;
      while (pagina.elementen[k]?.soort === "vervolg") k--;
      const stuk = pagina.elementen[k]!;
      expect(isHorizontaal(stuk)).toBe(true);
      const lijn = stuk as LijnElement;
      expect(lijn.y1).toBe(e.y);
      expect([lijn.x1, lijn.x2]).toContain(e.x);
    });
  }
  return paren;
}

describe("papier", () => {
  test("papierMaat is liggend", () => {
    expect(papierMaat("A4")).toEqual({ breedte: 297, hoogte: 210 });
    expect(papierMaat("A3")).toEqual({ breedte: 420, hoogte: 297 });
  });

  test("bruikbaar trekt marges en cartouche af", () => {
    expect(STANDAARD_PAPIER_A4).toEqual({ formaat: "A4", marge_mm: 10, cartoucheHoogte_mm: 30 });
    expect(bruikbaar(STANDAARD_PAPIER_A4)).toEqual({ breedte: 277, hoogte: 160 });
    expect(bruikbaar(PAPIER_A3)).toEqual({ breedte: 400, hoogte: 247 });
  });

  test("zonder bruikbare breedte of hoogte gooien bruikbaar en opmaak een RangeError", () => {
    const geenBreedte: Papier = { ...STANDAARD_PAPIER_A4, marge_mm: 200 };
    const geenHoogte: Papier = { ...STANDAARD_PAPIER_A4, cartoucheHoogte_mm: 190 };
    for (const papier of [geenBreedte, geenHoogte]) {
      expect(() => bruikbaar(papier)).toThrow(RangeError);
      expect(() => opmaakZonderControle(kringen(1), papier)).toThrow(RangeError);
    }
  });
});

describe("opmaak: kringen op A4", () => {
  test("3 kringen: 1 pagina met schaal 1", () => {
    const opm = opmaak(kringen(3));
    expect(opm.paginas).toHaveLength(1);
    expect(opm.paginas[0]).toMatchObject({ index: 0, xVan: 0, xTot: opm.strook.breedte, schaal: 1 });
    expect(opm.papier).toEqual(STANDAARD_PAPIER_A4);
    expect(opm.waarschuwingen).toEqual([]);
    controleerElkElementEenKeer(opm);
    expect(vervolgen(opm.paginas[0]!.elementen)).toEqual([]);
  });

  describe("20 kringen", () => {
    const opm = opmaak(kringen(20));
    const W = bruikbaar(STANDAARD_PAPIER_A4).breedte;

    test("schaal 1 en het aantal pagina's volgt de knipregel", () => {
      expect(opm.strook.hoogte).toBeLessThanOrEqual(bruikbaar(STANDAARD_PAPIER_A4).hoogte);
      expect(opm.strook.breedte).toBe(2 * STROOK_MARGE_MM + 20 * KOLOM_BREEDTE_MM);
      // Kring i begint op STROOK_MARGE_MM + i × KOLOM_BREEDTE_MM. De eerste pagina knipt bij de grootste
      // grens <= W; elke volgende pagina begint op een grens en neemt floor(W / KOLOM_BREEDTE_MM) kringen.
      const opEerste = Math.floor((W - STROOK_MARGE_MM) / KOLOM_BREEDTE_MM);
      const perPagina = Math.floor(W / KOLOM_BREEDTE_MM);
      const rest = 20 - opEerste;
      const laatste = rest % perPagina === 0 ? perPagina : rest % perPagina;
      // De laatste pagina moet ook de rechtermarge bevatten, anders klopt de formule niet.
      expect(laatste * KOLOM_BREEDTE_MM + STROOK_MARGE_MM).toBeLessThanOrEqual(W);
      expect(opm.paginas).toHaveLength(1 + Math.ceil(rest / perPagina));
      expect(opm.paginas[0]!.xTot).toBe(STROOK_MARGE_MM + opEerste * KOLOM_BREEDTE_MM);
      expect(opm.waarschuwingen).toEqual([]);
    });

    test("de pagina's sluiten aan, knippen op kringgrenzen en dekken de strook", () => {
      expect(opm.paginas[0]!.xVan).toBe(0);
      expect(opm.paginas[opm.paginas.length - 1]!.xTot).toBe(opm.strook.breedte);
      opm.paginas.forEach((p, i) => {
        expect(p.index).toBe(i);
        expect(p.schaal).toBe(1);
        expect(p.xTot - p.xVan).toBeLessThanOrEqual(W);
        if (i > 0) expect(p.xVan).toBe(opm.paginas[i - 1]!.xTot);
        if (i < opm.paginas.length - 1) expect(opm.strook.kringGrenzen).toContain(p.xTot);
      });
    });

    test("elk symbool, elke verticale lijn en elke tekst staat op precies één pagina", () => {
      controleerElkElementEenKeer(opm);
    });

    test("de rail van het bord loopt over elke knip en heeft de juiste vervolg-paren", () => {
      const rails = opm.strook.elementen.filter((e): e is LijnElement => e.soort === "lijn" && e.rol === "rail");
      expect(rails).toHaveLength(1);
      const rail = rails[0]!;
      expect(controleerVervolgen(opm)).toBeGreaterThanOrEqual(opm.paginas.length - 1);

      const knip = opm.paginas[0]!.xTot;
      const eerste = opm.paginas[0]!.elementen;
      const j = eerste.findIndex((e) => e.soort === "lijn" && e.rol === "rail");
      expect(eerste.slice(j, j + 2)).toEqual([
        { ...rail, x2: knip },
        { soort: "vervolg", x: knip, y: rail.y1, richting: "rechts", paginaNummer: 2 },
      ]);
      const tweede = opm.paginas[1]!.elementen;
      const k = tweede.findIndex((e) => e.soort === "lijn" && e.rol === "rail");
      expect(tweede[k]).toMatchObject({ x1: knip, y1: rail.y1, y2: rail.y1, rol: "rail" });
      expect(tweede[k + 1]).toEqual({ soort: "vervolg", x: knip, y: rail.y1, richting: "links", paginaNummer: 1 });
    });

    test("de elementen van een pagina volgen de volgorde van de strook", () => {
      const positie = new Map(opm.strook.elementen.map((e, i) => [JSON.stringify(e), i]));
      for (const pagina of opm.paginas) {
        const posities = pagina.elementen
          .filter((e) => !isHorizontaal(e) && e.soort !== "vervolg")
          .map((e) => positie.get(JSON.stringify(e))!);
        for (let i = 1; i < posities.length; i++) expect(posities[i]!).toBeGreaterThan(posities[i - 1]!);
      }
    });
  });

  test("op A3 passen er meer kringen per pagina dan op A4", () => {
    const doc = kringen(20);
    const automaten = (opm: SchemaOpmaak): number =>
      symbolen(opm.paginas[0]!.elementen).filter((s) => doc.nodes[s.nodeId]!.type === "automaat").length;
    const a4 = opmaak(doc);
    const a3 = opmaak(doc, PAPIER_A3);
    expect(automaten(a3)).toBeGreaterThan(automaten(a4));
    controleerElkElementEenKeer(a3);
  });
});

describe("opmaak: schaal", () => {
  const hoogte = bruikbaar(STANDAARD_PAPIER_A4).hoogte;

  test("een te hoge keten wordt verkleind tot de bruikbare hoogte, zonder waarschuwing", () => {
    // Zo lang dat de strook hoger is dan de bruikbare hoogte, maar niet hoger dan die hoogte / MIN_SCHAAL.
    let n = 1;
    while (maakStrook(keten(n)).hoogte <= hoogte) n++;
    const opm = opmaak(keten(n));
    expect(opm.strook.hoogte).toBeLessThan(hoogte / MIN_SCHAAL);
    const schaal = opm.paginas[0]!.schaal;
    expect(schaal).toBeLessThan(1);
    expect(schaal).toBeGreaterThanOrEqual(MIN_SCHAAL);
    expect(schaal).toBeCloseTo(hoogte / opm.strook.hoogte, 10);
    expect(opm.waarschuwingen).toEqual([]);
  });

  test("een keten van 60 contactdozen: schaal kleiner dan 1 en minstens MIN_SCHAAL", () => {
    const opm = opmaak(keten(60));
    const schaal = opm.paginas[0]!.schaal;
    expect(schaal).toBeLessThan(1);
    expect(schaal).toBeGreaterThanOrEqual(MIN_SCHAAL);
    expect(schaal).toBe(Math.max(MIN_SCHAAL, hoogte / opm.strook.hoogte));
    controleerElkElementEenKeer(opm);
  });

  test("een keten van 400 contactdozen: schaal MIN_SCHAAL en één SCHEMA_TE_HOOG", () => {
    const opm = opmaak(keten(400));
    expect(opm.strook.hoogte * MIN_SCHAAL).toBeGreaterThan(hoogte);
    for (const p of opm.paginas) expect(p.schaal).toBe(MIN_SCHAAL);
    expect(opm.waarschuwingen).toEqual([{ code: "SCHEMA_TE_HOOG" }]);
    // De paginabreedte in strookcoördinaten is W / schaal: de smalle strook past op één pagina.
    expect(opm.paginas).toHaveLength(1);
    controleerElkElementEenKeer(opm);
  });
});

describe("opmaak: een kring breder dan een pagina", () => {
  // Zonder controle hier, zodat een lege pagina als falende test verschijnt en niet de hele suite breekt.
  const opm = opmaakZonderControle(vertakteKring(30));
  // De boom is ook diep, dus de schaal kan kleiner zijn dan 1: de paginabreedte is W / schaal.
  const W = bruikbaar(STANDAARD_PAPIER_A4).breedte / opm.paginas[0]!.schaal;

  test("de strook is breder dan een pagina en geeft KRING_TE_BREED", () => {
    expect(opm.strook.breedte).toBeGreaterThan(W);
    const teBreed = opm.waarschuwingen.filter((w) => w.code === "KRING_TE_BREED");
    expect(teBreed.length).toBeGreaterThan(0);
    for (const w of teBreed) {
      const pagina = opm.paginas[w.paginaIndex!]!;
      expect(pagina.xTot - pagina.xVan).toBeCloseTo(W, 9);
      expect([0, ...opm.strook.kringGrenzen, opm.strook.breedte]).not.toContain(pagina.xTot);
    }
    expect(opm.paginas[opm.paginas.length - 1]!.xTot).toBe(opm.strook.breedte);
  });

  test("geen lege pagina: de eerste pagina knipt niet op de linkermarge maar op de volle breedte", () => {
    geenLegePagina(opm);
    expect(opm.strook.kringGrenzen).toEqual([STROOK_MARGE_MM]);
    expect(opm.paginas[0]!.xTot).toBeCloseTo(W, 9);
    expect(opm.waarschuwingen[0]).toEqual({ code: "KRING_TE_BREED", paginaIndex: 0 });
  });

  test("nog steeds elk symbool precies één keer, en vervolgen bij elke knip", () => {
    controleerElkElementEenKeer(opm);
    expect(controleerVervolgen(opm)).toBeGreaterThan(0);
  });
});

describe("pagineer: randgevallen op een kunstmatige strook", () => {
  const symbool: Symbool = {
    maat: { breedte: 10, hoogte: 10, in: { x: 5, y: 0 }, uit: { x: 5, y: 10 } },
    svg: "",
  };
  const strook = (elementen: SchemaElement[], breedte: number, kringGrenzen: number[]): Strook => ({
    breedte,
    hoogte: 100,
    elementen,
    kolomVan: {},
    kringGrenzen,
  });

  test("een lijn over twee knippen: drie stukken en vervolgen in de juiste volgorde", () => {
    const lijn: SchemaElement = { soort: "lijn", x1: 100, y1: 50, x2: 500, y2: 50, rol: "rail" };
    const opm = pagineer(strook([lijn], 600, [4, 268, 400]), STANDAARD_PAPIER_A4);
    expect(opm.paginas.map((p) => [p.xVan, p.xTot])).toEqual([
      [0, 268],
      [268, 400],
      [400, 600],
    ]);
    expect(opm.paginas.map((p) => p.elementen)).toEqual([
      [
        { soort: "lijn", x1: 100, y1: 50, x2: 268, y2: 50, rol: "rail" },
        { soort: "vervolg", x: 268, y: 50, richting: "rechts", paginaNummer: 2 },
      ],
      [
        { soort: "lijn", x1: 268, y1: 50, x2: 400, y2: 50, rol: "rail" },
        { soort: "vervolg", x: 268, y: 50, richting: "links", paginaNummer: 1 },
        { soort: "vervolg", x: 400, y: 50, richting: "rechts", paginaNummer: 3 },
      ],
      [
        { soort: "lijn", x1: 400, y1: 50, x2: 500, y2: 50, rol: "rail" },
        { soort: "vervolg", x: 400, y: 50, richting: "links", paginaNummer: 2 },
      ],
    ]);
  });

  test("een lijn die een knip alleen met een eindpunt raakt, wordt niet geknipt en krijgt geen vervolg", () => {
    const tot: SchemaElement = { soort: "lijn", x1: 100, y1: 50, x2: 268, y2: 50, rol: "verbinding" };
    const vanaf: SchemaElement = { soort: "lijn", x1: 268, y1: 60, x2: 300, y2: 60, rol: "verbinding" };
    const opm = pagineer(strook([tot, vanaf], 400, [268]), STANDAARD_PAPIER_A4);
    expect(opm.paginas.map((p) => p.elementen)).toEqual([[tot], [vanaf]]);
  });

  test("ankers op een knip gaan naar rechts, op de rechterrand naar de laatste pagina", () => {
    const opSymbool: SchemaElement = { soort: "symbool", nodeId: "a" as NodeId, x: 268 - 5, y: 0, symbool };
    const voorSymbool: SchemaElement = { soort: "symbool", nodeId: "b" as NodeId, x: 268 - 5.1, y: 0, symbool };
    const verticaal: SchemaElement = { soort: "lijn", x1: 268, y1: 0, x2: 268, y2: 10, rol: "verbinding" };
    const tekstRand: SchemaElement = { soort: "tekst", x: 400, y: 0, tekst: "x", grootte: 2, anker: "end", rol: "punt" };
    const tekstNul: SchemaElement = { soort: "tekst", x: 0, y: 0, tekst: "y", grootte: 2, anker: "end", rol: "punt" };
    const opm = pagineer(strook([opSymbool, voorSymbool, verticaal, tekstRand, tekstNul], 400, [268]), STANDAARD_PAPIER_A4);
    expect(opm.paginas.map((p) => p.elementen)).toEqual([
      [voorSymbool, tekstNul],
      [opSymbool, verticaal, tekstRand],
    ]);
  });

  const tekst = (x: number): SchemaElement => ({ soort: "tekst", x, y: 0, tekst: "t", grootte: 2, anker: "start", rol: "punt" });

  test("een grens net boven xVan + W telt nog als kandidaat (tolerantie 1e-9)", () => {
    const grens = 277 + 1e-12;
    const opm = pagineer(strook([tekst(10), tekst(300)], 400, [grens]), STANDAARD_PAPIER_A4);
    expect(opm.paginas.map((p) => p.xTot)).toEqual([grens, 400]);
    expect(opm.waarschuwingen).toEqual([]);
  });

  test("een grens op de linkermarge is geen kandidaat", () => {
    const W = bruikbaar(STANDAARD_PAPIER_A4).breedte;
    const opm = pagineer(strook([tekst(100), tekst(400)], 500, [STROOK_MARGE_MM]), STANDAARD_PAPIER_A4);
    expect(opm.paginas.map((p) => [p.xVan, p.xTot])).toEqual([
      [0, W],
      [W, 500],
    ]);
    expect(opm.waarschuwingen).toEqual([{ code: "KRING_TE_BREED", paginaIndex: 0 }]);
  });

  test("een knip die een lege pagina zou geven, wijkt voor xVan + W met KRING_TE_BREED", () => {
    const W = bruikbaar(STANDAARD_PAPIER_A4).breedte;
    // Grens 100 zou [0, 100) leeg laten; grens 500 geeft daarna [W, 500) met de tekst op 300.
    const opm = pagineer(strook([tekst(150), tekst(300), tekst(550)], 600, [100, 500]), STANDAARD_PAPIER_A4);
    expect(opm.paginas.map((p) => [p.xVan, p.xTot])).toEqual([
      [0, W],
      [W, 500],
      [500, 600],
    ]);
    expect(opm.waarschuwingen).toEqual([{ code: "KRING_TE_BREED", paginaIndex: 0 }]);
  });

  test("een horizontale lijn telt mee: een pagina met alleen een lijnstuk is niet leeg", () => {
    const lijn: SchemaElement = { soort: "lijn", x1: 50, y1: 5, x2: 350, y2: 5, rol: "rail" };
    const opm = pagineer(strook([tekst(20), lijn, tekst(450)], 500, [200, 400]), STANDAARD_PAPIER_A4);
    expect(opm.paginas.map((p) => [p.xVan, p.xTot])).toEqual([
      [0, 200],
      [200, 400],
      [400, 500],
    ]);
    expect(opm.paginas[1]!.elementen[0]).toEqual({ ...lijn, x1: 200, x2: 350 });
    expect(opm.waarschuwingen).toEqual([]);
  });

  test("zonder passende kandidaat: knippen op xVan + W met KRING_TE_BREED per pagina", () => {
    const W = bruikbaar(STANDAARD_PAPIER_A4).breedte;
    const breedte = 1000;
    const opm = pagineer(strook([tekst(10), tekst(300), tekst(600), tekst(900)], breedte, []), STANDAARD_PAPIER_A4);
    const geforceerd = Math.ceil(breedte / W) - 1;
    expect(opm.paginas).toHaveLength(geforceerd + 1);
    opm.paginas.forEach((p, i) => {
      expect(p.xVan).toBeCloseTo(i * W, 9);
      expect(p.xTot).toBeCloseTo(i < geforceerd ? (i + 1) * W : breedte, 9);
    });
    expect(opm.waarschuwingen).toEqual(
      Array.from({ length: geforceerd }, (_, i) => ({ code: "KRING_TE_BREED", paginaIndex: i })),
    );
  });
});

describe("opmaak: de analyse", () => {
  test("opmaak(doc) en opmaak(doc, STANDAARD_PAPIER_A4, analyseer(doc)) zijn gelijk", () => {
    const doc = kringen(20);
    expect(opmaak(doc, STANDAARD_PAPIER_A4, analyseer(doc))).toEqual(opmaak(doc));
  });

  test("een meegegeven analyse wordt gebruikt", () => {
    const doc = kringen(1);
    const analyse = analyseer(doc);
    analyse.kringen[0]!.label = "Z";
    const opm = opmaak(doc, STANDAARD_PAPIER_A4, analyse);
    expect(opm.strook).toEqual(maakStrook(doc, analyse));
    expect(opm.strook.elementen).toContainEqual(expect.objectContaining({ soort: "tekst", rol: "kring", tekst: "Z" }));
  });
});
