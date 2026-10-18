import { describe, expect, test } from "vitest";
import { installatie } from "@elentrik/arei/testing";
import { nieuwDocument, nieuwId, valideerStructuur, voegToe, type NodeId } from "@elentrik/model";
import { KOLOM_BREEDTE_MM } from "@elentrik/symbols";
import { RAIL_AFSTAND_MM, STROOK_MARGE_MM, VERTICALE_AFSTAND_MM, maakStrook, type SchemaElement } from "../src/index";
import { kloon } from "./hulp";

type SymboolElement = Extract<SchemaElement, { soort: "symbool" }>;
type LijnElement = Extract<SchemaElement, { soort: "lijn" }>;

const symbolen = (elementen: SchemaElement[]): SymboolElement[] =>
  elementen.filter((e): e is SymboolElement => e.soort === "symbool");
const lijnen = (elementen: SchemaElement[]): LijnElement[] =>
  elementen.filter((e): e is LijnElement => e.soort === "lijn");
const cx = (s: SymboolElement): number => s.x + s.symbool.maat.breedte / 2;

describe("maakStrook: een keten", () => {
  const { doc } = installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(3))),
    )
    .bouw();
  const strook = maakStrook(doc);
  const syms = symbolen(strook.elementen);

  test("staat in een kolom met oplopende y", () => {
    // aansluiting, teller, differentieel, bord, automaat, leiding, 3 contactdozen
    expect(syms).toHaveLength(9);
    const eerste = cx(syms[0]!);
    for (const s of syms) expect(cx(s)).toBeCloseTo(eerste, 10);
    for (let i = 1; i < syms.length; i++) expect(syms[i]!.y).toBeGreaterThan(syms[i - 1]!.y);
  });

  test("y volgt hoogte en verticale afstand", () => {
    expect(syms[0]!.y).toBe(STROOK_MARGE_MM);
    for (let i = 1; i < syms.length; i++) {
      expect(syms[i]!.y).toBeCloseTo(syms[i - 1]!.y + syms[i - 1]!.symbool.maat.hoogte + VERTICALE_AFSTAND_MM, 10);
    }
  });

  test("elke node staat in kolom 0 en de breedte is een kolom plus marges", () => {
    expect(Object.keys(strook.kolomVan)).toHaveLength(9);
    for (const kolom of Object.values(strook.kolomVan)) expect(kolom).toBe(0);
    // Links 12 (puntlabel "A1" plus 1 mm), rechts 17,6 ("300 mA A" naast het differentieel).
    expect(strook.breedte).toBeCloseTo(2 * STROOK_MARGE_MM + 12 + 17.6, 9);
    expect(strook.kolomGrenzen).toEqual([STROOK_MARGE_MM, strook.breedte]);
  });

  test("een rechte verbinding per ouder-kindpaar", () => {
    const l = lijnen(strook.elementen);
    expect(l).toHaveLength(8);
    for (const lijn of l) {
      expect(lijn.rol).toBe("verbinding");
      expect(lijn.x1).toBe(lijn.x2);
      expect(lijn.y2).toBeGreaterThan(lijn.y1);
    }
  });

  test("hoogte is de grootste onderkant plus marge", () => {
    const laatste = syms[syms.length - 1]!;
    expect(strook.hoogte).toBeCloseTo(laatste.y + laatste.symbool.maat.hoogte + STROOK_MARGE_MM, 10);
  });
});

