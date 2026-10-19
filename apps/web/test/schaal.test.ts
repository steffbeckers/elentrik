import { describe, expect, test } from "vitest";
import { berekenMmPerPx, formatteerMmPerPx } from "../app/situatie/schaal";

describe("berekenMmPerPx", () => {
  test("deelt de echte afstand in mm door de gemeten afstand in rasterpixels", () => {
    expect(berekenMmPerPx(5000, 400)).toBe(12.5);
  });

  test("weigert een afstand van 0 of minder, of geen getal", () => {
    expect(berekenMmPerPx(0, 400)).toBeUndefined();
    expect(berekenMmPerPx(-10, 400)).toBeUndefined();
    expect(berekenMmPerPx(Number.NaN, 400)).toBeUndefined();
    expect(berekenMmPerPx(Number.POSITIVE_INFINITY, 400)).toBeUndefined();
  });

  test("weigert een gemeten afstand van 0 pixels", () => {
    expect(berekenMmPerPx(1000, 0)).toBeUndefined();
  });
});

describe("formatteerMmPerPx", () => {
  test("toont drie beduidende cijfers met een decimale komma", () => {
    expect(formatteerMmPerPx(12.5)).toBe("12,5");
    expect(formatteerMmPerPx(3.14159)).toBe("3,14");
    expect(formatteerMmPerPx(0.0123456)).toBe("0,0123");
  });

  test("rondt grote waarden af op een geheel getal, niet op tientallen", () => {
    expect(formatteerMmPerPx(1234.5)).toBe("1.235");
    expect(formatteerMmPerPx(20)).toBe("20");
  });
});
