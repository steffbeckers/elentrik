import { expect, test } from "vitest";
import { focusWeergave } from "../app/editor/weergave";

test("focus centreert de kring met behoud van verhouding en zoomgrenzen", () => {
  const w = focusWeergave({ x: 80, y: 10, breedte: 20, hoogte: 60 }, { breedte: 800, hoogte: 400 }, { x: 0, y: 0, b: 400, h: 200 }, 4);
  expect(w.b / w.h).toBe(2);
  expect(w.x + w.b / 2).toBe(90);
  expect(w.y + w.h / 2).toBe(40);
  expect(w.h).toBeGreaterThanOrEqual(70);
  expect(w.b).toBeGreaterThanOrEqual(100);
});
