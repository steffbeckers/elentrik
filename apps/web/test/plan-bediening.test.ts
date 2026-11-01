import { describe, expect, test } from "vitest";
import { leesPlanGetal, planCursorToets } from "../app/situatie/bediening";

describe("planopmaak invoer", () => {
  test.each(["", " ", "NaN", "Infinity", "12abc"])("bewaart geen ongeldige invoer %j", waarde => {
    expect(leesPlanGetal(waarde, "offset")).toBeNull();
  });
  test.each(["24", "401", "-10"])("percentage %s valt buiten het bereik", waarde => {
    expect(leesPlanGetal(waarde, "percentage")).toBeNull();
  });
  test("bereikgrenzen en willekeurige geldige percentages worden geaccepteerd", () => {
    expect(leesPlanGetal("25", "percentage")).toBe(25);
    expect(leesPlanGetal("400", "percentage")).toBe(400);
    expect(leesPlanGetal("152.5", "percentage")).toBe(152.5);
  });
  test("een negatieve fractionele offset en nul zijn geldig", () => {
    expect(leesPlanGetal("-15.5", "offset")).toBe(-15.5);
    expect(leesPlanGetal("0", "offset")).toBe(0);
  });
});

describe("plaatscursor met toetsenbord", () => {
  const toets = (key: string, rest = {}) => planCursorToets({ key, shiftKey: false, ctrlKey: false, metaKey: false, alleenLezen: false, ...rest });
  test("pijlen bewegen alleen de lokale cursor, Shift verfijnt de stap", () => {
    expect(toets("ArrowRight")).toEqual({ soort: "schuif", dx: 10, dy: 0 });
    expect(toets("ArrowUp", { shiftKey: true })).toEqual({ soort: "schuif", dx: 0, dy: -1 });
  });
  test("Enter bevestigt en Escape annuleert", () => {
    expect(toets("Enter")).toEqual({ soort: "bevestig" });
    expect(toets("Escape")).toEqual({ soort: "annuleer" });
  });
  test("readonly blokkeert plaatsen en schuiven, maar niet annuleren", () => {
    expect(toets("Enter", { alleenLezen: true })).toBeNull();
    expect(toets("ArrowRight", { alleenLezen: true })).toBeNull();
    expect(toets("Escape", { alleenLezen: true })).toEqual({ soort: "annuleer" });
  });
  test("browsermodifiers en overige sneltoetsen worden niet onderschept", () => {
    expect(toets("Enter", { ctrlKey: true })).toBeNull();
    expect(toets("ArrowLeft", { metaKey: true })).toBeNull();
    expect(toets("Tab")).toBeNull();
    expect(toets("r")).toBeNull();
  });
});
