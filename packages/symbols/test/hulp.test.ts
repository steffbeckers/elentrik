import { describe, expect, test } from "vitest";
import type { Symbool } from "../src/index";
import { buitenVak } from "./hulp";

function symbool(svg: string, breedte = 10, hoogte = 10): Symbool {
  return { maat: { breedte, hoogte, in: { x: breedte / 2, y: 0 }, uit: { x: breedte / 2, y: hoogte } }, svg };
}

describe("buitenVak", () => {
  test("accepteert meetkunde die de rand raakt", () => {
    const svg =
      '<circle cx="2" cy="2" r="2"/><rect x="0" y="0" width="10" height="10"/>' +
      '<line x1="0" y1="0" x2="10" y2="10"/><text x="10" y="10">a</text><path d="M0 0 L10 0 H10 V10 Z"/>';
    expect(buitenVak(symbool(svg))).toEqual([]);
  });

  test.each([
    ["rect die rechts uitsteekt", '<rect x="5" y="0" width="5.01" height="1"/>'],
    ["rect met negatieve y", '<rect x="0" y="-0.1" width="1" height="1"/>'],
    ["cirkel die links uitsteekt", '<circle cx="1.9" cy="5" r="2"/>'],
    ["cirkel die onder uitsteekt", '<circle cx="5" cy="8.1" r="2"/>'],
    ["lijn met eindpunt buiten", '<line x1="0" y1="0" x2="10.01" y2="5"/>'],
    ["tekst buiten", '<text x="5" y="11">a</text>'],
    ["pad met eindpunt buiten", '<path d="M0 0 L11 0"/>'],
    ["pad met relatieve opdracht", '<path d="M0 0 l1 1"/>'],
    ["niet-gecontroleerd element", '<polygon points="0,0 1,1"/>'],
    ["NaN", '<line x1="NaN" y1="0" x2="1" y2="1"/>'],
  ])("meldt: %s", (_naam, svg) => {
    expect(buitenVak(symbool(svg)).length).toBeGreaterThan(0);
  });
});
