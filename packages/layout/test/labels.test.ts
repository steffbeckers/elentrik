import { describe, expect, test } from "vitest";
import { installatie } from "@elentrik/arei/testing";
import { voegToe, type NodeVan } from "@elentrik/model";
import {
  TEKEN_BREEDTE_FACTOR,
  beveiligingLabel,
  leidingLabel,
  maakStrook,
  tekstBreedte,
  type SchemaElement,
} from "../src/index";

type SymboolElement = Extract<SchemaElement, { soort: "symbool" }>;
type LijnElement = Extract<SchemaElement, { soort: "lijn" }>;
type TekstElement = Extract<SchemaElement, { soort: "tekst" }>;

const symbolen = (e: SchemaElement[]): SymboolElement[] => e.filter((x): x is SymboolElement => x.soort === "symbool");
const lijnen = (e: SchemaElement[]): LijnElement[] => e.filter((x): x is LijnElement => x.soort === "lijn");
const teksten = (e: SchemaElement[], rol: TekstElement["rol"]): TekstElement[] =>
  e.filter((x): x is TekstElement => x.soort === "tekst" && x.rol === rol);
const cx = (s: SymboolElement): number => s.x + s.symbool.maat.breedte / 2;

/** Appartement met drie kringen: A (3 contactdozen), B (2 lichtpunten) en C (1 contactdoos). */
function appartement() {
  return installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b
          .als("bord")
          .kring((k) => k.automaat(16).als("a").leiding(2.5).contactdozen(3))
          .kring((k) => k.automaat(10).als("b").leiding(1.5).lichtpunten(2))
          .kring((k) => k.automaat(16, { curve: "C" }).als("c").leiding(2.5).contactdozen(1)),
      ),
    )
    .bouw();
}

describe("leidingLabel", () => {
  const leiding = (delen: Partial<NodeVan<"leiding">>): NodeVan<"leiding"> => ({
    id: "l" as NodeVan<"leiding">["id"],
    parentId: null,
    kinderen: [],
    type: "leiding",
    kabeltype: "XVB",
    doorsnede_mm2: 2.5,
    aantalGeleiders: 3,
    ...delen,
  });

  test("XVB 3 geleiders 2,5 mm2", () => {
    expect(leidingLabel(leiding({}))).toBe("XVB 3G2,5");
  });
  test("een leeg kabeltype geeft een vraagteken", () => {
    expect(leidingLabel(leiding({ kabeltype: "" }))).toBe("? 3G2,5");
    expect(leidingLabel(leiding({ kabeltype: "  " }))).toBe("? 3G2,5");
  });
  test("een doorsnede 0 geeft een vraagteken", () => {
    expect(leidingLabel(leiding({ doorsnede_mm2: 0 }))).toBe("XVB 3G?");
  });
  test("een doorsnede die afgerond 0 wordt, geeft ook een vraagteken", () => {
    expect(leidingLabel(leiding({ doorsnede_mm2: 0.004 }))).toBe("XVB 3G?");
    expect(leidingLabel(leiding({ doorsnede_mm2: 0.005 }))).toBe("XVB 3G0,01");
  });
  test("decimaalteken en afronding zijn deterministisch", () => {
    expect(leidingLabel(leiding({ doorsnede_mm2: 10 }))).toBe("XVB 3G10");
    expect(leidingLabel(leiding({ doorsnede_mm2: 1.5 }))).toBe("XVB 3G1,5");
    expect(leidingLabel(leiding({ doorsnede_mm2: 0.75 }))).toBe("XVB 3G0,75");
    expect(leidingLabel(leiding({ doorsnede_mm2: 1.504 }))).toBe("XVB 3G1,5");
    expect(leidingLabel(leiding({ aantalGeleiders: 5, doorsnede_mm2: 16 }))).toBe("XVB 5G16");
  });
});

describe("tekstBreedte", () => {
  test("aantal tekens × grootte × TEKEN_BREEDTE_FACTOR", () => {
    expect(TEKEN_BREEDTE_FACTOR).toBe(0.6);
    expect(tekstBreedte("Garage.A3", 2.5)).toBeCloseTo(9 * 2.5 * 0.6, 10);
    expect(tekstBreedte("300 mA A", 2)).toBeCloseTo(9.6, 10);
    expect(tekstBreedte("", 3)).toBe(0);
  });
});

describe("beveiligingLabel", () => {
  test("automaat, zekering en differentieel", () => {
    const { doc } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) => b.kring((k) => k.automaat(16)).kring((k) => k.zekering(20))),
      )
      .bouw();
    const node = <T extends "automaat" | "zekering" | "differentieel">(type: T) =>
      Object.values(doc.nodes).find((n): n is NodeVan<T> => n.type === type)!;
    expect(beveiligingLabel(node("automaat"))).toBe("16 A B");
    expect(beveiligingLabel(node("zekering"))).toBe("20 A");
    expect(beveiligingLabel(node("differentieel"))).toBe("300 mA A");
  });
});

