import { expect, test } from "vitest";
import type { NodeVan } from "@elentrik/model";
import { tekenSymbool } from "../src/index";
import { tekenAftakkingSymbool } from "../src/punten";
import { buitenVak, isGoedgevormd } from "./hulp";
const basis = { id: "bron", parentId: null, kinderen: [] };
const lijnen = (svg: string, rol: string) =>
  [...svg.matchAll(new RegExp(`<line([^>]*data-rol="${rol}"[^>]*)>`, "g"))].map(
    ([, a = ""]) =>
      Object.fromEntries(
        ["x1", "y1", "x2", "y2"].map((k) => [
          k,
          Number(a.match(new RegExp(`${k}="([^"]*)"`))?.[1]),
        ]),
      ),
  );

test("wall light is the ordinary cross plus a separate short wall stroke", () => {
  const node = {
    ...basis,
    type: "lichtpunt",
    aantal: 1,
    soort: "wand",
  } as NodeVan<"lichtpunt">;
  for (const s of [tekenSymbool(node), tekenAftakkingSymbool(node, true)]) {
    const kruis = lijnen(s.svg, "kruis");
    const wall = lijnen(s.svg, "wand");
    expect(kruis).toHaveLength(2);
    expect(wall).toHaveLength(1);
    expect(wall[0]!.x1).toBe(wall[0]!.x2);
    expect(wall[0]!.x1).toBeGreaterThan(
      Math.max(...kruis.flatMap((l) => [l.x1!, l.x2!])),
    );
    expect(Math.abs(wall[0]!.y1! - wall[0]!.y2!)).toBe(5);
    expect(buitenVak(s)).toEqual([]);
    expect(isGoedgevormd(s)).toBe(true);
  }
  expect(tekenSymbool({ ...node, soort: "standaard" }).svg).not.toContain(
    'data-rol="wand"',
  );
});
test("two-pole switch is one lever with two perpendicular pole ticks, distinct from double lighting", () => {
  const node = {
    ...basis,
    type: "schakelaar",
    soort: "tweepolig",
    waterdicht: false,
  } as NodeVan<"schakelaar">;
  for (const s of [tekenSymbool(node), tekenAftakkingSymbool(node, true)]) {
    const levers = lijnen(s.svg, "hendel"),
      ticks = lijnen(s.svg, "pool-markering");
    expect(levers).toHaveLength(1);
    expect(ticks).toHaveLength(2);
    const l = levers[0]!;
    for (const t of ticks)
      expect(
        Math.abs(
          (l.x2! - l.x1!) * (t.x2! - t.x1!) + (l.y2! - l.y1!) * (t.y2! - t.y1!),
        ),
      ).toBeLessThan(0.04);
    expect(buitenVak(s)).toEqual([]);
    expect(isGoedgevormd(s)).toBe(true);
  }
  expect(
    lijnen(tekenSymbool({ ...node, soort: "dubbel" }).svg, "hendel"),
  ).toHaveLength(2);
});
test("source doorbell monitor is a display with four bottom controls rather than the bell semicircle", () => {
  const node = {
    ...basis,
    type: "toestel",
    soort: "deurbelMonitor",
  } as NodeVan<"toestel">;
  for (const s of [tekenSymbool(node), tekenAftakkingSymbool(node, true)]) {
    const controls = [
      ...s.svg.matchAll(/<rect[^>]*y="9"[^>]*width="1.2"[^>]*height="1"/g),
    ];
    expect(controls).toHaveLength(4);
    expect(s.svg).toContain('width="8" height="6"');
    expect(buitenVak(s)).toEqual([]);
    expect(isGoedgevormd(s)).toBe(true);
  }
  expect(tekenSymbool({ ...node, soort: "bel" }).svg).not.toContain(
    'width="8" height="6"',
  );
});
