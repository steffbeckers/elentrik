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

type Lijn = { x1: number; y1: number; x2: number; y2: number; rol: string | undefined };
const lijnen = (svg: string): Lijn[] =>
  [...svg.matchAll(/<line([^>]*)>/g)].map(([, a = ""]) => {
    const n = (s: string) => Number(a.match(new RegExp(`${s}="([^"]*)"`))?.[1]);
    return { x1: n("x1"), y1: n("y1"), x2: n("x2"), y2: n("y2"), rol: a.match(/data-rol="([^"]*)"/)?.[1] };
  });
const metRol = (svg: string, rol: string) => lijnen(svg).filter((l) => l.rol === rol);
const waterpas = (l: Lijn) => Math.abs(l.y1 - l.y2) < 1e-9;

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
    const kruis = (svg: string) => metRol(svg, "kruis");
    /** De lijn van `in` naar `uit`: loodrecht, zonder rol. */
    const leidingLijn = (svg: string) =>
      lijnen(svg).find((l) => l.rol === undefined && l.x1 === 7 && l.x2 === 7 && Math.abs(l.y1 - l.y2) === 10);

    test("standaard en zonder soort: een kruis zonder cirkel", () => {
      for (const soort of [undefined, "standaard"] as const) {
        const svg = svgVan(soort);
        expect(svg).not.toContain("<circle");
        const [a, b, ...rest] = kruis(svg);
        expect(rest).toHaveLength(0);
        expect(a).toBeDefined();
        expect(b).toBeDefined();
        for (const l of [a!, b!]) {
          // Diagonaal, en het midden van het lijnstuk ligt op x = breedte / 2.
          expect(l.x1).not.toBe(l.x2);
          expect(l.y1).not.toBe(l.y2);
          expect((l.x1 + l.x2) / 2).toBeCloseTo(7, 9);
        }
        // Ze snijden elkaar: de ene loopt omhoog, de andere omlaag, rond hetzelfde midden.
        expect(Math.sign((a!.x2 - a!.x1) * (a!.y2 - a!.y1))).toBe(-Math.sign((b!.x2 - b!.x1) * (b!.y2 - b!.y1)));
        expect((a!.y1 + a!.y2) / 2).toBeCloseTo((b!.y1 + b!.y2) / 2, 9);
        // De leiding loopt van in naar uit en gaat door het snijpunt.
        const l = leidingLijn(svg);
        expect(l).toBeDefined();
        const midden = (a!.y1 + a!.y2) / 2;
        expect(Math.min(l!.y1, l!.y2)).toBeLessThan(midden);
        expect(Math.max(l!.y1, l!.y2)).toBeGreaterThan(midden);
      }
    });

    test("standaard en zonder soort zijn gelijk", () => {
      expect(svgVan("standaard")).toBe(svgVan());
    });

    test("led: het kruis plus de tekst LED", () => {
      const svg = svgVan("led");
      expect(kruis(svg)).toHaveLength(2);
      expect(svg).not.toContain("<circle");
      expect(svg).toContain(">LED</text>");
      expect(svgVan("tl")).not.toContain("LED");
    });

    test("tl: een lijn dwars op de leiding met een streepje aan beide uiteinden, zonder kruis", () => {
      const svg = svgVan("tl");
      expect(kruis(svg)).toHaveLength(0);
      expect(svg).not.toContain("<circle");
      const tl = metRol(svg, "tl");
      expect(tl).toHaveLength(1);
      const [t] = tl as [Lijn];
      expect(waterpas(t)).toBe(true);
      // De leiding kruist de lijn in het midden.
      expect((t.x1 + t.x2) / 2).toBeCloseTo(7, 9);
      const l = leidingLijn(svg);
      expect(l).toBeDefined();
      expect(Math.min(l!.y1, l!.y2)).toBeLessThan(t.y1);
      expect(Math.max(l!.y1, l!.y2)).toBeGreaterThan(t.y1);
      // Aan elk uiteinde een kort verticaal streepje, over het uiteinde heen.
      const einden = metRol(svg, "tl-einde");
      expect(einden).toHaveLength(2);
      for (const e of einden) {
        expect(e.x1).toBeCloseTo(e.x2, 9);
        expect([t.x1, t.x2].some((x) => Math.abs(x - e.x1) < 1e-9)).toBe(true);
        expect(Math.abs(e.y2 - e.y1)).toBeLessThan(Math.abs(t.x2 - t.x1));
        expect(Math.min(e.y1, e.y2)).toBeLessThan(t.y1);
        expect(Math.max(e.y1, e.y2)).toBeGreaterThan(t.y1);
      }
      expect(einden.filter((e) => e.x1 < 7)).toHaveLength(1);
    });

    test("spot: een cirkel met een kruis erin en een boog aan de kant van in", () => {
      const svg = svgVan("spot");
      const cirkels = [...svg.matchAll(/<circle cx="([^"]*)" cy="([^"]*)" r="([^"]*)"/g)];
      expect(cirkels).toHaveLength(1);
      const [cx, cy, r] = cirkels[0]!.slice(1).map(Number) as [number, number, number];
      expect(cx).toBe(7);
      // Beide diagonalen liggen in de cirkel (de uitvoer is op 0,01 mm afgerond).
      const k = kruis(svg);
      expect(k).toHaveLength(2);
      for (const l of k) {
        for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]] as const) {
          expect(Math.hypot(x - cx, y - cy)).toBeLessThanOrEqual(r + 0.01);
        }
      }
      // De boog: een pad met rol projector, de uiteinden en de top onder de cirkel (kant van in, y = 10).
      const m = svg.match(/<path d="M(\S+) (\S+) A(\S+) (\S+) 0 0 (\d) (\S+) (\S+)"[^>]*data-rol="projector"/);
      expect(m).not.toBeNull();
      const [x1, y1, br, , sweep, x2, y2] = m!.slice(1).map(Number) as [number, number, number, number, number, number, number];
      expect(sweep).toBe(0);
      expect(br).toBeGreaterThan(r);
      expect(y1).toBeCloseTo(y2, 9);
      expect(x1).toBeLessThan(x2);
      // Sweep 0 van links naar rechts loopt onderlangs: de boogmidden ligt op y1 + (de pijl van de boog).
      const sagitta = br - Math.sqrt(br * br - ((x2 - x1) / 2) ** 2);
      const topY = y1 + sagitta;
      expect(topY).toBeGreaterThan(cy);
      expect(y1).toBeGreaterThan(cy);
      expect(topY).toBeLessThan(10);
      // Geen leiding in de lamp: de twee stukken van de leiding raken de onderkant en de bovenkant
      // van de cirkel, en geen enkel verticaal lijnstuk op x = 7 ligt (deels) binnen de cirkel.
      const opLeiding = lijnen(svg).filter((l) => l.rol === undefined && l.x1 === 7 && l.x2 === 7);
      expect(opLeiding).toHaveLength(2);
      for (const l of opLeiding) {
        const [boven, onder] = [Math.min(l.y1, l.y2), Math.max(l.y1, l.y2)];
        expect(onder <= cy - r + 1e-9 || boven >= cy + r - 1e-9).toBe(true);
      }
      const onderstuk = opLeiding.find((l) => Math.max(l.y1, l.y2) === 10);
      const bovenstuk = opLeiding.find((l) => Math.min(l.y1, l.y2) === 0);
      expect(onderstuk).toBeDefined();
      expect(bovenstuk).toBeDefined();
      expect(Math.min(onderstuk!.y1, onderstuk!.y2)).toBeCloseTo(cy + r, 9);
      expect(Math.max(bovenstuk!.y1, bovenstuk!.y2)).toBeCloseTo(cy - r, 9);
      // De leiding van `in` kruist de boog (op y = cy + boogstraal) en komt zo bij de cirkel.
      expect(Math.min(onderstuk!.y1, onderstuk!.y2)).toBeLessThan(topY);
    });

    test("noodverlichting: het kruis plus een gevulde stip in het snijpunt, geen andere cirkel", () => {
      const svg = svgVan("noodverlichting");
      const k = kruis(svg);
      expect(k).toHaveLength(2);
      const cirkels = [...svg.matchAll(/<circle([^>]*)\/>/g)];
      expect(cirkels).toHaveLength(1);
      const c = cirkels[0]![1]!;
      expect(c).toContain('data-rol="nood"');
      expect(c).toContain('fill="currentColor"');
      expect(Number(c.match(/cx="([^"]*)"/)?.[1])).toBe(7);
      expect(Number(c.match(/cy="([^"]*)"/)?.[1])).toBeCloseTo((k[0]!.y1 + k[0]!.y2) / 2, 9);
      expect(svgVan("standaard")).not.toContain('fill="currentColor"');
    });

    test("het aantal wordt alleen getoond vanaf 2, als tekst n×", () => {
      expect(svgVan("standaard", 1)).not.toContain("<text");
      expect(svgVan("standaard", 4)).toMatch(/data-rol="aantal"[^>]*>4×<\/text>/);
      expect(svgVan("tl", 3)).toMatch(/data-rol="aantal"[^>]*>3×<\/text>/);
    });

    test.each(["standaard", "led", "tl", "spot", "noodverlichting"] as const)(
      "het aantal eindigt links van het symbool: %s",
      (soort) => {
        const svg = svgVan(soort, 3);
        const tekstX = Number(svg.match(/<text x="([^"]*)"[^>]*data-rol="aantal"/)?.[1]);
        expect(svg).toMatch(/text-anchor="end"[^>]*data-rol="aantal"/);
        // Het meest linkse deel van de getekende vorm; het aantal zelf telt niet mee.
        const vorm = svg.replace(/<text[^>]*data-rol="aantal"[^>]*>[^<]*<\/text>/, "");
        const xs: number[] = [];
        for (const m of vorm.matchAll(/<line x1="([^"]*)"[^>]*x2="([^"]*)"/g)) xs.push(Number(m[1]), Number(m[2]));
        for (const m of vorm.matchAll(/<circle cx="([^"]*)"[^>]*r="([^"]*)"/g)) xs.push(Number(m[1]) - Number(m[2]));
        for (const m of vorm.matchAll(/<path d="M(\S+) \S+ A\S+ \S+ 0 0 \d (\S+) /g)) xs.push(Number(m[1]), Number(m[2]));
        for (const m of vorm.matchAll(/<text x="([^"]*)"/g)) xs.push(Number(m[1]));
        expect(xs.length).toBeGreaterThan(0);
        expect(tekstX).toBeLessThanOrEqual(Math.min(...xs));
      },
    );
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
