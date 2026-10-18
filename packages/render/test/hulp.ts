/** Node-id's zijn willekeurig; vervang ze door een volgnummer zodat een snapshot stabiel is. */
export function nummerNodeIds(svg: string): string {
  const nummers = new Map<string, number>();
  return svg.replace(/data-node-id="([^"]*)"/g, (_m, id: string) => {
    if (!nummers.has(id)) nummers.set(id, nummers.size + 1);
    return `data-node-id="n${nummers.get(id)}"`;
  });
}

/** Diepe kopie via JSON (structuredClone is niet getypt met lib ES2023). */
export function kloon<T>(waarde: T): T {
  return JSON.parse(JSON.stringify(waarde)) as T;
}
