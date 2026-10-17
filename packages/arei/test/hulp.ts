import { expect } from "vitest";
import type { Bevinding, Regel } from "../src/index";

/** Diepe kopie via JSON (structuredClone is niet beschikbaar met lib ES2023 zonder DOM/Node-types). */
export function kloon<T>(waarde: T): T {
  return JSON.parse(JSON.stringify(waarde)) as T;
}

/** Elke bevinding komt van de regel zelf en gebruikt een sleutel die de regel aankondigt. */
export function verwachtBekendeSleutels(regel: Regel, bevindingen: readonly Bevinding[]): void {
  for (const b of bevindingen) {
    expect(b.regelId, `regelId van ${b.berichtSleutel}`).toBe(regel.id);
    expect(regel.berichtSleutels, `sleutel ${b.berichtSleutel} van ${regel.id}`).toContain(b.berichtSleutel);
  }
}
