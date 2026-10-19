// Puur, met expliciete imports (ruling E1): de ernst-aggregatie voor de markeringen in het canvas.
import type { Bevinding, Ernst } from "@elentrik/arei";
import type { NodeId } from "@elentrik/model";

export type MarkeringSoort = Ernst | "afgeweken";

const ERNST_VOLGORDE: Record<Ernst, number> = { fout: 3, waarschuwing: 2, info: 1 };

/**
 * Per node één markering: de ergste ernst onder de actieve bevindingen. Een node krijgt pas
 * "afgeweken" (grijs) als álle bevindingen waarin hij voorkomt afgeweken zijn. Elke node in
 * `nodeIds` van een bevinding telt mee (spec §4.5), niet alleen het onderwerp.
 */
export function markeringen(bevindingen: readonly Bevinding[]): Map<NodeId, MarkeringSoort> {
  const perNode = new Map<NodeId, MarkeringSoort>();
  for (const bevinding of bevindingen) {
    for (const id of bevinding.nodeIds) {
      const huidig = perNode.get(id);
      if (bevinding.afgeweken) {
        if (huidig === undefined) perNode.set(id, "afgeweken");
      } else if (
        huidig === undefined ||
        huidig === "afgeweken" ||
        ERNST_VOLGORDE[bevinding.ernst] > ERNST_VOLGORDE[huidig]
      ) {
        perNode.set(id, bevinding.ernst);
      }
    }
  }
  return perNode;
}

/** De Tailwind-vulkleur per markering, gedeeld door het eendraadschema en het plan. */
export const MARKERING_KLASSE: Readonly<Record<MarkeringSoort, string>> = {
  fout: "fill-red-600",
  waarschuwing: "fill-amber-500",
  info: "fill-blue-600",
  afgeweken: "fill-neutral-400",
};
