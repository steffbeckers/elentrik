import { describe, expect, test } from "vitest";
import { draai, schuif, symboolGrootte } from "../app/situatie/geometrie";

describe("symboolGrootte", () => {
  test("is de lange zijde van het raster gedeeld door 60", () => {
    expect(symboolGrootte({ breedte_px: 8000, hoogte_px: 6000 })).toBeCloseTo(133.3333333, 6);
  });

  test("een staand raster telt ook op de lange zijde", () => {
    expect(symboolGrootte({ breedte_px: 3000, hoogte_px: 6000 })).toBe(100);
  });
});

describe("draai", () => {
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
