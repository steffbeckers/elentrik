import type { Node, NodeVan } from "@elentrik/model";
import { ToestelsoortSchema } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { KOLOM_BREEDTE_MM, tekenSymbool } from "../src/index";
import { buitenVak, isGoedgevormd, nietRechtop, raakt } from "./hulp";

const basis = { id: "n1", parentId: "n0", kinderen: [] as string[] };

type DoosOpties = Partial<Pick<NodeVan<"contactdoos">, "aantal" | "randaarde" | "kinderbeveiliging" | "waterdicht">>;

function doos(opties: DoosOpties = {}): NodeVan<"contactdoos"> {
  return { ...basis, type: "contactdoos", aantal: 1, randaarde: false, kinderbeveiliging: false, waterdicht: false, ...opties };
}

function licht(soort?: NodeVan<"lichtpunt">["soort"], aantal = 1): NodeVan<"lichtpunt"> {
  return soort === undefined
    ? { ...basis, type: "lichtpunt", aantal }
    : { ...basis, type: "lichtpunt", aantal, soort };
}

function schakelaar(soort: NodeVan<"schakelaar">["soort"], waterdicht = false): NodeVan<"schakelaar"> {
  return { ...basis, type: "schakelaar", soort, waterdicht };
}

function toestel(soort: NodeVan<"toestel">["soort"]): NodeVan<"toestel"> {
  return { ...basis, type: "toestel", soort };
}

const leiding: NodeVan<"leiding"> = { ...basis, type: "leiding", kabeltype: "", doorsnede_mm2: 0, aantalGeleiders: 3 };
const verdeelbord: NodeVan<"verdeelbord"> = { ...basis, type: "verdeelbord" };

const AAN_UIT = [false, true] as const;
const contactdozen: ReadonlyArray<[string, Node]> = AAN_UIT.flatMap((randaarde) =>
  AAN_UIT.flatMap((kinderbeveiliging) =>
    AAN_UIT.map((waterdicht): [string, Node] => [
      `contactdoos randaarde=${randaarde} kinderbeveiliging=${kinderbeveiliging} waterdicht=${waterdicht}`,
      doos({ randaarde, kinderbeveiliging, waterdicht }),
    ]),
  ),
);

const lichtpunten: ReadonlyArray<[string, Node]> = [
  ["lichtpunt zonder soort", licht()],
  ["lichtpunt standaard", licht("standaard")],
  ["lichtpunt led", licht("led")],
  ["lichtpunt tl", licht("tl")],
  ["lichtpunt spot", licht("spot")],
  ["lichtpunt noodverlichting", licht("noodverlichting")],
  ["lichtpunt aantal 3", licht("standaard", 3)],
];

const schakelaars: ReadonlyArray<[string, Node]> = [
  ["schakelaar enkel", schakelaar("enkel")],
  ["schakelaar dubbel", schakelaar("dubbel")],
  ["schakelaar wissel", schakelaar("wissel")],
  ["schakelaar kruis", schakelaar("kruis")],
  ["schakelaar dimmer", schakelaar("dimmer")],
  ["schakelaar drukknop", schakelaar("drukknop")],
  ["schakelaar enkel waterdicht", schakelaar("enkel", true)],
];

const toestellen: ReadonlyArray<[string, Node]> = ToestelsoortSchema.options.map((soort) => [
  `toestel ${soort}`,
  toestel(soort),
]);

const varianten: ReadonlyArray<[string, Node]> = [
  ...contactdozen,
  ["contactdoos aantal 3", doos({ aantal: 3 })],
  ["contactdoos aantal 3 alles aan", doos({ aantal: 3, randaarde: true, kinderbeveiliging: true, waterdicht: true })],
  ...lichtpunten,
  ...schakelaars,
  ...toestellen,
  ["leiding", leiding],
  ["verdeelbord", verdeelbord],
];

