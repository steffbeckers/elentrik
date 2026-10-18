import { describe, expect, test } from "vitest";
import { installatie } from "@elentrik/arei/testing";
import { nieuwId, valideerStructuur, type InstallatieDocument, type NodeId } from "@elentrik/model";
import { KOLOM_BREEDTE_MM } from "@elentrik/symbols";
import { maakStrook, type Aanknoping, type SchemaElement, type Strook } from "../src/index";
import { kloon } from "./hulp";

type SymboolElement = Extract<SchemaElement, { soort: "symbool" }>;

const symbolen = (strook: Strook): SymboolElement[] =>
  strook.elementen.filter((e): e is SymboolElement => e.soort === "symbool");
const soort = (strook: Strook, s: Aanknoping["soort"]): Aanknoping[] => strook.aanknopingen.filter((a) => a.soort === s);
const symVan = (strook: Strook, id: NodeId): SymboolElement => symbolen(strook).find((s) => s.nodeId === id)!;
const cx = (s: SymboolElement): number => s.x + s.symbool.maat.breedte / 2;

/** Hangt twee contactdozen onder de node `ouderId`. */
function splits(doc: InstallatieDocument, ouderId: NodeId): { doc: InstallatieDocument; kinderen: NodeId[] } {
  const groot = kloon(doc);
  const kinderen: NodeId[] = [];
  for (let i = 0; i < 2; i++) {
    const id = nieuwId();
    kinderen.push(id);
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
  }
  expect(valideerStructuur(groot)).toEqual([]);
  return { doc: groot, kinderen };
}

describe("aanknopingen: het startdocument", () => {
  const { doc, ids } = installatie()
    .differentieel(300, (d) => d.verdeelbord((b) => b.als("bord")))
    .bouw();
  const strook = maakStrook(doc);

  test("precies een rail-einde op het verdeelbord en geen kring-einde", () => {
    expect(strook.aanknopingen.map((a) => [a.soort, a.nodeId])).toEqual([["rail-einde", ids["bord"]!]]);
  });

  test("het differentieel onder de teller heeft geen rail-einde", () => {
    const diff = Object.values(doc.nodes).find((n) => n.type === "differentieel")!;
    expect(strook.aanknopingen.some((a) => a.nodeId === diff.id)).toBe(false);
  });

  test("een bord zonder kinderen: het rail-einde ligt op de bovenkant van het vak, een halve kolom rechts van de lijn", () => {
    const bord = symVan(strook, ids["bord"]!);
    const a = strook.aanknopingen[0]!;
    expect(a.x).toBeCloseTo(cx(bord) + KOLOM_BREEDTE_MM / 2, 10);
    expect(a.y).toBeCloseTo(bord.y, 10);
  });
});

describe("aanknopingen: een bord met twee kringen", () => {
  const { doc, ids } = installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b
          .als("bord")
          .kring((k) => k.automaat(16).leiding(2.5).contactdozen(3).als("top1"))
          .kring((k) => k.automaat(16).leiding(2.5).contactdozen(3).als("top2")),
      ),
    )
    .bouw();
  const strook = maakStrook(doc);

  test("twee kring-einden op de bovenste contactdozen, vijf mm boven hun vak", () => {
    const einden = soort(strook, "kring-einde");
    expect(einden.map((a) => a.nodeId)).toEqual([ids["top1"]!, ids["top2"]!]);
    for (const a of einden) {
      const s = symVan(strook, a.nodeId);
      expect(a.x).toBeCloseTo(cx(s), 10);
      expect(a.y).toBeCloseTo(s.y - 5, 10);
    }
  });

  test("een rail-einde op het bord: rechts van het laatste kind, op de rail", () => {
    const einden = soort(strook, "rail-einde");
    expect(einden).toHaveLength(1);
    const a = einden[0]!;
    expect(a.nodeId).toBe(ids["bord"]!);
    const bord = symVan(strook, ids["bord"]!);
    const laatste = symVan(strook, doc.nodes[ids["bord"]!]!.kinderen[1]!);
    expect(a.x).toBeCloseTo(cx(laatste) + KOLOM_BREEDTE_MM / 2, 10);
    const rail = strook.elementen.find((e): e is Extract<SchemaElement, { soort: "lijn" }> => e.soort === "lijn" && e.rol === "rail")!;
    expect(a.y).toBeCloseTo(rail.y1, 10);
    expect(a.y).toBeLessThan(bord.y);
  });

  test("de aanknopingen staan in pre-order", () => {
    expect(strook.aanknopingen.map((a) => a.nodeId)).toEqual([ids["bord"]!, ids["top1"]!, ids["top2"]!]);
  });
});

describe("aanknopingen: een splitsing in een kring", () => {
  const { doc, ids } = installatie()
    .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("cd"))))
    .bouw();
  const { doc: gesplitst, kinderen } = splits(doc, ids["cd"]!);
  const strook = maakStrook(gesplitst);

  test("twee kring-einden en geen kring-einde op de splitsende contactdoos", () => {
    const einden = soort(strook, "kring-einde");
    expect(einden.map((a) => a.nodeId)).toEqual(kinderen);
    expect(strook.aanknopingen.some((a) => a.nodeId === ids["cd"]!)).toBe(false);
  });
});

