import { installatie } from "@elentrik/arei/testing";
import { tekenSymbool } from "@elentrik/symbols";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, test } from "vitest";
import { situatieLaagSvg, type SituatieItem } from "../src/index";
import { nummerNodeIds } from "./hulp";

const { doc, ids } = installatie()
  .differentieel(300, (d) =>
    d.verdeelbord((b) =>
      b
        .als("bord")
        .kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("cd"))
        .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(1).als("lp")),
    ),
  )
  .bouw();

const item = (naam: string, x: number, y: number, rotatie: number, label: string): SituatieItem => ({
  nodeId: ids[naam]!,
  symbool: tekenSymbool(doc.nodes[ids[naam]!]!),
  x,
  y,
  rotatie,
  label,
});

const drie = [
  item("cd", 100, 200, 0, "A1"),
  item("lp", 350.5, 40.25, 90, "B1"),
  item("bord", 12, 800, 0, "Bord"),
];

const inSvg = (laag: string) => `<svg xmlns="http://www.w3.org/2000/svg">${laag}</svg>`;

describe("situatieLaagSvg", () => {
  test("snapshot voor 3 items", () => {
    expect(nummerNodeIds(situatieLaagSvg(drie, 60))).toMatchSnapshot();
  });

  test("een lege lijst geeft een lege string", () => {
    expect(situatieLaagSvg([], 60)).toBe("");
  });

  test("groepeert per item met data-node-id en translate", () => {
    const svg = situatieLaagSvg(drie, 60);
    expect(svg).toContain(`<g data-node-id="${ids["cd"]}" transform="translate(100 200)">`);
    expect(svg).toContain(`<g data-node-id="${ids["lp"]}" transform="translate(350.5 40.25)">`);
  });

  test("schaalt het symbool zodat de lange zijde grootte_px wordt", () => {
    const s = drie[0]!.symbool.maat;
    const schaal = 60 / Math.max(s.breedte, s.hoogte);
    const svg = situatieLaagSvg([drie[0]!], 60);
    const m = /<g transform="rotate\(([^)]*)\) scale\(([^)]*)\) translate\(([^)]*)\)">/.exec(svg)!;
    expect(Number(m[1])).toBe(0);
    expect(Number(m[2])).toBeCloseTo(schaal, 2);
    const [tx, ty] = m[3]!.split(" ").map(Number);
    expect(tx).toBeCloseTo(-s.breedte / 2, 2);
    expect(ty).toBeCloseTo(-s.hoogte / 2, 2);
  });

  test("het gedraaide item krijgt rotate(90)", () => {
    expect(situatieLaagSvg([drie[1]!], 60)).toContain('<g transform="rotate(90) scale(');
  });

  test("het label staat buiten de gedraaide groep en draait niet mee", () => {
    const svg = situatieLaagSvg([drie[1]!], 60);
    expect(svg).toContain(
      '<text x="36" y="9" font-size="27" text-anchor="start" font-family="sans-serif" fill="currentColor">B1</text></g>',
    );
    const gedraaid = svg.indexOf('<g transform="rotate(');
    const tekst = svg.indexOf("<text");
    const sluit = svg.indexOf("</g>", gedraaid);
    expect(sluit).toBeGreaterThan(gedraaid);
    expect(sluit).toBeLessThan(tekst);
  });

  test("een kwaadaardig label wordt geëscaped en de XML blijft geldig", () => {
    const kwaad = { ...drie[0]!, label: "<img src=x onerror=alert(1)>" };
    const svg = situatieLaagSvg([kwaad, drie[1]!], 60);
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(XMLValidator.validate(inSvg(svg))).toBe(true);
  });

  test("goedgevormde XML voor 3 items", () => {
    expect(XMLValidator.validate(inSvg(situatieLaagSvg(drie, 60)))).toBe(true);
  });
});