describe("maakStrook: kringen naast elkaar", () => {
  const { doc, ids } = installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b
          .als("bord")
          .kring((k) => k.automaat(16).als("k1").leiding(2.5).contactdozen(2))
          .kring((k) => k.automaat(16).als("k2").leiding(2.5).lichtpunten(1)),
      ),
    )
    .bouw();
  const strook = maakStrook(doc);

  test("kringen in kolom 0 en 1, bord in kolom 0", () => {
    expect(strook.kolomVan[ids["bord"]!]).toBe(0);
    expect(strook.kolomVan[ids["k1"]!]).toBe(0);
    expect(strook.kolomVan[ids["k2"]!]).toBe(1);
  });

  test("breedte is de marges plus de twee kolombudgetten", () => {
    // Kolom 0: 12 + 17,6 ("300 mA A"); kolom 1: 12 + 13,2 ("16 A B").
    expect(strook.breedte).toBeCloseTo(2 * 4 + 29.6 + 25.2, 9);
  });

  test("een bord met twee kinderen geeft vier segmenten: stam, rail en een stuk per kind", () => {
    const bord = symbolen(strook.elementen).find((s) => s.nodeId === ids["bord"]!)!;
    const k1 = symbolen(strook.elementen).find((s) => s.nodeId === ids["k1"]!)!;
    const k2 = symbolen(strook.elementen).find((s) => s.nodeId === ids["k2"]!)!;
    const yRail = bord.y + bord.symbool.maat.hoogte + VERTICALE_AFSTAND_MM;
    expect(k1.y).toBeCloseTo(yRail + RAIL_AFSTAND_MM, 10);
    expect(k2.y).toBeCloseTo(yRail + RAIL_AFSTAND_MM, 10);
    // Rechterbudget van kolom 0 plus linkerbudget van kolom 1.
    expect(cx(k2) - cx(k1)).toBeCloseTo(17.6 + 12, 10);
    expect(cx(k2) - strook.kolomGrenzen[1]!).toBeCloseTo(12, 10);

    const naBord = strook.elementen.slice(strook.elementen.indexOf(bord) + 1);
    expect(lijnen(naBord).slice(0, 4)).toEqual([
      { soort: "lijn", x1: cx(bord), y1: bord.y + bord.symbool.maat.uit.y, x2: cx(bord), y2: yRail, rol: "verbinding" },
      { soort: "lijn", x1: cx(k1), y1: yRail, x2: cx(k2), y2: yRail, rol: "rail" },
      { soort: "lijn", x1: cx(k1), y1: yRail, x2: cx(k1), y2: k1.y + k1.symbool.maat.in.y, rol: "verbinding" },
      { soort: "lijn", x1: cx(k2), y1: yRail, x2: cx(k2), y2: k2.y + k2.symbool.maat.in.y, rol: "verbinding" },
    ]);
  });
});

/** Verwacht dat `waarden` element per element `verwacht` benadert. */
function benadert(waarden: readonly number[], verwacht: readonly number[]): void {
  expect(waarden).toHaveLength(verwacht.length);
  waarden.forEach((w, i) => expect(w, `index ${i}`).toBeCloseTo(verwacht[i]!, 9));
}

describe("maakStrook: kringGrenzen en kolomGrenzen", () => {
  test("drie kringen: de kolombreedtes volgen de labels", () => {
    const { doc } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))
            .kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))
            .kring((k) => k.automaat(16).leiding(2.5).contactdozen(1)),
        ),
      )
      .bouw();
    const strook = maakStrook(doc);
    // Links in elke kolom: puntlabel "A1" eindigt 8 mm links van de lijn en is 2 × 2,5 × 0,6 = 3 mm
    // breed, plus 1 mm: 12. Rechts in kolom 0: "300 mA A" begint 8 mm rechts en is 9,6 mm breed: 17,6.
    // Rechts in de andere kolommen: "16 A B" begint 6 mm rechts en is 7,2 mm breed: 13,2.
    benadert(strook.kolomGrenzen, [4, 4 + 29.6, 4 + 29.6 + 25.2, 4 + 29.6 + 2 * 25.2 + 4]);
    benadert(strook.kringGrenzen, strook.kolomGrenzen.slice(0, 3));
    expect(strook.breedte).toBe(strook.kolomGrenzen[3]);
  });

  test("een strook zonder labels houdt kolommen van KOLOM_BREEDTE_MM", () => {
    const strook = maakStrook(nieuwDocument());
    expect(strook.kolomGrenzen).toEqual([STROOK_MARGE_MM, STROOK_MARGE_MM + KOLOM_BREEDTE_MM + STROOK_MARGE_MM]);
  });

  test("een lang puntlabel verbreedt de linkerkant van zijn kolom; de tekst blijft op zijn plaats", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(2))
            .kring((k) =>
              k.automaat(20).leiding(6).onderbord((o) => o.kring((k2) => k2.automaat(16).als("ga").leiding(2.5).contactdozen(1)), "Garage"),
            ),
        ),
      )
      .bouw();
    const strook = maakStrook(doc);
    const ga = symbolen(strook.elementen).find((s) => s.nodeId === ids["ga"]!)!;
    const kolom = strook.kolomVan[ga.nodeId]!;
    // "Garage.A1": 9 × 2,5 × 0,6 = 13,5 mm, eindigend 8 mm links van de lijn, plus 1 mm.
    expect(cx(ga) - strook.kolomGrenzen[kolom]!).toBeCloseTo(22.5, 9);
    const punt = strook.elementen.find((e) => e.soort === "tekst" && e.tekst === "Garage.A1")!;
    expect(punt).toMatchObject({ anker: "end" });
    expect((punt as { x: number }).x).toBeCloseTo(cx(ga) - 8, 9);
  });

  test("geen kringen geeft geen grenzen", () => {
    expect(maakStrook(nieuwDocument()).kringGrenzen).toEqual([]);
  });
});