describe("aanknopingen: een differentieel in een bord", () => {
  const { doc, ids } = installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b.als("bord").differentieel(30, (d30) => d30.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("top"))),
      ),
    )
    .bouw();
  const strook = maakStrook(doc);
  const d30 = Object.values(doc.nodes).find((n) => n.type === "differentieel" && n.parentId === ids["bord"]!)!;

  test("een rail-einde op dat differentieel en op het bord, een kring-einde bovenaan", () => {
    expect(strook.aanknopingen.map((a) => [a.soort, a.nodeId])).toEqual([
      ["rail-einde", ids["bord"]!],
      ["rail-einde", d30.id],
      ["kring-einde", ids["top"]!],
    ]);
  });

  test("het rail-einde van een differentieel met een enkel kind ligt op de verbindingshoogte boven zijn vak", () => {
    const a = strook.aanknopingen.find((x) => x.nodeId === d30.id)!;
    const s = symVan(strook, d30.id);
    expect(a.y).toBeLessThan(s.y);
    expect(a.x).toBeCloseTo(cx(symVan(strook, d30.kinderen[0]!)) + KOLOM_BREEDTE_MM / 2, 10);
  });
});

describe("aanknopingen: alleen waar het hoort", () => {
  test("een leeg bord onder een differentieel in het bord krijgt een rail-einde op de bovenkant van het vak", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.als("bord").differentieel(30, () => undefined)))
      .bouw();
    const strook = maakStrook(doc);
    const d30 = Object.values(doc.nodes).find((n) => n.type === "differentieel" && n.parentId === ids["bord"]!)!;
    const a = strook.aanknopingen.find((x) => x.nodeId === d30.id)!;
    expect(a.soort).toBe("rail-einde");
    expect(a.y).toBeCloseTo(symVan(strook, d30.id).y, 10);
  });

  test("een differentieel onder een differentieel krijgt een rail-einde", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.differentieel(30, (d2) => d2.verdeelbord(() => undefined)))
      .bouw();
    const strook = maakStrook(doc);
    const binnen = Object.values(doc.nodes).filter((n) => n.type === "differentieel");
    expect(binnen).toHaveLength(2);
    const [buiten, dieper] = binnen;
    expect(strook.aanknopingen.some((a) => a.nodeId === buiten!.id)).toBe(false);
    expect(strook.aanknopingen.some((a) => a.nodeId === dieper!.id && a.soort === "rail-einde")).toBe(true);
  });

  test("een tak zonder kinderen die niet eindigt in een punt, leiding of beveiliging geeft geen kring-einde", () => {
    const { doc } = installatie().differentieel(300, () => undefined).bouw();
    const strook = maakStrook(doc);
    expect(strook.aanknopingen).toEqual([]);
  });
});

describe("vakken", () => {
  const { doc } = installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b
          .kring((k) => k.automaat(16).leiding(2.5).contactdozen(3))
          .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(2)),
      ),
    )
    .bouw();
  const strook = maakStrook(doc);

  test("elk getekend symbool heeft een vak gelijk aan zijn symboolelement", () => {
    const syms = symbolen(strook);
    expect(Object.keys(strook.vakken)).toHaveLength(syms.length);
    for (const s of syms) {
      expect(strook.vakken[s.nodeId]).toEqual({
        x: s.x,
        y: s.y,
        breedte: s.symbool.maat.breedte,
        hoogte: s.symbool.maat.hoogte,
      });
    }
  });

  test("vakken is een record zonder prototype", () => {
    expect(Object.getPrototypeOf(strook.vakken)).toBeNull();
  });
});

describe("aanknopingen: binnen de strook", () => {
  const binnen = (strook: Strook): void => {
    for (const a of strook.aanknopingen) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(strook.breedte);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(strook.hoogte);
    }
  };

  test("een bord met kringen", () => {
    const { doc } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))
            .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(2)),
        ),
      )
      .bouw();
    const strook = maakStrook(doc);
    expect(strook.aanknopingen.length).toBeGreaterThan(0);
    binnen(strook);
  });

  test("een kring-einde boven het bovenste symbool vergroot de strook in plaats van erbuiten te vallen", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))))
      .bouw();
    const strook = maakStrook(doc);
    const einde = soort(strook, "kring-einde")[0]!;
    const top = symVan(strook, einde.nodeId);
    expect(einde.y).toBeGreaterThanOrEqual(0);
    expect(top.y).toBeGreaterThanOrEqual(5 - 1e-9);
    binnen(strook);
  });

  test("een bord zonder kinderen", () => {
    const { doc } = installatie().differentieel(300, (d) => d.verdeelbord(() => undefined)).bouw();
    binnen(maakStrook(doc));
  });

  test("een splitsing", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("cd"))))
      .bouw();
    binnen(maakStrook(splits(doc, ids["cd"]!).doc));
  });
});
