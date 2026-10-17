import type { Node, NodeVan } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { KOLOM_BREEDTE_MM, tekenSymbool } from "../src/index";
import { buitenVak, isGoedgevormd } from "./hulp";

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

    test("in en uit liggen op het midden, bovenaan en onderaan", () => {
      expect(maat.in.x).toBe(maat.breedte / 2);
      expect(maat.uit.x).toBe(maat.breedte / 2);
      expect(maat.in.y).toBe(0);
      expect(maat.uit.y).toBe(maat.hoogte);
    });

    test("alle meetkunde ligt binnen het vak", () => {
      expect(buitenVak(symbool)).toEqual([]);
    });

    test("is goedgevormde XML zonder NaN of undefined", () => {
      expect(isGoedgevormd(symbool)).toBe(true);
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
    expect(maat(differentieel(2))).toEqual([14, 14]);
    expect(maat(zekering)).toEqual([8, 14]);
  });

  test.each([1, 2, 3, 4] as const)("automaat met %i polen heeft evenveel poolstreepjes", (polen) => {
    const { svg } = tekenSymbool(automaat(polen));
    expect(svg.match(/data-rol="pool"/g)).toHaveLength(polen);
  });

  test.each([2, 4] as const)("differentieel met %i polen heeft evenveel poolstreepjes", (polen) => {
    const { svg } = tekenSymbool(differentieel(polen));
    expect(svg.match(/data-rol="pool"/g)).toHaveLength(polen);
  });

  test("poolstreepjes zijn lijnen", () => {
    const { svg } = tekenSymbool(automaat(4));
    const lijnen = svg.match(/<line [^>]*data-rol="pool"[^>]*\/>/g) ?? [];
    expect(lijnen).toHaveLength(4);
  });

  test("het differentieel toont ΔI", () => {
    expect(tekenSymbool(differentieel(2)).svg).toContain(">ΔI</text>");
  });

  test("teller toont kWh en aansluiting toont ~", () => {
    expect(tekenSymbool(teller).svg).toContain(">kWh</text>");
    expect(tekenSymbool(aansluiting).svg).toContain(">~</text>");
  });
});
