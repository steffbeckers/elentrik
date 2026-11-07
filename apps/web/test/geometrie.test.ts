import { describe, expect, test } from "vitest";
import { draai, overlapMet, schuif, symboolGrootte } from "../app/situatie/geometrie";

describe("symboolGrootte", () => {
  test("is de lange zijde van het raster gedeeld door 60", () => {
    expect(symboolGrootte({ breedte_px: 8000, hoogte_px: 6000 })).toBeCloseTo(133.3333333, 6);
  });

  test("een staand raster telt ook op de lange zijde", () => {
    expect(symboolGrootte({ breedte_px: 3000, hoogte_px: 6000 })).toBe(100);
  });
});

describe("draai", () => {
  test("kwartslagen behouden een bestaande schuine hoek en normaliseren", () => {
    expect(draai(0, 1, 90)).toBe(90);
    expect(draai(0, -1, 90)).toBe(270);
    expect(draai(315, 1, 90)).toBe(45);
    expect(draai(15, -1, 90)).toBe(285);
  });

  test("draait in stappen van 15 graden", () => {
    expect(draai(0, 1)).toBe(15);
    expect(draai(15, -1)).toBe(0);
    expect(draai(90, 1)).toBe(105);
  });

  test("normaliseert naar [0, 360)", () => {
    expect(draai(345, 1)).toBe(0);
    expect(draai(0, -1)).toBe(345);
    expect(draai(350, 1)).toBe(5);
  });
});

describe("schuif", () => {
  const raster = { breedte_px: 8000, hoogte_px: 6000 };

  test("telt dx en dy erbij op", () => {
    expect(schuif({ x: 100, y: 200 }, 10, -1, raster)).toEqual({ x: 110, y: 199 });
  });

  test("klemt op de rand van het raster", () => {
    expect(schuif({ x: 5, y: 5 }, -10, -10, raster)).toEqual({ x: 0, y: 0 });
    expect(schuif({ x: 7995, y: 5995 }, 10, 10, raster)).toEqual({ x: 8000, y: 6000 });
  });
});

describe("overlapMet", () => {
  const plaatsingen = [
    { nodeId: "b1", x: 100, y: 100 },
    { nodeId: "b2", x: 300, y: 100 },
  ];
  test("een punt binnen de symboolgrootte van een bestaande plaatsing overlapt", () => {
    expect(overlapMet(plaatsingen, "nieuw", { x: 120, y: 110 }, 40)?.nodeId).toBe("b1");
    expect(overlapMet(plaatsingen, "nieuw", { x: 300, y: 139 }, 40)?.nodeId).toBe("b2");
  });
  test("op of buiten de symboolgrootte overlapt niets", () => {
    expect(overlapMet(plaatsingen, "nieuw", { x: 140, y: 100 }, 40)).toBeUndefined();
    expect(overlapMet(plaatsingen, "nieuw", { x: 200, y: 200 }, 40)).toBeUndefined();
  });
  test("het punt zelf telt niet (verschuiven op zijn eigen plek)", () => {
    expect(overlapMet(plaatsingen, "b1", { x: 105, y: 100 }, 40)).toBeUndefined();
  });
  test("de dichtstbijzijnde plaatsing wint", () => {
    const dicht = [...plaatsingen, { nodeId: "b3", x: 112, y: 100 }];
    expect(overlapMet(dicht, "nieuw", { x: 115, y: 100 }, 40)?.nodeId).toBe("b3");
  });
});
