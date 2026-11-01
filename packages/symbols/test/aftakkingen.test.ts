import { expect, test } from "vitest";
import { tekenAftakkingSymbool, tekenSymbool } from "../src/index";
import type { NodeVan } from "@elentrik/model";

const lamp: NodeVan<"lichtpunt"> = { id: "l", parentId: "s", kinderen: [], type: "lichtpunt", aantal: 2, aftakking: true };
const schakelaar: NodeVan<"schakelaar"> = { id: "s", parentId: "leiding", kinderen: ["l"], type: "schakelaar", soort: "wissel", waterdicht: true, aftakking: true };

test("aftakkingssymbolen hebben horizontale aansluitingen en rechte tekst", () => {
  for (const node of [lamp, schakelaar]) {
    const s = tekenAftakkingSymbool(node);
    expect(s.maat.in).toEqual({ x: 0, y: s.maat.hoogte / 2 });
    expect(s.maat.uit).toEqual({ x: s.maat.breedte, y: s.maat.hoogte / 2 });
    expect(s.svg).not.toContain("rotate");
    expect(tekenSymbool(node).maat.in.y).toBe(tekenSymbool(node).maat.hoogte);
  }
  expect(tekenAftakkingSymbool(lamp).svg).toContain("2×");
  expect(tekenAftakkingSymbool(schakelaar).svg).toContain('data-rol="waterdicht"');
});

test.each(["standaard", "led", "tl", "spot", "noodverlichting"] as const)("lampvariant %s houdt geldige afmetingen en eindigt zonder uitgaande leiding", (soort) => {
  const s = tekenAftakkingSymbool({ ...lamp, soort }, true);
  expect(s.maat.uit.x).toBe(s.maat.breedte / 2);
  expect(s.maat.uit.y).toBe(s.maat.in.y);
  expect(s.svg).not.toContain("rotate");
});