describe("symbolen voor punten, leiding en onderbord", () => {
  test.each(varianten)("snapshot: %s", (_naam, node) => {
    expect(tekenSymbool(node)).toMatchSnapshot();
  });

  describe.each(varianten)("invarianten: %s", (_naam, node) => {
    const symbool = tekenSymbool(node);
    const { maat } = symbool;

    test("heeft een positieve maat die in een kolom past", () => {
      expect(maat.breedte).toBeGreaterThan(0);
      expect(maat.hoogte).toBeGreaterThan(0);
      expect(maat.breedte).toBeLessThanOrEqual(KOLOM_BREEDTE_MM - 4);
    });

    test("in en uit liggen op het midden, in onderaan en uit bovenaan", () => {
      expect(maat.in).toEqual({ x: maat.breedte / 2, y: maat.hoogte });
      expect(maat.uit).toEqual({ x: maat.breedte / 2, y: 0 });
    });

    test("alle meetkunde ligt binnen het vak", () => {
      expect(buitenVak(symbool)).toEqual([]);
    });

    test("geleiders bereiken in en uit", () => {
      expect(raakt(symbool, maat.in)).toBe(true);
      expect(raakt(symbool, maat.uit)).toBe(true);
    });

    test("is goedgevormde XML zonder NaN of undefined", () => {
      expect(isGoedgevormd(symbool)).toBe(true);
      expect(nietRechtop(symbool)).toEqual([]);
      expect(symbool.svg).not.toMatch(/NaN|undefined|Infinity/);
    });
  });

  test("exacte maten volgens het ontwerp", () => {
    const maat = (node: Node) => {
      const { breedte, hoogte } = tekenSymbool(node).maat;
      return [breedte, hoogte];
    };
    expect(maat(doos())).toEqual([14, 10]);
    expect(maat(licht())).toEqual([14, 10]);
    expect(maat(schakelaar("enkel"))).toEqual([12, 10]);
    expect(maat(toestel("oven"))).toEqual([12, 12]);
    expect(maat(leiding)).toEqual([2, 12]);
    expect(maat(verdeelbord)).toEqual([12, 6]);
  });

  describe("contactdoos", () => {
    const svgVan = (opties: DoosOpties) => tekenSymbool(doos(opties)).svg;
    const aantalVan = (svg: string, rol: string) => svg.match(new RegExp(`data-rol="${rol}"`, "g"))?.length ?? 0;

    test("heeft een halve cirkel als boog en een verticale lijn naar het aansluitpunt", () => {
      const svg = svgVan({});
      expect(svg).toMatch(/<path d="M4 5 A3 3 0 0 1 10 5"/);
      expect(svg).toContain('<line x1="7" y1="10" x2="7" y2="2"');
      expect(svg).toContain('<line x1="7" y1="2" x2="7" y2="0"');
    });

    test("randaarde, kinderbeveiliging en waterdicht verschijnen alleen als ze aan staan", () => {
      expect(aantalVan(svgVan({}), "randaarde")).toBe(0);
      expect(aantalVan(svgVan({ randaarde: true }), "randaarde")).toBe(1);
      expect(aantalVan(svgVan({}), "kinderbeveiliging")).toBe(0);
      expect(aantalVan(svgVan({ kinderbeveiliging: true }), "kinderbeveiliging")).toBe(2);
      expect(aantalVan(svgVan({}), "waterdicht")).toBe(0);
      expect(aantalVan(svgVan({ waterdicht: true }), "waterdicht")).toBe(1);
    });

    test("de waterdichtdriehoek is gevuld", () => {
      expect(svgVan({ waterdicht: true })).toMatch(/<path d="M[^"]*Z" [^>]*fill="currentColor"[^>]*data-rol="waterdicht"/);
    });

    test("het aantal wordt alleen getoond vanaf 2, met het teken ×", () => {
      expect(svgVan({ aantal: 1 })).not.toContain("<text");
      expect(svgVan({ aantal: 3 })).toContain(">3×</text>");
      expect(svgVan({ aantal: 12 })).toContain(">12×</text>");
    });
  });

  describe("lichtpunt", () => {
    const svgVan = (soort?: NodeVan<"lichtpunt">["soort"], aantal = 1) => tekenSymbool(licht(soort, aantal)).svg;

    test("is een cirkel met een kruis erin", () => {
      const svg = svgVan();
      expect(svg).toContain('<circle cx="7" cy="5" r="3"');
      expect(svg.match(/<line /g)).toHaveLength(4);
    });

    test("de geleider loopt rechtdoor van cirkel naar uit, en de versiering ligt rechts ervan", () => {
      expect(svgVan()).toContain('<line x1="7" y1="2" x2="7" y2="0"');
      expect(svgVan("tl")).toMatch(/<rect x="8\.2" y="0\.6" width="3\.8" height="0\.8"/);
      const padGetallen = [...(svgVan("spot").match(/<path d="([^"]+)"/)?.[1] ?? "").matchAll(/-?[\d.]+/g)].map((m) =>
        Number(m[0]),
      );
      const padX = padGetallen.filter((_, i) => i % 2 === 0);
      expect(padX).toHaveLength(3);
      expect(Math.min(...padX)).toBeGreaterThanOrEqual(9.5);
      expect(Math.max(...padX)).toBeLessThanOrEqual(12);
      expect(svgVan("led")).toMatch(/<text x="8" y="1\.46" font-size="1\.8" text-anchor="start"/);
    });

    test("standaard en zonder soort zijn gelijk", () => {
      expect(svgVan("standaard")).toBe(svgVan());
    });

    test("led toont de tekst LED", () => {
      expect(svgVan("led")).toContain(">LED</text>");
      expect(svgVan("tl")).not.toContain("LED");
    });

    test("tl heeft een balk, spot een driehoek en noodverlichting een gevulde stip", () => {
      expect(svgVan("tl")).toContain("<rect");
      expect(svgVan("spot")).toMatch(/<path d="M[^"]*Z"/);
      expect(svgVan("noodverlichting")).toMatch(/<circle cx="7" cy="5" r="[^"]+" [^>]*fill="currentColor"/);
      expect(svgVan("standaard")).not.toContain("<rect");
      expect(svgVan("standaard")).not.toContain("<path");
      expect(svgVan("standaard")).not.toContain('fill="currentColor"');
    });

    test("het aantal wordt alleen getoond vanaf 2", () => {
      expect(svgVan("standaard", 1)).not.toContain("<text");
      expect(svgVan("standaard", 4)).toContain(">4×</text>");
    });
  });

  describe("schakelaar", () => {
    const svgVan = (soort: NodeVan<"schakelaar">["soort"], waterdicht = false) =>
      tekenSymbool(schakelaar(soort, waterdicht)).svg;
    const hendels = (svg: string) => svg.match(/data-rol="hendel"/g)?.length ?? 0;

    test("is een cirkel met r = 2 en een geleider naar uit", () => {
      expect(svgVan("enkel")).toContain('r="2"');
      expect(svgVan("enkel")).toContain('<line x1="6" y1="2" x2="6" y2="0"');
    });

    test.each([
      ["enkel", 1],
      ["dubbel", 2],
      ["wissel", 2],
      ["kruis", 4],
      ["dimmer", 1],
      ["drukknop", 1],
    ] as const)("%s heeft %i hendel(s)", (soort, aantal) => {
      expect(hendels(svgVan(soort))).toBe(aantal);
    });

    test("dimmer heeft een pijl, drukknop een dwarsstreepje", () => {
      expect(svgVan("dimmer")).toContain('data-rol="pijl"');
      expect(svgVan("enkel")).not.toContain('data-rol="pijl"');
      expect(svgVan("drukknop")).toContain('data-rol="knop"');
      expect(svgVan("enkel")).not.toContain('data-rol="knop"');
    });

    test("de waterdichtdriehoek verschijnt alleen als waterdicht aan staat", () => {
      expect(svgVan("enkel", true)).toContain('data-rol="waterdicht"');
      expect(svgVan("enkel", false)).not.toContain('data-rol="waterdicht"');
    });
  });

  describe("toestel", () => {
    test.each(ToestelsoortSchema.options)("%s toont de afkorting in een vierkant van 10 × 10", (soort) => {
      const svg = tekenSymbool(toestel(soort)).svg;
      expect(svg).toContain('width="10" height="10"');
      expect(svg).toMatch(/>(WM|DK|VW|KP|OV|B|WP|LP|OMV|T)<\/text>/);
    });

    test("toont de juiste afkorting", () => {
      expect(tekenSymbool(toestel("wasmachine")).svg).toContain(">WM</text>");
      expect(tekenSymbool(toestel("omvormer")).svg).toContain(">OMV</text>");
      expect(tekenSymbool(toestel("andere")).svg).toContain(">T</text>");
    });
  });

  test("leiding is alleen een verticale lijn over de volle hoogte", () => {
    expect(tekenSymbool(leiding).svg).toMatch(/^<line x1="1" y1="12" x2="1" y2="0"[^>]*\/>$/);
  });

  test("verdeelbord is een rechthoek van 12 × 6 met een horizontale lijn bovenaan", () => {
    const svg = tekenSymbool(verdeelbord).svg;
    expect(svg).toContain('<rect x="0" y="0" width="12" height="6"');
    expect(svg).toMatch(/<line x1="0" y1="1.5" x2="12" y2="1.5"/);
  });
});
