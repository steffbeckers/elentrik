import { describe, expect, test } from "vitest";
import type { Symbool } from "../src/index";
import { buitenVak, raakt } from "./hulp";

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

describe("raakt", () => {
  const punt = { x: 5, y: 10 };

  test.each([
    ["eerste eindpunt van een lijn", '<line x1="5" y1="10" x2="5" y2="0"/>'],
    ["tweede eindpunt van een lijn", '<line x1="5" y1="0" x2="5" y2="10"/>'],
    ["eindpunt binnen de tolerantie", '<line x1="5" y1="0" x2="5.0000000001" y2="10"/>'],
    ["bovenrand van een rect", '<rect x="0" y="10" width="10" height="2"/>'],
    ["zijrand van een rect", '<rect x="5" y="8" width="3" height="4"/>'],
    ["onderrand van een rect", '<rect x="0" y="0" width="10" height="10"/>'],
    ["omtrek van een cirkel", '<circle cx="5" cy="8" r="2"/>'],
  ])("geeft true voor %s", (_naam, svg) => {
    expect(raakt(symbool(svg), punt)).toBe(true);
  });

  test.each([
    ["een gat van 2 mm tussen lijn en punt", '<line x1="5" y1="0" x2="5" y2="8"/>'],
    ["een lijn die het punt alleen passeert", '<line x1="5" y1="0" x2="5" y2="12"/>'],
    ["een punt binnen een rect", '<rect x="0" y="5" width="10" height="10"/>'],
    ["een rect naast het punt", '<rect x="6" y="10" width="4" height="2"/>'],
    ["een punt in het midden van een cirkel", '<circle cx="5" cy="10" r="2"/>'],
    ["een cirkel die het punt niet bereikt", '<circle cx="5" cy="7" r="2"/>'],
    ["alleen tekst", '<text x="5" y="10">a</text>'],
    ["een leeg symbool", ""],
  ])("geeft false voor %s", (_naam, svg) => {
    expect(raakt(symbool(svg), punt)).toBe(false);
  });
});