describe("maakStrook: rail en labels", () => {
  const { doc, ids } = appartement();
  const strook = maakStrook(doc);
  const syms = symbolen(strook.elementen);
  const symVan = (id: string) => syms.find((s) => s.nodeId === ids[id]!)!;

  test("precies een rail, van de eerste tot de laatste kring", () => {
    const rails = lijnen(strook.elementen).filter((l) => l.rol === "rail");
    const bord = symVan("bord");
    const yRail = bord.y + bord.symbool.maat.hoogte + 4;
    expect(rails).toEqual([
      { soort: "lijn", x1: cx(symVan("a")), y1: yRail, x2: cx(symVan("c")), y2: yRail, rol: "rail" },
    ]);
  });

  test("kringteksten in volgorde A, B, C, links van de lijn, boven de beveiliging", () => {
    const kringen = teksten(strook.elementen, "kring");
    expect(kringen.map((t) => t.tekst)).toEqual(["A", "B", "C"]);
    for (const [t, naam] of [
      [kringen[0]!, "a"],
      [kringen[1]!, "b"],
      [kringen[2]!, "c"],
    ] as const) {
      const s = symVan(naam);
      expect(t).toMatchObject({ x: cx(s) - 1, y: s.y - 1, grootte: 3, anker: "end" });
    }
  });

  test("puntlabel van de derde contactdoos in kring A is A3", () => {
    const punten = teksten(strook.elementen, "punt");
    expect(punten.map((t) => t.tekst)).toEqual(["A1", "A2", "A3", "B1", "B2", "C1"]);
    const a3 = punten[2]!;
    expect(a3).toMatchObject({ grootte: 2.5, anker: "end" });
    // links van het symbool en verticaal op de middellijn
    const contactdozen = syms.filter((s) => doc.nodes[s.nodeId]!.type === "contactdoos");
    const symbool = contactdozen[2]!;
    expect(a3.x).toBeCloseTo(symbool.x - 1, 10);
    expect(a3.y).toBeCloseTo(symbool.y + symbool.symbool.maat.hoogte / 2 + 0.9, 10);
  });

  test("leiding- en beveiligingsteksten staan rechts van het symbool", () => {
    const leidingen = teksten(strook.elementen, "leiding");
    expect(leidingen.map((t) => t.tekst)).toEqual(["XVB 3G2,5", "XVB 3G1,5", "XVB 3G2,5"]);
    const a = symVan("a");
    const beveiliging = teksten(strook.elementen, "beveiliging");
    // differentieel, daarna drie automaten
    expect(beveiliging.map((t) => t.tekst)).toEqual(["300 mA A", "16 A B", "10 A B", "16 A C"]);
    expect(beveiliging[1]).toMatchObject({
      x: cx(a) + a.symbool.maat.breedte / 2 + 1,
      y: a.y + a.symbool.maat.hoogte / 2 + 0.7,
      grootte: 2,
      anker: "start",
    });
    const leidingA = syms.find((s) => doc.nodes[s.nodeId]!.type === "leiding")!;
    expect(leidingen[0]).toMatchObject({
      x: cx(leidingA) + 2,
      y: leidingA.y + leidingA.symbool.maat.hoogte / 2 + 0.7,
      grootte: 2,
      anker: "start",
    });
  });

  test("een bord zonder naam geeft geen onderbordtekst", () => {
    expect(teksten(strook.elementen, "onderbord")).toEqual([]);
  });
});

describe("maakStrook: onderbord en punten zonder kring", () => {
  test("de naam van een bord blijft ruw, rechts van het bordsymbool", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.als("bord")))
      .bouw();
    const bord = { ...doc.nodes[ids["bord"]!]!, naam: "<x>" } as NodeVan<"verdeelbord">;
    const gewijzigd = { ...doc, nodes: { ...doc.nodes, [bord.id]: bord } };
    const strook = maakStrook(gewijzigd);
    const symbool = symbolen(strook.elementen).find((s) => s.nodeId === bord.id)!;
    const onderbord = teksten(strook.elementen, "onderbord");
    expect(onderbord).toEqual([
      {
        soort: "tekst",
        x: cx(symbool) + symbool.symbool.maat.breedte / 2 + 1,
        y: symbool.y + symbool.symbool.maat.hoogte / 2 + 0.7,
        tekst: "<x>",
        grootte: 2.5,
        anker: "start",
        rol: "onderbord",
      },
    ]);
  });

  test("een punt zonder kring heeft geen punttekst", () => {
    const { doc } = installatie().differentieel(300, () => undefined).bouw();
    const d = Object.values(doc.nodes).find((n) => n.type === "differentieel")!;
    const leiding = voegToe(doc, d.id, { type: "leiding", kabeltype: "XVB", doorsnede_mm2: 2.5, aantalGeleiders: 3 });
    const punt = voegToe(leiding.doc, leiding.id, {
      type: "contactdoos",
      aantal: 1,
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
    });
    const strook = maakStrook(punt.doc);
    expect(symbolen(strook.elementen).map((s) => s.nodeId)).toContain(punt.id);
    expect(teksten(strook.elementen, "punt")).toEqual([]);
    expect(teksten(strook.elementen, "kring")).toEqual([]);
  });
});
