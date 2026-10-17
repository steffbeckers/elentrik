/** Diepe kopie via JSON (structuredClone is niet beschikbaar met lib ES2023 zonder DOM/Node-types). */
export function kloon<T>(waarde: T): T {
  return JSON.parse(JSON.stringify(waarde)) as T;
}
