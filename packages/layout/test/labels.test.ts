import { describe, expect, test } from "vitest";
import { installatie } from "@elentrik/arei/testing";
import { voegToe, type NodeId, type NodeVan } from "@elentrik/model";
import {
  TEKEN_BREEDTE_FACTOR,
  beveiligingLabel,
  leidingLabel,
  maakStrook,
  tekstBreedte,
  type SchemaElement,
} from "../src/index";
import { lijnBenadert } from "./hulp";

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
    expect(tekstBreedte("B16 2P", 2)).toBeCloseTo(7.2, 10);
    expect(tekstBreedte("", 3)).toBe(0);
  });
});

describe("beveiligingLabel", () => {
  const basis = { id: "b" as NodeId, parentId: null, kinderen: [] };
  const automaat = (delen: Partial<NodeVan<"automaat">>): NodeVan<"automaat"> => ({
    ...basis,
    type: "automaat",
    nominaal_A: 16,
    curve: "B",
    polen: 1,
    ...delen,
  });
  const differentieel = (delen: Partial<NodeVan<"differentieel">>): NodeVan<"differentieel"> => ({
    ...basis,
    type: "differentieel",
    nominaal_A: 40,
    gevoeligheid_mA: 30,
    klasse: "A",
    polen: 2,
    ...delen,
  });
  const zekering = (delen: Partial<NodeVan<"zekering">>): NodeVan<"zekering"> => ({
    ...basis,
    type: "zekering",
    nominaal_A: 20,
    ...delen,
  });

  test("automaat: curve en nominale stroom, met de polen vanaf twee", () => {
    expect(beveiligingLabel(automaat({ nominaal_A: 20, curve: "C", polen: 1 }))).toBe("C20");
    expect(beveiligingLabel(automaat({ nominaal_A: 16, curve: "B", polen: 2 }))).toBe("B16 2P");
    expect(beveiligingLabel(automaat({ nominaal_A: 32, curve: "D", polen: 4 }))).toBe("D32 4P");
  });
  test("differentieel: nominale stroom, gevoeligheid in A, klasse en polen", () => {
    expect(beveiligingLabel(differentieel({ nominaal_A: 40, gevoeligheid_mA: 30, klasse: "A", polen: 2 }))).toBe(
      "40/0,03A type A 2P",
    );
    expect(beveiligingLabel(differentieel({ nominaal_A: 40, gevoeligheid_mA: 300, klasse: "A", polen: 4 }))).toBe(
      "40/0,3A type A 4P",
    );
    expect(beveiligingLabel(differentieel({ nominaal_A: 63, gevoeligheid_mA: 300, klasse: "AC", polen: 1 }))).toBe(
      "63/0,3A type AC",
    );
  });
  test("de gevoeligheid heeft hoogstens drie decimalen en geen overbodige nullen", () => {
    expect(beveiligingLabel(differentieel({ gevoeligheid_mA: 10 }))).toBe("40/0,01A type A 2P");
    expect(beveiligingLabel(differentieel({ gevoeligheid_mA: 500 }))).toBe("40/0,5A type A 2P");
    expect(beveiligingLabel(differentieel({ gevoeligheid_mA: 1000 }))).toBe("40/1A type A 2P");
    expect(beveiligingLabel(differentieel({ gevoeligheid_mA: 1500 }))).toBe("40/1,5A type A 2P");
    expect(beveiligingLabel(differentieel({ gevoeligheid_mA: 25 }))).toBe("40/0,025A type A 2P");
  });
  test("zekering: nominale stroom en A", () => {
    expect(beveiligingLabel(zekering({ nominaal_A: 20 }))).toBe("20 A");
  });
});

describe("maakStrook: rail en labels", () => {
  const { doc, ids } = appartement();
  const strook = maakStrook(doc);
  const syms = symbolen(strook.elementen);
  const symVan = (id: string) => syms.find((s) => s.nodeId === ids[id]!)!;

  test("precies een rail, boven het bord, van de eerste tot de laatste kring", () => {
    const rails = lijnen(strook.elementen).filter((l) => l.rol === "rail");
    const bord = symVan("bord");
    const yRail = bord.y - 4;
    expect(rails).toHaveLength(1);
    lijnBenadert(rails[0], { soort: "lijn", x1: cx(symVan("a")), y1: yRail, x2: cx(symVan("c")), y2: yRail, rol: "rail" });
  });

  test("kringteksten in volgorde A, B, C, links van de lijn, tussen de rail en de beveiliging", () => {
    const kringen = teksten(strook.elementen, "kring");
    expect(kringen.map((t) => t.tekst)).toEqual(["A", "B", "C"]);
    const yRail = lijnen(strook.elementen).find((l) => l.rol === "rail")!.y1;
    for (const [t, naam] of [
      [kringen[0]!, "a"],
      [kringen[1]!, "b"],
      [kringen[2]!, "c"],
    ] as const) {
      const s = symVan(naam);
      expect(t).toMatchObject({ x: cx(s) - 1, grootte: 3, anker: "end" });
      // Onder het symbool van de beveiliging (aan de kant van de voeding), boven de rail.
      expect(t.y).toBeGreaterThan(s.y + s.symbool.maat.hoogte);
      expect(t.y).toBeLessThan(yRail);
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
    // De glyph (hoogte 0,7 × grootte) staat rond de middellijn, met de basislijn 0,35 × grootte eronder.
    expect(a3.y).toBeCloseTo(symbool.y + symbool.symbool.maat.hoogte / 2 + 0.85, 10);
  });

  test("leiding- en beveiligingsteksten staan rechts van het symbool", () => {
    const leidingen = teksten(strook.elementen, "leiding");
    expect(leidingen.map((t) => t.tekst)).toEqual(["XVB 3G2,5", "XVB 3G1,5", "XVB 3G2,5"]);
    const a = symVan("a");
    const beveiliging = teksten(strook.elementen, "beveiliging");
    // differentieel, daarna drie automaten
    expect(beveiliging.map((t) => t.tekst)).toEqual(["40/0,3A type A 2P", "B16 2P", "B10 2P", "C16 2P"]);
    expect(beveiliging[1]).toMatchObject({
      x: cx(a) + a.symbool.maat.breedte / 2 + 1,
      grootte: 2,
      anker: "start",
    });
    expect(beveiliging[1]!.y).toBeCloseTo(a.y + a.symbool.maat.hoogte / 2 + 0.7, 10);
    const leidingA = syms.find((s) => doc.nodes[s.nodeId]!.type === "leiding")!;
    expect(leidingen[0]).toMatchObject({ x: cx(leidingA) + 2, grootte: 2, anker: "start" });
    expect(leidingen[0]!.y).toBeCloseTo(leidingA.y + leidingA.symbool.maat.hoogte / 2 + 0.7, 10);
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
    expect(onderbord).toHaveLength(1);
    expect(onderbord[0]).toMatchObject({
      soort: "tekst",
      x: cx(symbool) + symbool.symbool.maat.breedte / 2 + 1,
      tekst: "<x>",
      grootte: 2.5,
      anker: "start",
      rol: "onderbord",
    });
    expect(onderbord[0]!.y).toBeCloseTo(symbool.y + symbool.symbool.maat.hoogte / 2 + 1.05, 10);
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
