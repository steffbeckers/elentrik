import { NodeSchema, TOEGELATEN_KINDEREN } from "@elentrik/model";
import type { Node, NodeType } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { KOLOM_BREEDTE_MM, tekenSymbool } from "../src/index";
import { buitenVak, isGoedgevormd, nietRechtop, raakt } from "./hulp";

const basis = { id: "n1", parentId: "n0", kinderen: [] as string[] };

/** Per nodetype een minimale geldige node; `Record<NodeType, ...>` dwingt volledigheid af bij compilatie. */
const MINIMAAL: Readonly<Record<NodeType, Node>> = {
  aansluiting: { ...basis, type: "aansluiting", parentId: null },
  teller: { ...basis, type: "teller" },
  differentieel: { ...basis, type: "differentieel", gevoeligheid_mA: 30, nominaal_A: 40, polen: 2, klasse: "A" },
  automaat: { ...basis, type: "automaat", nominaal_A: 16, polen: 1, curve: "B" },
  zekering: { ...basis, type: "zekering", nominaal_A: 20 },
  verdeelbord: { ...basis, type: "verdeelbord" },
  leiding: { ...basis, type: "leiding", kabeltype: "", doorsnede_mm2: 0, aantalGeleiders: 3 },
  contactdoos: { ...basis, type: "contactdoos", aantal: 1, randaarde: true, kinderbeveiliging: false, waterdicht: false },
  lichtpunt: { ...basis, type: "lichtpunt", aantal: 1 },
  schakelaar: { ...basis, type: "schakelaar", soort: "enkel", waterdicht: false },
  toestel: { ...basis, type: "toestel", soort: "andere" },
};

/** De nodetypes zoals het model ze definieert: de opties van de discriminated union. */
const MODEL_TYPES: string[] = NodeSchema.options.map((optie) => optie.shape.type.value);

describe("alle nodetypes", () => {
  test("het model heeft 11 nodetypes, en de lijsten komen overeen", () => {
    expect(MODEL_TYPES).toHaveLength(11);
    expect([...MODEL_TYPES].sort()).toEqual(Object.keys(TOEGELATEN_KINDEREN).sort());
  });

  test("elk modeltype heeft een minimale geldige testnode (faalt bij een nieuw type zonder symbool)", () => {
    expect(Object.keys(MINIMAAL).sort()).toEqual([...MODEL_TYPES].sort());
    for (const node of Object.values(MINIMAAL)) expect(NodeSchema.safeParse(node).success).toBe(true);
  });

  describe.each(MODEL_TYPES)("%s", (type) => {
    const node = MINIMAAL[type as NodeType];

    test("tekenSymbool gooit niet en geeft een symbool met maat en svg", () => {
      const symbool = tekenSymbool(node);
      expect(symbool.svg.length).toBeGreaterThan(0);
      expect(symbool.maat.breedte).toBeGreaterThan(0);
      expect(symbool.maat.hoogte).toBeGreaterThan(0);
    });

    test("de invarianten gelden", () => {
      const symbool = tekenSymbool(node);
      const { maat } = symbool;
      expect(maat.breedte).toBeLessThanOrEqual(KOLOM_BREEDTE_MM - 4);
      expect(maat.in).toEqual({ x: maat.breedte / 2, y: maat.hoogte });
      expect(maat.uit).toEqual({ x: maat.breedte / 2, y: 0 });
      expect(buitenVak(symbool)).toEqual([]);
      expect(raakt(symbool, maat.in)).toBe(true);
      expect(raakt(symbool, maat.uit)).toBe(true);
      expect(isGoedgevormd(symbool)).toBe(true);
      expect(nietRechtop(symbool)).toEqual([]);
      expect(symbool.svg).not.toMatch(/NaN|undefined|Infinity/);
    });
  });
});
