import { DocumentFout } from "../src/index";

/** Voert `fn` uit en geeft de gegooide DocumentFout terug. Faalt als `fn` niet gooit. */
export function vangFout(fn: () => unknown): DocumentFout {
  try {
    fn();
  } catch (e) {
    if (e instanceof DocumentFout) return e;
    throw e;
  }
  throw new Error("Verwacht een DocumentFout, maar er werd niets gegooid");
}

/** Diepe kopie via JSON (structuredClone is niet beschikbaar met lib ES2023 zonder DOM/Node-types). */
export function kloon<T>(waarde: T): T {
  return JSON.parse(JSON.stringify(waarde)) as T;
}
