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

    type Lijn = { x1: number; y1: number; x2: number; y2: number; rol: string | undefined };
    const lijnen = (svg: string): Lijn[] =>
      [...svg.matchAll(/<line([^>]*)>/g)].map(([, a = ""]) => {
        const n = (s: string) => Number(a.match(new RegExp(`${s}="([^"]*)"`))?.[1]);
        return { x1: n("x1"), y1: n("y1"), x2: n("x2"), y2: n("y2"), rol: a.match(/data-rol="([^"]*)"/)?.[1] };
      });
    const metRol = (svg: string, rol: string) => lijnen(svg).filter((l) => l.rol === rol);
    const waterpas = (l: Lijn) => Math.abs(l.y1 - l.y2) < 1e-9;

    /** De boog: middelpunt, straal en de y van de top (het punt het dichtst bij `in`). */
    function boog(svg: string) {
      const m = svg.match(/<path d="M(\S+) (\S+) A(\S+) (\S+) 0 0 (\d) (\S+) (\S+)"/);
      if (!m) throw new Error("geen boog gevonden");
      const [sx, sy, r, , sweep, ex, ey] = [m[1], m[2], m[3], m[4], m[5], m[6], m[7]].map(Number) as [
        number, number, number, number, number, number, number,
      ];
      // Van links naar rechts: sweep 0 loopt tegen de klok in, dus onderlangs (bolle kant naar onder).
      const naarOnder = (sx < ex) === (sweep === 0);
      return { x1: sx, x2: ex, r, eindY: sy, eindY2: ey, topY: naarOnder ? sy + r : sy - r };
    }

    test.each(contactdozen)("de boog opent naar uit: %s", (_naam, node) => {
      const svg = tekenSymbool(node).svg;
      const b = boog(svg);
      expect(b.eindY).toBeCloseTo(b.eindY2, 9);
      // De uiteinden liggen boven (kleinere y) de top, en de top ligt het dichtst bij `in` (y = 10).
      expect(b.eindY).toBeLessThan(b.topY);
      expect(10 - b.topY).toBeLessThan(10 - b.eindY);
      expect(b.topY).toBeLessThanOrEqual(10);
      // De lijn loopt van `in` door de boog tot `uit`.
      const lang = lijnen(svg).find((l) => l.rol === undefined && l.x1 === 7 && l.x2 === 7 && Math.abs(l.y1 - l.y2) > 5);
      expect(lang).toBeDefined();
      expect(Math.max(lang!.y1, lang!.y2)).toBe(10);
      expect(Math.min(lang!.y1, lang!.y2)).toBe(0);
    });

    test.each(contactdozen)("randaarde raakt de bolle kant: %s", (_naam, node) => {
      const svg = tekenSymbool(node).svg;
      const { randaarde } = node as NodeVan<"contactdoos">;
      const streep = metRol(svg, "randaarde");
      if (!randaarde) {
        expect(streep).toHaveLength(0);
        return;
      }
      const b = boog(svg);
      expect(streep).toHaveLength(1);
      const [s] = streep as [Lijn];
      expect(waterpas(s)).toBe(true);
      expect(s.y1).toBeGreaterThan(b.topY - 0.2);
      expect(s.y1).toBeLessThan(b.topY + 0.2);
      expect(Math.abs(s.x2 - s.x1)).toBeGreaterThan(2 * b.r);
    });

    test.each(contactdozen)("kinderbescherming: %s", (_naam, node) => {
      const svg = tekenSymbool(node).svg;
      const { kinderbeveiliging } = node as NodeVan<"contactdoos">;
      const voetjes = metRol(svg, "kinderbeveiliging");
      if (!kinderbeveiliging) {
        expect(voetjes).toHaveLength(0);
        return;
      }
      const b = boog(svg);
      expect(voetjes).toHaveLength(2);
      for (const v of voetjes) {
        expect(waterpas(v)).toBe(true);
        expect(v.y1).toBeCloseTo(b.eindY, 9);
        // Begint aan een uiteinde van de boog en wijst naar buiten: weg van het midden (x = 7).
        expect([b.x1, b.x2].some((e) => Math.abs(e - v.x1) < 1e-9)).toBe(true);
        expect(Math.abs(v.x2 - 7)).toBeGreaterThan(Math.abs(v.x1 - 7));
      }
      expect(voetjes.filter((v) => v.x1 < 7)).toHaveLength(1);
    });

    test.each(contactdozen)("waterdicht is de letter h: %s", (_naam, node) => {
      const svg = tekenSymbool(node).svg;
      const { waterdicht } = node as NodeVan<"contactdoos">;
      expect(svg).not.toMatch(/<path [^>]*fill="currentColor"/);
      const h = svg.match(/<text x="([^"]*)"[^>]*data-rol="waterdicht"[^>]*>([^<]*)<\/text>/);
      if (!waterdicht) {
        expect(h).toBeNull();
        return;
      }
      expect(h?.[2]).toBe("h");
      expect(svg).toContain('font-size="2.5" text-anchor="start"');
      expect(Number(h?.[1])).toBeGreaterThanOrEqual(7 + boog(svg).r);
    });

    test.each(contactdozen)("aantal: %s", (_naam, node) => {
      const svg = tekenSymbool({ ...node, aantal: 3 } as NodeVan<"contactdoos">).svg;
      expect(metRol(svg, "aantal-streep")).toHaveLength(1);
      expect(svg).toMatch(/data-rol="aantal"[^>]*>3<\/text>/);
      expect(svg).not.toContain("×");
      const een = tekenSymbool(node).svg;
      expect(een).not.toContain("aantal-streep");
      expect(een).not.toContain('data-rol="aantal"');
    });

    test("het aantal is een getal zonder teken ×, ook boven 9", () => {
      expect(svgVan({ aantal: 12 })).toMatch(/data-rol="aantal"[^>]*>12<\/text>/);
      expect(svgVan({ aantal: 1 })).not.toContain("<text");
    });

    test("randaarde, kinderbeveiliging en waterdicht verschijnen alleen als ze aan staan", () => {
      expect(aantalVan(svgVan({}), "randaarde")).toBe(0);
      expect(aantalVan(svgVan({ randaarde: true }), "randaarde")).toBe(1);
      expect(aantalVan(svgVan({}), "kinderbeveiliging")).toBe(0);
      expect(aantalVan(svgVan({ kinderbeveiliging: true }), "kinderbeveiliging")).toBe(2);
      expect(aantalVan(svgVan({}), "waterdicht")).toBe(0);
      expect(aantalVan(svgVan({ waterdicht: true }), "waterdicht")).toBe(1);
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

  test("verdeelbord is een gewone rechthoek van 12 × 6", () => {
    const svg = tekenSymbool(verdeelbord).svg;
    expect(svg).toContain('<rect x="0" y="0" width="12" height="6"');
    expect(svg).not.toContain("<line");
  });
});
