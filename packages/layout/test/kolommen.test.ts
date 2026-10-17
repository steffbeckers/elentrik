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
    expect(strook.breedte).toBe(2 * STROOK_MARGE_MM + KOLOM_BREEDTE_MM);
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

  test("breedte is 2 x 4 + 2 x 24", () => {
    expect(strook.breedte).toBe(2 * 4 + 2 * 24);
  });

  test("tweede kring staat een rail lager, met drie verbindingsstukken", () => {
    const bord = symbolen(strook.elementen).find((s) => s.nodeId === ids["bord"]!)!;
    const k1 = symbolen(strook.elementen).find((s) => s.nodeId === ids["k1"]!)!;
    const k2 = symbolen(strook.elementen).find((s) => s.nodeId === ids["k2"]!)!;
    const yRail = bord.y + bord.symbool.maat.hoogte + VERTICALE_AFSTAND_MM;
    expect(k1.y).toBeCloseTo(yRail + RAIL_AFSTAND_MM, 10);
    expect(k2.y).toBeCloseTo(yRail + RAIL_AFSTAND_MM, 10);
    expect(cx(k2) - cx(k1)).toBeCloseTo(KOLOM_BREEDTE_MM, 10);

    const naarK2 = lijnen(strook.elementen).filter((l) => l.y2 === k2.y && l.x2 === cx(k2));
    expect(naarK2).toEqual([
      { soort: "lijn", x1: cx(k2), y1: yRail, x2: cx(k2), y2: k2.y, rol: "verbinding" },
    ]);
    const stukken = lijnen(strook.elementen).filter(
      (l) => (l.x1 === cx(bord) && l.x2 === cx(bord) && l.y2 === yRail) || (l.y1 === yRail && l.y2 === yRail),
    );
    expect(stukken).toEqual([
      { soort: "lijn", x1: cx(bord), y1: bord.y + bord.symbool.maat.hoogte, x2: cx(bord), y2: yRail, rol: "verbinding" },
      { soort: "lijn", x1: cx(bord), y1: yRail, x2: cx(k2), y2: yRail, rol: "verbinding" },
    ]);
  });

  test("het eerste kind heeft een rechte lijn van uit naar in", () => {
    const bord = symbolen(strook.elementen).find((s) => s.nodeId === ids["bord"]!)!;
    const k1 = symbolen(strook.elementen).find((s) => s.nodeId === ids["k1"]!)!;
    expect(lijnen(strook.elementen)).toContainEqual({
      soort: "lijn",
      x1: cx(bord),
      y1: bord.y + bord.symbool.maat.hoogte,
      x2: cx(k1),
      y2: k1.y,
      rol: "verbinding",
    });
  });
});

describe("maakStrook: kringGrenzen", () => {
  test("drie kringen geven [4, 28, 52]", () => {
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
    expect(maakStrook(doc).kringGrenzen).toEqual([4, 28, 52]);
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
    expect(strook.breedte).toBe(2 * 4 + 2 * 24);
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
    expect(strook.breedte).toBe(2 * 4 + 24);
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
