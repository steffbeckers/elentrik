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
    expect(maat(schakelaar("enkel"))).toEqual([14, 12]);
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
    const breedteVan = (soort: NodeVan<"schakelaar">["soort"]) => tekenSymbool(schakelaar(soort)).maat.breedte;
    const aantalCirkels = (svg: string) => svg.match(/<circle/g)?.length ?? 0;
    type Cirkel = { cx: number; cy: number; r: number };
    const cirkels = (svg: string): Cirkel[] =>
      [...svg.matchAll(/<circle cx="([^"]*)" cy="([^"]*)" r="([^"]*)"/g)].map(([, cx, cy, r]) => ({
        cx: Number(cx),
        cy: Number(cy),
        r: Number(r),
      }));
    /** Middelpunt en straal van de eerste (buitenste) cirkel. */
    function cirkelVan(svg: string): Cirkel {
      const [eerste] = cirkels(svg);
      if (!eerste) throw new Error("geen cirkel gevonden");
      return eerste;
    }
    const hendelsVan = (svg: string) => metRol(svg, "hendel");
    const haken = (svg: string) => metRol(svg, "haak");
    const richting = (l: Lijn) => ({ dx: l.x2 - l.x1, dy: l.y2 - l.y1 });
    /** Kwadrant van het uiteinde van de hendel ten opzichte van het middelpunt van de cirkel. */
    const kwadrant = (svg: string, l: Lijn) => {
      const { cx, cy } = cirkelVan(svg);
      return `${l.x2 > cx ? "rechts" : "links"}${l.y2 < cy ? "boven" : "onder"}`;
    };

    test("is een cirkel met r = 2 en een geleider van in en naar uit", () => {
      const symbool = tekenSymbool(schakelaar("enkel"));
      const { cx, cy, r } = cirkelVan(symbool.svg);
      expect(r).toBe(2);
      expect(cx).toBe(symbool.maat.breedte / 2);
      const geleiders = lijnen(symbool.svg).filter((l) => l.rol === undefined && l.x1 === cx && l.x2 === cx);
      expect(geleiders.some((l) => l.y1 === cy - r && l.y2 === 0)).toBe(true);
      expect(geleiders.some((l) => l.y1 === symbool.maat.hoogte && l.y2 === cy + r)).toBe(true);
    });

    test("de breedte blijft binnen 20 mm", () => {
      for (const soort of ["enkel", "dubbel", "wissel", "kruis", "dimmer", "drukknop"] as const) {
        expect(breedteVan(soort)).toBeLessThanOrEqual(KOLOM_BREEDTE_MM - 4);
      }
    });

    test.each([
      ["enkel", 1, 0],
      ["dubbel", 2, 2],
      ["wissel", 2, 2],
      ["kruis", 4, 4],
      ["dimmer", 1, 0],
      ["drukknop", 0, 0],
    ] as const)("%s heeft %i hendel(s) en %i haken", (soort, aantalHendels, aantalHaken) => {
      const svg = svgVan(soort);
      expect(hendelsVan(svg)).toHaveLength(aantalHendels);
      expect(haken(svg)).toHaveLength(aantalHaken);
    });

    test("enkel: één hendel naar rechtsboven, weg van de voeding", () => {
      const svg = svgVan("enkel");
      const { cx, cy } = cirkelVan(svg);
      const [h] = hendelsVan(svg) as [Lijn];
      expect(h.x2).toBeGreaterThan(cx);
      expect(h.y2).toBeLessThan(cy);
    });

    test("dubbel: twee hendels in een V aan de kant van uit", () => {
      const svg = svgVan("dubbel");
      const { cx, cy } = cirkelVan(svg);
      const hs = hendelsVan(svg);
      expect(hs.every((h) => h.y2 < cy)).toBe(true);
      expect(hs.filter((h) => h.x2 < cx)).toHaveLength(1);
      expect(hs.filter((h) => h.x2 > cx)).toHaveLength(1);
    });

    test("wissel: één hendel rechtsboven en één linksonder", () => {
      const svg = svgVan("wissel");
      expect(hendelsVan(svg).map((h) => kwadrant(svg, h)).sort()).toEqual(["linksonder", "rechtsboven"]);
    });

    test("kruis: één hendel per kwadrant", () => {
      const svg = svgVan("kruis");
      expect(hendelsVan(svg).map((h) => kwadrant(svg, h)).sort()).toEqual([
        "linksboven",
        "linksonder",
        "rechtsboven",
        "rechtsonder",
      ]);
    });

    test("hendels beginnen op de rand van de cirkel", () => {
      for (const soort of ["enkel", "dubbel", "wissel", "kruis", "dimmer"] as const) {
        const svg = svgVan(soort);
        const { cx, cy, r } = cirkelVan(svg);
        for (const h of hendelsVan(svg)) expect(Math.hypot(h.x1 - cx, h.y1 - cy)).toBeCloseTo(r, 2);
      }
    });

    test.each(["dubbel", "wissel", "kruis"] as const)("%s: elke haak staat haaks op het uiteinde van zijn hendel", (soort) => {
      const svg = svgVan(soort);
      const { cx } = cirkelVan(svg);
      for (const h of hendelsVan(svg)) {
        const k = haken(svg).find((l) => Math.abs(l.x1 - h.x2) < 1e-2 && Math.abs(l.y1 - h.y2) < 1e-2);
        expect(k, "haak begint op het uiteinde van de hendel").toBeDefined();
        const a = richting(h);
        const b = richting(k!);
        const inproduct = (a.dx * b.dx + a.dy * b.dy) / (Math.hypot(a.dx, a.dy) * Math.hypot(b.dx, b.dy));
        expect(Math.abs(inproduct)).toBeLessThan(0.02);
        // Naar buiten: weg van de verticale lijn, aan de kant van de hendel.
        expect(Math.sign(k!.x2 - k!.x1)).toBe(Math.sign(h.x2 - cx));
        const lengte = Math.hypot(b.dx, b.dy);
        expect(lengte).toBeGreaterThan(0.7);
        expect(lengte).toBeLessThan(1.5);
      }
    });

    test("een tweede hendel aan dezelfde kant ligt minstens 30° van de verticale lijn", () => {
      for (const soort of ["dubbel", "wissel", "kruis"] as const) {
        for (const h of hendelsVan(svgVan(soort))) {
          const { dx, dy } = richting(h);
          expect((Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI).toBeGreaterThanOrEqual(30);
        }
      }
    });

    test("hendels raken de geleider niet", () => {
      for (const soort of ["enkel", "dubbel", "wissel", "kruis", "dimmer"] as const) {
        const svg = svgVan(soort);
        const { cx } = cirkelVan(svg);
        for (const l of [...hendelsVan(svg), ...haken(svg)]) {
          // Alle punten, op het beginpunt van een hendel (op de cirkel) na, liggen ver van x = cx.
          for (let t = 0; t <= 1; t += 0.05) {
            if (t === 0 && l.rol === "hendel") continue;
            const x = l.x1 + (l.x2 - l.x1) * t;
            expect(Math.abs(x - cx), `${soort} ${l.rol} t=${t}`).toBeGreaterThan(0.3);
          }
        }
      }
    });

    test("dimmer: een open driehoekje op het uiteinde van de hendel", () => {
      const svg = svgVan("dimmer");
      const m = svg.match(/<path d="([^"]*)"[^>]*data-rol="vlag"/);
      expect(m).not.toBeNull();
      expect(svg).not.toMatch(/<path [^>]*fill="currentColor"/);
      const [h] = hendelsVan(svg) as [Lijn];
      const hoeken = [...m![1]!.matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)] as const);
      expect(hoeken).toHaveLength(3);
      expect(hoeken.some(([x, y]) => Math.abs(x - h.x2) < 1e-2 && Math.abs(y - h.y2) < 1e-2)).toBe(true);
      expect(svgVan("enkel")).not.toContain('data-rol="vlag"');
      expect(svg).not.toContain('data-rol="pijl"');
    });

    test("drukknop: een cirkel in een cirkel, zonder hendel", () => {
      const svg = svgVan("drukknop");
      expect(aantalCirkels(svg)).toBe(2);
      const [buiten, binnen] = cirkels(svg) as [Cirkel, Cirkel];
      expect(binnen.cx).toBeCloseTo(buiten.cx, 9);
      expect(binnen.cy).toBeCloseTo(buiten.cy, 9);
      expect(binnen.r).toBeLessThan(buiten.r);
      expect(hendelsVan(svg)).toHaveLength(0);
      expect(svg).not.toContain('data-rol="knop"');
    });

    test("de andere soorten hebben één cirkel", () => {
      for (const soort of ["enkel", "dubbel", "wissel", "kruis", "dimmer"] as const) {
        expect(aantalCirkels(svgVan(soort))).toBe(1);
      }
    });

    test("waterdicht is de letter h en geen gevuld pad", () => {
      for (const soort of ["enkel", "dubbel", "wissel", "kruis", "dimmer", "drukknop"] as const) {
        const svg = svgVan(soort, true);
        expect(svg).not.toMatch(/<path [^>]*fill="currentColor"/);
        expect(svg).toMatch(/<text [^>]*data-rol="waterdicht"[^>]*>h<\/text>/);
        expect(svgVan(soort, false)).not.toContain('data-rol="waterdicht"');
      }
    });
  });

  describe("toestel", () => {
    type Element = { naam: string; a: Map<string, string> };
    const elementen = (svg: string): Element[] =>
      [...svg.matchAll(/<(line|circle|rect|path|text)\b([^>]*)>/g)].map(([, naam = "", tekst = ""]) => ({
        naam,
        a: new Map([...tekst.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k = "", w = ""]) => [k, w] as const)),
      }));
    const alle = (soort: NodeVan<"toestel">["soort"]) => elementen(tekenSymbool(toestel(soort)).svg);
    /** De pictogramelementen: die met rol "picto". */
    const picto = (soort: NodeVan<"toestel">["soort"], naam?: string) =>
      alle(soort).filter((e) => e.a.get("data-rol") === "picto" && (naam === undefined || e.naam === naam));
    const getal = (e: Element, sleutel: string) => Number(e.a.get(sleutel));
    const gevuld = (e: Element) => e.a.get("fill") === "currentColor";
    const geheel = (e: Element) => ({ x1: getal(e, "x1"), y1: getal(e, "y1"), x2: getal(e, "x2"), y2: getal(e, "y2") });
    const diagonaal = (e: Element) => {
      const { x1, y1, x2, y2 } = geheel(e);
      return Math.abs(x1 - x2) > 1e-9 && Math.abs(y1 - y2) > 1e-9;
    };
    const waterpasLijn = (e: Element) => Math.abs(getal(e, "y1") - getal(e, "y2")) < 1e-9;
    const verticaal = (e: Element) => Math.abs(getal(e, "x1") - getal(e, "x2")) < 1e-9;
    const aantalBogen = (e: Element) => e.a.get("d")?.match(/A/g)?.length ?? 0;
    /** De eindpunten (x, y) van elke padopdracht; bij een boog zijn dat de laatste twee getallen. */
    const padPunten = (e: Element) =>
      [...(e.a.get("d") ?? "").matchAll(/[MLA]([^MLAZ]*)/g)].map(([, getallen = ""]) => {
        const n = getallen.trim().split(/\s+/).map(Number);
        return [n[n.length - 2]!, n[n.length - 1]!] as const;
      });

    const vierkantSoorten = [
      "andere",
      "wasmachine",
      "droogkast",
      "vaatwasser",
      "kookplaat",
      "oven",
      "omvormer",
      "warmtepomp",
    ] as const;

    test("alle soorten hebben een test", () => {
      expect([...vierkantSoorten, "boiler", "laadpaal"].sort()).toEqual([...ToestelsoortSchema.options].sort());
    });

    test.each(vierkantSoorten)("%s is een vierkant van 10 × 10 in een kader van 12 × 12", (soort) => {
      const rechthoeken = alle(soort).filter((e) => e.naam === "rect");
      expect(rechthoeken).toHaveLength(1);
      const [r] = rechthoeken as [Element];
      expect([getal(r, "width"), getal(r, "height")]).toEqual([10, 10]);
      expect([getal(r, "x"), getal(r, "y")]).toEqual([1, 1]);
      // Het vierkant zelf is geen pictogram.
      expect(r.a.get("data-rol")).toBeUndefined();
    });

    test.each(ToestelsoortSchema.options)("%s heeft geen tekst, behalve de warmtepomp", (soort) => {
      const teksten = alle(soort).filter((e) => e.naam === "text");
      expect(teksten).toHaveLength(soort === "warmtepomp" ? 1 : 0);
    });

    test("andere: het algemene symbool, een leeg vierkant", () => {
      expect(picto("andere")).toEqual([]);
    });

    test("wasmachine: een cirkel met een gevulde stip erin", () => {
      const cirkels = picto("wasmachine", "circle");
      expect(picto("wasmachine")).toHaveLength(2);
      const [leeg, vol] = [cirkels.filter((c) => !gevuld(c)), cirkels.filter(gevuld)];
      expect(leeg).toHaveLength(1);
      expect(vol).toHaveLength(1);
      expect(getal(vol[0]!, "r")).toBeLessThan(getal(leeg[0]!, "r"));
      expect([getal(vol[0]!, "cx"), getal(vol[0]!, "cy")]).toEqual([getal(leeg[0]!, "cx"), getal(leeg[0]!, "cy")]);
    });

    test("droogkast: een ∞ van twee bogen met een gevulde stip eronder", () => {
      const paden = picto("droogkast", "path");
      expect(paden).toHaveLength(1);
      expect(aantalBogen(paden[0]!)).toBe(2);
      const stippen = picto("droogkast", "circle");
      expect(stippen).toHaveLength(1);
      expect(gevuld(stippen[0]!)).toBe(true);
      // De ∞ staat bovenaan, de stip eronder.
      const ys = padPunten(paden[0]!).map(([, y]) => y);
      expect(Math.max(...ys)).toBeLessThan(getal(stippen[0]!, "cy"));
      expect(picto("droogkast")).toHaveLength(2);
    });

    test("vaatwasser: twee diagonalen met een cirkel in het midden", () => {
      const diagonalen = picto("vaatwasser", "line");
      expect(diagonalen).toHaveLength(2);
      expect(diagonalen.every(diagonaal)).toBe(true);
      // Eén stijgend en één dalend.
      const helling = (e: Element) => Math.sign((getal(e, "x2") - getal(e, "x1")) * (getal(e, "y2") - getal(e, "y1")));
      expect(new Set(diagonalen.map(helling)).size).toBe(2);
      const cirkels = picto("vaatwasser", "circle");
      expect(cirkels).toHaveLength(1);
      expect(gevuld(cirkels[0]!)).toBe(false);
      expect([getal(cirkels[0]!, "cx"), getal(cirkels[0]!, "cy")]).toEqual([6, 6]);
      expect(picto("vaatwasser")).toHaveLength(3);
    });

    test("kookplaat: precies drie gevulde stippen, twee boven en één rechtsonder", () => {
      const stippen = picto("kookplaat", "circle");
      expect(picto("kookplaat")).toHaveLength(3);
      expect(stippen).toHaveLength(3);
      expect(stippen.every(gevuld)).toBe(true);
      const boven = stippen.filter((s) => getal(s, "cy") < 6);
      const onder = stippen.filter((s) => getal(s, "cy") >= 6);
      expect(boven).toHaveLength(2);
      expect(onder).toHaveLength(1);
      expect(boven.filter((s) => getal(s, "cx") < 6)).toHaveLength(1);
      expect(getal(onder[0]!, "cx")).toBeGreaterThan(6);
      expect(getal(onder[0]!, "cx")).toBeCloseTo(Math.max(...boven.map((s) => getal(s, "cx"))), 9);
    });

    test("oven: een band bovenaan en een gevulde stip in het midden", () => {
      const banden = picto("oven", "line");
      expect(banden).toHaveLength(1);
      expect(waterpasLijn(banden[0]!)).toBe(true);
      // De band loopt over de volle breedte van het vierkant, in het bovenste kwart.
      expect([getal(banden[0]!, "x1"), getal(banden[0]!, "x2")].sort((a, b) => a - b)).toEqual([1, 11]);
      expect(getal(banden[0]!, "y1")).toBeGreaterThan(1);
      expect(getal(banden[0]!, "y1")).toBeLessThan(4.5);
      const stippen = picto("oven", "circle");
      expect(stippen).toHaveLength(1);
      expect(gevuld(stippen[0]!)).toBe(true);
      expect(getal(stippen[0]!, "cx")).toBe(6);
      expect(getal(stippen[0]!, "cy")).toBeGreaterThan(getal(banden[0]!, "y1"));
      expect(picto("oven")).toHaveLength(2);
    });

    test("boiler: een cirkel met verticale arcering, zonder vierkant", () => {
      const svg = tekenSymbool(toestel("boiler")).svg;
      expect(svg).not.toContain("<rect");
      const cirkels = alle("boiler").filter((e) => e.naam === "circle");
      expect(cirkels).toHaveLength(1);
      const [c] = cirkels as [Element];
      expect(gevuld(c)).toBe(false);
      const [cx, cy, r] = [getal(c, "cx"), getal(c, "cy"), getal(c, "r")];
      const arcering = picto("boiler", "line");
      expect(arcering.length).toBeGreaterThanOrEqual(3);
      expect(picto("boiler")).toHaveLength(arcering.length);
      for (const l of arcering) {
        expect(verticaal(l)).toBe(true);
        // Beide uiteinden liggen in (of op) de cirkel.
        for (const [x, y] of [[getal(l, "x1"), getal(l, "y1")], [getal(l, "x2"), getal(l, "y2")]] as const) {
          expect(Math.hypot(x - cx, y - cy)).toBeLessThanOrEqual(r + 0.01);
        }
      }
    });

    test("laadpaal: een zuil met een schermpje en een kabel", () => {
      const rechthoeken = picto("laadpaal", "rect");
      expect(rechthoeken.length).toBeGreaterThanOrEqual(2);
      expect(picto("laadpaal", "line").length).toBeGreaterThanOrEqual(1);
      expect(alle("laadpaal").filter((e) => e.naam === "text")).toEqual([]);
      // Het schermpje ligt binnen de zuil: er is een rechthoek die een andere rechthoek omsluit.
      const omsluit = (z: Element, s: Element) =>
        z !== s &&
        getal(s, "x") > getal(z, "x") &&
        getal(s, "y") > getal(z, "y") &&
        getal(s, "x") + getal(s, "width") < getal(z, "x") + getal(z, "width") &&
        getal(s, "y") + getal(s, "height") < getal(z, "y") + getal(z, "height");
      expect(rechthoeken.some((z) => rechthoeken.some((s) => omsluit(z, s)))).toBe(true);
    });

    test("omvormer: een diagonaal, het gelijkstroomteken linksboven en het wisselstroomteken rechtsonder", () => {
      const lijnen2 = picto("omvormer", "line");
      const diagonalen = lijnen2.filter(diagonaal);
      expect(diagonalen).toHaveLength(1);
      // Van linksonder naar rechtsboven.
      const { x1, y1, x2, y2 } = geheel(diagonalen[0]!);
      const [linksY, rechtsY] = x1 < x2 ? [y1, y2] : [y2, y1];
      expect(linksY).toBeGreaterThan(rechtsY);
      // Het gelijkstroomteken: een volle en een gestippelde horizontale lijn, de volle boven, links van het midden.
      const waterpas = lijnen2.filter(waterpasLijn);
      expect(waterpas).toHaveLength(2);
      const volle = waterpas.filter((l) => !l.a.has("stroke-dasharray"));
      const gestippeld = waterpas.filter((l) => l.a.has("stroke-dasharray"));
      expect(volle).toHaveLength(1);
      expect(gestippeld).toHaveLength(1);
      expect(getal(volle[0]!, "y1")).toBeLessThan(getal(gestippeld[0]!, "y1"));
      for (const l of waterpas) {
        expect(Math.max(getal(l, "x1"), getal(l, "x2"))).toBeLessThan(6);
        expect(getal(l, "y1")).toBeLessThan(6);
      }
      // Het wisselstroomteken: een sinus van twee bogen, rechtsonder.
      const sinussen = picto("omvormer", "path");
      expect(sinussen).toHaveLength(1);
      expect(aantalBogen(sinussen[0]!)).toBe(2);
      for (const [x, y] of padPunten(sinussen[0]!)) {
        expect(x).toBeGreaterThan(6);
        expect(y).toBeGreaterThan(6);
      }
      expect(picto("omvormer")).toHaveLength(4);
    });

    test("warmtepomp: het algemene vierkant met de tekst WP", () => {
      const teksten = alle("warmtepomp").filter((e) => e.naam === "text");
      expect(teksten).toHaveLength(1);
      expect(tekenSymbool(toestel("warmtepomp")).svg).toContain(">WP</text>");
      expect(picto("warmtepomp")).toHaveLength(1);
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
