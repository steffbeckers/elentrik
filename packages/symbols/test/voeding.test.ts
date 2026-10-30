import type { Node, NodeVan } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { KOLOM_BREEDTE_MM, tekenSymbool } from "../src/index";
import { buitenVak, isGoedgevormd, nietRechtop } from "./hulp";

const basis = { id: "n1", parentId: "n0", kinderen: [] as string[] };

const aansluiting: NodeVan<"aansluiting"> = { ...basis, type: "aansluiting" };
const teller: NodeVan<"teller"> = { ...basis, type: "teller" };
const verdeelbord: NodeVan<"verdeelbord"> = { ...basis, type: "verdeelbord" };

const symbolen: ReadonlyArray<[string, Node]> = [
  ["aansluiting", aansluiting],
  ["teller", teller],
  ["verdeelbord", verdeelbord],
];

/** Getal-attribuut van het eerste element dat een bepaalde `data-rol` heeft. */
function attribuutVanRol(svg: string, element: string, rol: string, sleutel: string): number {
  const tekst = svg.match(new RegExp(`<${element} [^>]*data-rol="${rol}"[^>]*>`))?.[0] ?? "";
  return Number(tekst.match(new RegExp(`${sleutel}="([^"]*)"`))?.[1] ?? NaN);
}

describe("symbolen voor voeding en verdeling (AREI tabel 2.23)", () => {
  describe.each(symbolen)("invarianten: %s", (_naam, node) => {
    const symbool = tekenSymbool(node);

    test("is goedgevormd, rechtop, binnen het vak en past in een kolom", () => {
      expect(isGoedgevormd(symbool)).toBe(true);
      expect(nietRechtop(symbool)).toEqual([]);
      expect(buitenVak(symbool)).toEqual([]);
      expect(symbool.maat.breedte).toBeLessThanOrEqual(KOLOM_BREEDTE_MM - 4);
    });
  });

  describe("aansluiting", () => {
    const svg = tekenSymbool(aansluiting).svg;

    test("tekent de sinus als pad en gebruikt geen tekst", () => {
      expect(svg).not.toContain("<text");
      expect(svg).toMatch(/<path d="[^"]*A[^"]*"[^>]*data-rol="sinus"/);
    });

    test("behoudt de cirkel", () => {
      expect(svg).toContain("<circle");
    });
  });

  describe("teller", () => {
    const svg = tekenSymbool(teller).svg;

    test("heeft precies één band, horizontaal, 1,5 mm onder de bovenrand van de rechthoek", () => {
      expect(svg.match(/<line [^>]*data-rol="band"/g)).toHaveLength(1);
      const y1 = attribuutVanRol(svg, "line", "band", "y1");
      const y2 = attribuutVanRol(svg, "line", "band", "y2");
      expect(y1).toBe(y2);
      const bovenrand = Number(svg.match(/<rect [^>]*y="([^"]*)"/)?.[1] ?? NaN);
      expect(y1).toBeCloseTo(bovenrand + 1.5, 0);
    });

    test("toont kWh onder de band", () => {
      expect(svg).toContain(">kWh</text>");
      const bandY = attribuutVanRol(svg, "line", "band", "y1");
      const tekstY = Number(svg.match(/<text x="[^"]*" y="([^"]*)"/)?.[1] ?? NaN);
      expect(tekstY).toBeGreaterThan(bandY);
    });
  });

  describe("verdeelbord", () => {
    test("is een gewone rechthoek zonder binnenlijn", () => {
      const svg = tekenSymbool(verdeelbord).svg;
      expect(svg.match(/<rect /g)).toHaveLength(1);
      expect(svg).not.toContain("<line");
    });
  });
});
