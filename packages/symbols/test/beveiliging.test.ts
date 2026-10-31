import type { Node, NodeVan } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { KOLOM_BREEDTE_MM, tekenSymbool } from "../src/index";
import { buitenVak, isGoedgevormd, nietRechtop, raakt } from "./hulp";

const basis = { id: "n1", parentId: "n0", kinderen: [] as string[] };

function automaat(polen: 1 | 2 | 3 | 4): NodeVan<"automaat"> {
  return { ...basis, type: "automaat", nominaal_A: 16, polen, curve: "B" };
}

function differentieel(polen: 1 | 2 | 3 | 4): NodeVan<"differentieel"> {
  return { ...basis, type: "differentieel", gevoeligheid_mA: 30, nominaal_A: 40, polen, klasse: "A" };
}

const zekering: NodeVan<"zekering"> = { ...basis, type: "zekering", nominaal_A: 20 };
const teller: NodeVan<"teller"> = { ...basis, type: "teller" };
const aansluiting: NodeVan<"aansluiting"> = { ...basis, type: "aansluiting", parentId: null };

const varianten: ReadonlyArray<[string, Node]> = [
  ["automaat 1 pool", automaat(1)],
  ["automaat 2 polen", automaat(2)],
  ["automaat 3 polen", automaat(3)],
  ["automaat 4 polen", automaat(4)],
  ["differentieel 2 polen", differentieel(2)],
  ["differentieel 4 polen", differentieel(4)],
  ["zekering", zekering],
  ["teller", teller],
  ["aansluiting", aansluiting],
];

describe("symbolen voor voeding en beveiliging", () => {
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
      expect(maat.in.x).toBe(maat.breedte / 2);
      expect(maat.uit.x).toBe(maat.breedte / 2);
      expect(maat.in.y).toBe(maat.hoogte);
      expect(maat.uit.y).toBe(0);
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
    expect(maat(aansluiting)).toEqual([10, 8]);
    expect(maat(teller)).toEqual([10, 12]);
    expect(maat(automaat(1))).toEqual([10, 14]);
    expect(maat(differentieel(2))).toEqual([10, 14]);
    expect(maat(zekering)).toEqual([8, 14]);
  });

  describe.each([1, 2, 3, 4] as const)("automaat volgens AREI met %i polen", (polen) => {
    const symbool = tekenSymbool(automaat(polen));
    const { svg, maat } = symbool;

    test("heeft geen poolstreepjes en geen kruisje", () => {
      expect(svg).not.toContain('data-rol="pool"');
      expect(svg).not.toContain('data-rol="kruis"');
      expect(svg.match(/<line /g)?.length ?? 0).toBeLessThanOrEqual(3);
    });

    test("heeft precies één gevuld blokje op het vrije uiteinde van het contact", () => {
      const blokjes = svg.match(/<[a-z]+ [^>]*data-rol="blokje"[^>]*\/>/g) ?? [];
      expect(blokjes).toHaveLength(1);
      expect(blokjes[0]).toContain('fill="currentColor"');
    });

    test("het blokje ligt links van het midden, op 50 tot 90 procent van de hoogte vanaf in", () => {
      const blokje = svg.match(/<path [^>]*data-rol="blokje"[^>]*\/>/)?.[0] ?? "";
      const d = blokje.match(/ d="([^"]*)"/)?.[1] ?? "";
      const getallen = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
      const xs = getallen.filter((_, i) => i % 2 === 0);
      const ys = getallen.filter((_, i) => i % 2 === 1);
      const middenX = xs.reduce((a, b) => a + b, 0) / xs.length;
      const middenY = ys.reduce((a, b) => a + b, 0) / ys.length;
      expect(xs.length).toBeGreaterThanOrEqual(4);
      expect(middenX).toBeLessThan(maat.breedte / 2);
      const afstand = (maat.in.y - middenY) / maat.hoogte;
      expect(afstand).toBeGreaterThanOrEqual(0.5);
      expect(afstand).toBeLessThanOrEqual(0.9);
    });
  });

  test("automaat is gelijk voor elk aantal polen", () => {
    expect(tekenSymbool(automaat(1)).svg).toBe(tekenSymbool(automaat(4)).svg);
  });

  describe.each([2, 4] as const)("differentieel met %i polen", (polen) => {
    test("tekent hetzelfde contact als de automaat", () => {
      expect(tekenSymbool(differentieel(polen))).toEqual(tekenSymbool(automaat(1)));
    });

    test("heeft geen rechthoek en geen ΔI", () => {
      const { svg } = tekenSymbool(differentieel(polen));
      expect(svg).not.toContain("<rect");
      expect(svg).not.toContain("ΔI");
    });
  });

  test("teller toont kWh en aansluiting toont een sinus als pad", () => {
    expect(tekenSymbool(teller).svg).toContain(">kWh</text>");
    expect(tekenSymbool(aansluiting).svg).toContain('data-rol="sinus"');
  });
});