describe("maakStrook: vertakkingen en randgevallen", () => {
  test("een contactdoos met twee kinderen neemt twee bladkolommen in", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("cd"))))
      .bouw();
    const groot = kloon(doc);
    const cdId = ids["cd"]!;
    for (let i = 0; i < 2; i++) {
      const id = nieuwId();
      groot.nodes[id] = {
        id,
        parentId: cdId,
        kinderen: [],
        type: "contactdoos",
        aantal: 1,
        randaarde: true,
        kinderbeveiliging: true,
        waterdicht: false,
      };
      groot.nodes[cdId]!.kinderen.push(id);
    }
    expect(valideerStructuur(groot)).toEqual([]);
    const strook = maakStrook(groot);
    // Kolom 0: 12 + 17,6 ("300 mA A"); kolom 1 heeft alleen een contactdoos en "A3": 12 + 12.
    expect(strook.breedte).toBeCloseTo(2 * 4 + 29.6 + 24, 9);
    const kinderen = groot.nodes[cdId]!.kinderen;
    expect(kinderen.map((id) => strook.kolomVan[id])).toEqual([0, 1]);
  });

  test("alleen aansluiting en teller: 2 symbolen en 1 lijn", () => {
    const strook = maakStrook(nieuwDocument());
    expect(symbolen(strook.elementen)).toHaveLength(2);
    expect(lijnen(strook.elementen)).toHaveLength(1);
    expect(strook.breedte).toBe(2 * 4 + 24);
  });

  test("een punt zonder kring wordt getekend", () => {
    const { doc } = installatie().differentieel(300, () => undefined).bouw();
    const d = Object.values(doc.nodes).find((n) => n.type === "differentieel")!;
    const leiding = voegToe(doc, d.id, {
      type: "leiding",
      kabeltype: "XVB",
      doorsnede_mm2: 2.5,
      aantalGeleiders: 3,
    });
    const punt = voegToe(leiding.doc, leiding.id, {
      type: "contactdoos",
      aantal: 1,
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
    });
    const strook = maakStrook(punt.doc);
    expect(symbolen(strook.elementen).map((s) => s.nodeId)).toContain(punt.id);
    expect(strook.kolomVan[punt.id]).toBe(0);
    expect(strook.kringGrenzen).toEqual([]);
  });

  test("een overgeslagen verwijzing naar een ontbrekende node geeft geen fout", () => {
    const doc = kloon(nieuwDocument());
    doc.nodes[doc.rootId]!.kinderen.push("bestaat-niet" as NodeId);
    const strook = maakStrook(doc);
    expect(symbolen(strook.elementen)).toHaveLength(2);
  });

  test("een keten van 5.000 contactdozen geeft geen RangeError", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("cd"))))
      .bouw();
    const groot = kloon(doc);
    let ouderId = ids["cd"]!;
    for (let i = 0; i < 5000; i++) {
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
      ouderId = id;
    }
    expect(valideerStructuur(groot)).toEqual([]);
    const strook = maakStrook(groot);
    expect(symbolen(strook.elementen).length).toBeGreaterThanOrEqual(5000);
    // Links: "A5001" is 5 × 1,5 = 7,5 mm, eindigend 8 mm links van de lijn, plus 1 mm. Rechts: 17,6.
    expect(strook.breedte).toBeCloseTo(2 * 4 + 16.5 + 17.6, 9);
  });
});

