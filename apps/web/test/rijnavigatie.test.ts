import { describe, expect, test } from "vitest";
import { volgendeRij } from "../app/editor/rijnavigatie";

describe("volgendeRij", () => {
  test("pijl omlaag en omhoog gaan één rij verder, zonder rond te lopen", () => {
    expect(volgendeRij("ArrowDown", 0, 5)).toBe(1);
    expect(volgendeRij("ArrowDown", 4, 5)).toBe(4);
    expect(volgendeRij("ArrowUp", 3, 5)).toBe(2);
    expect(volgendeRij("ArrowUp", 0, 5)).toBe(0);
  });

  test("Home en End gaan naar de eerste en de laatste rij", () => {
    expect(volgendeRij("Home", 3, 5)).toBe(0);
    expect(volgendeRij("End", 1, 5)).toBe(4);
  });

  test("een andere toets of een lege tabel geeft null", () => {
    expect(volgendeRij("Enter", 1, 5)).toBeNull();
    expect(volgendeRij("ArrowLeft", 1, 5)).toBeNull();
    expect(volgendeRij("ArrowDown", 0, 0)).toBeNull();
  });
});
