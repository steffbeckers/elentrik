import { expect } from "vitest";

/** Diepe kopie via JSON (structuredClone is niet beschikbaar met lib ES2023 zonder DOM/Node-types). */
export function kloon<T>(waarde: T): T {
  return JSON.parse(JSON.stringify(waarde)) as T;
}

type Lijn = { soort: "lijn"; x1: number; y1: number; x2: number; y2: number; rol: string };

/** Verwacht dat `lijn` dezelfde rol heeft als `verwacht` en dat de coordinaten tot op rekenruis overeenkomen. */
export function lijnBenadert(lijn: Lijn | undefined, verwacht: Lijn): void {
  expect(lijn).toBeDefined();
  expect(lijn!.soort).toBe("lijn");
  expect(lijn!.rol).toBe(verwacht.rol);
  expect(lijn!.x1).toBeCloseTo(verwacht.x1, 9);
  expect(lijn!.y1).toBeCloseTo(verwacht.y1, 9);
  expect(lijn!.x2).toBeCloseTo(verwacht.x2, 9);
  expect(lijn!.y2).toBeCloseTo(verwacht.y2, 9);
}