describe("maakStrook: volgorde van de elementen", () => {
  test("per node: symbool, teksten (kring, beveiliging, leiding, punt) en daarna de verbindingen", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))))
      .bouw();
    const volgorde = maakStrook(doc).elementen.map((e) => {
      if (e.soort === "symbool") return `symbool:${doc.nodes[e.nodeId]!.type}`;
      if (e.soort === "tekst") return `tekst:${e.rol}:${e.tekst}`;
      if (e.soort === "lijn") return `lijn:${e.rol}`;
      return e.soort;
    });
    expect(volgorde).toEqual([
      "symbool:aansluiting",
      "lijn:verbinding",
      "symbool:teller",
      "lijn:verbinding",
      "symbool:differentieel",
      "tekst:beveiliging:300 mA A",
      "lijn:verbinding",
      "symbool:verdeelbord",
      "lijn:verbinding",
      "symbool:automaat",
      "tekst:kring:A",
      "tekst:beveiliging:16 A B",
      "lijn:verbinding",
      "symbool:leiding",
      "tekst:leiding:XVB 3G2,5",
      "lijn:verbinding",
      "symbool:contactdoos",
      "tekst:punt:A1",
    ]);
  });
});

describe("maakStrook: splitsing onder een node die geen bord is", () => {
  const { doc, ids } = installatie()
    .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("cd"))))
    .bouw();
  const groot = kloon(doc);
  const cdId = ids["cd"]!;
  const kinderIds: NodeId[] = [];
  for (let i = 0; i < 2; i++) {
    const id = nieuwId();
    kinderIds.push(id);
    groot.nodes[id] = {
      id,
      parentId: cdId,
      kinderen: [],
      type: "contactdoos",
      aantal: 1,
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
    };
    groot.nodes[cdId]!.kinderen.push(id);
  }
  const strook = maakStrook(groot);
  const syms = symbolen(strook.elementen);
  const ouder = syms.find((s) => s.nodeId === cdId)!;
  const k1 = syms.find((s) => s.nodeId === kinderIds[0]!)!;
  const k2 = syms.find((s) => s.nodeId === kinderIds[1]!)!;
  const yRail = ouder.y + ouder.symbool.maat.hoogte + VERTICALE_AFSTAND_MM;

  test("beide kinderen staan een rail lager, in aangrenzende kolommen", () => {
    expect(k1.y).toBeCloseTo(yRail + RAIL_AFSTAND_MM, 10);
    expect(k2.y).toBeCloseTo(yRail + RAIL_AFSTAND_MM, 10);
    expect(cx(k1)).toBeCloseTo(cx(ouder), 10);
    // Rechterbudget van kolom 0 ("300 mA A") plus linkerbudget van kolom 1.
    expect(cx(k2) - cx(k1)).toBeCloseTo(17.6 + 12, 10);
    expect(strook.kolomVan[k2.nodeId]).toBe(strook.kolomVan[k1.nodeId]! + 1);
  });

  test("de horizontale lijn heeft rol verbinding en er komt geen rail bij", () => {
    const naOuder = strook.elementen.slice(strook.elementen.indexOf(ouder) + 1);
    expect(lijnen(naOuder).slice(0, 4)).toEqual([
      { soort: "lijn", x1: cx(ouder), y1: ouder.y + ouder.symbool.maat.uit.y, x2: cx(ouder), y2: yRail, rol: "verbinding" },
      { soort: "lijn", x1: cx(k1), y1: yRail, x2: cx(k2), y2: yRail, rol: "verbinding" },
      { soort: "lijn", x1: cx(k1), y1: yRail, x2: cx(k1), y2: k1.y + k1.symbool.maat.in.y, rol: "verbinding" },
      { soort: "lijn", x1: cx(k2), y1: yRail, x2: cx(k2), y2: k2.y + k2.symbool.maat.in.y, rol: "verbinding" },
    ]);
    expect(lijnen(strook.elementen).filter((l) => l.rol === "rail")).toEqual([]);
  });
});

