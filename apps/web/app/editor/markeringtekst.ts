// Puur, met expliciete imports (ruling E1): de tekst van de tooltip bij een markering in het canvas.
import type { Bevinding } from "@elentrik/arei";
import type { NodeId } from "@elentrik/model";
import type { MarkeringSoort } from "./markeringen";

export type MarkeringRegel = { soort: MarkeringSoort; tekst: string };

/** Ergste eerst; wat gemotiveerd afgeweken is, komt achteraan (zelfde volgorde als de legenda). */
const VOLGORDE: Record<MarkeringSoort, number> = { fout: 0, waarschuwing: 1, info: 2, afgeweken: 3 };

/** Meer regels maken de tooltip groter dan het onderdeel waar hij bij hoort; de rest staat in het paneel Bevindingen. */
const MAX_REGELS = 3;

/**
 * De regels van de tooltip bij de markering van `nodeId`: elke bevinding waarin het onderdeel
 * voorkomt (ook als het niet het onderwerp is, zoals bij de markering zelf), ergste eerst, zonder
 * dubbels. `meer` telt wat niet getoond wordt. `formatteer` geeft de tekst in de taal van de interface.
 */
export function markeringRegels(
  bevindingen: readonly Bevinding[],
  nodeId: NodeId,
  formatteer: (bevinding: Bevinding) => string,
  max: number = MAX_REGELS,
): { regels: MarkeringRegel[]; meer: number } {
  const gezien = new Set<string>();
  const alle: MarkeringRegel[] = [];
  for (const bevinding of bevindingen) {
    if (!bevinding.nodeIds.includes(nodeId)) continue;
    const regel: MarkeringRegel = { soort: bevinding.afgeweken ? "afgeweken" : bevinding.ernst, tekst: formatteer(bevinding) };
    const sleutel = `${regel.soort}\u0000${regel.tekst}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    alle.push(regel);
  }
  // Stabiel: binnen dezelfde ernst blijft de volgorde van de bevindingen.
  alle.sort((a, b) => VOLGORDE[a.soort] - VOLGORDE[b.soort]);
  return { regels: alle.slice(0, max), meer: Math.max(0, alle.length - max) };
}