test("maakStrook is deterministisch", () => {
  const { doc } = installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b
          .kring((k) => k.automaat(16).leiding(2.5).contactdozen(2))
          .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(2)),
      ),
    )
    .bouw();
  expect(maakStrook(doc)).toEqual(maakStrook(doc));
});

describe("maakStrook: structureel ongeldige documenten", () => {
  const basis = () =>
    installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .als("bord")
            .kring((k) => k.automaat(16).leiding(2.5).contactdozen(2).als("cd"))
            .kring((k) => k.automaat(16).als("k2").leiding(1.5).lichtpunten(1)),
        ),
      )
      .bouw();
  /** Elke getekende node staat er precies één keer, en elke node van het document wordt getekend. */
  const eenSymboolPerNode = (elementen: SchemaElement[], aantalNodes: number): void => {
    const ids = symbolen(elementen).map((s) => s.nodeId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(aantalNodes);
  };

  test("een cyclus eindigt en elke node staat er één keer", () => {
    const { doc, ids } = basis();
    const fout = kloon(doc);
    fout.nodes[ids["cd"]!]!.kinderen.push(fout.rootId);
    const strook = maakStrook(fout);
    eenSymboolPerNode(strook.elementen, Object.keys(fout.nodes).length);
  });

  test("een dubbel kind geeft één symbool per id", () => {
    const { doc, ids } = basis();
    const fout = kloon(doc);
    fout.nodes[ids["bord"]!]!.kinderen.push(ids["k2"]!);
    const strook = maakStrook(fout);
    eenSymboolPerNode(strook.elementen, Object.keys(fout.nodes).length);
    expect(Object.keys(strook.kolomVan)).toHaveLength(Object.keys(fout.nodes).length);
    expect(lijnen(strook.elementen).filter((l) => l.rol === "rail")).toHaveLength(1);
  });

  test("een kind dat ook onder een andere ouder hangt, staat alleen onder de eerste in pre-order", () => {
    const { doc, ids } = basis();
    const fout = kloon(doc);
    fout.nodes[ids["cd"]!]!.kinderen.push(ids["k2"]!);
    const strook = maakStrook(fout);
    eenSymboolPerNode(strook.elementen, Object.keys(fout.nodes).length);
    expect(strook.kolomVan[ids["k2"]!]).toBe(strook.kolomVan[ids["cd"]!]);
  });

  test("een node met id __proto__ geeft geen fout", () => {
    const { doc, ids } = basis();
    const fout = kloon(doc);
    const cd = fout.nodes[ids["cd"]!]!;
    Object.defineProperty(fout.nodes, "__proto__", {
      value: { ...cd, id: "__proto__", parentId: cd.id, kinderen: [] },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    cd.kinderen.push("__proto__" as NodeId);
    const strook = maakStrook(fout);
    eenSymboolPerNode(strook.elementen, Object.keys(fout.nodes).length);
    expect(symbolen(strook.elementen).map((s) => s.nodeId)).toContain("__proto__");
    expect(Object.hasOwn(strook.kolomVan, "__proto__")).toBe(true);
    expect(strook.kolomVan["__proto__" as NodeId]).toBe(strook.kolomVan[cd.id]);
    for (const e of strook.elementen) {
      if (e.soort === "tekst") expect(typeof e.tekst).toBe("string");
      if (e.soort === "symbool") expect(Number.isFinite(e.x)).toBe(true);
    }
  });
});
