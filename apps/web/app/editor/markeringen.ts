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

/** Alle soorten markeringen, van ernstig naar afgeweken; ook de volgorde van de legenda. */
export const MARKERING_SOORTEN: readonly MarkeringSoort[] = ["fout", "waarschuwing", "info", "afgeweken"];

/** De Tailwind-vulkleur per markering, gedeeld door het eendraadschema en het plan. */
export const MARKERING_KLASSE: Readonly<Record<MarkeringSoort, string>> = {
  fout: "fill-red-600",
  waarschuwing: "fill-amber-500",
  info: "fill-blue-600",
  afgeweken: "fill-neutral-400",
};

const getal = (n: number): string => String(Math.round(n * 1000) / 1000 + 0);

function veelhoek(punten: readonly (readonly [number, number])[]): string {
  return `${punten.map(([x, y], i) => `${i === 0 ? "M" : "L"}${getal(x)} ${getal(y)}`).join(" ")} Z`;
}

/**
 * De vorm en het teken (een witte lijn) van een markering met middelpunt (`cx`, `cy`) en straal `r`.
 * Elke ernst heeft naast de kleur een eigen vorm, zodat ze ook zonder kleur te onderscheiden zijn:
 * fout een achthoek met een kruis, waarschuwing een driehoek met een uitroepteken, info een cirkel
 * met een i, afgeweken een vierkant met een vinkje.
 */
export function markeringVorm(soort: MarkeringSoort, cx: number, cy: number, r: number): { vorm: string; teken: string } {
  const p = (x: number, y: number) => [cx + x * r, cy + y * r] as const;
  const lijn = (...punten: (readonly [number, number])[]) =>
    punten.map(([x, y], i) => `${i === 0 ? "M" : "L"}${getal(cx + x * r)} ${getal(cy + y * r)}`).join(" ");
  switch (soort) {
    case "fout": {
      const hoeken = Array.from({ length: 8 }, (_, i) => {
        const hoek = Math.PI / 8 + (i * Math.PI) / 4;
        return p(1.08 * Math.cos(hoek), 1.08 * Math.sin(hoek));
      });
      return { vorm: veelhoek(hoeken), teken: `${lijn([-0.4, -0.4], [0.4, 0.4])} ${lijn([0.4, -0.4], [-0.4, 0.4])}` };
    }
    case "waarschuwing":
      return {
        vorm: veelhoek([p(0, -1.25), p(1.15, 0.75), p(-1.15, 0.75)]),
        teken: `${lijn([0, -0.45], [0, 0.1])} ${lijn([0, 0.42], [0, 0.43])}`,
      };
    case "info":
      return {
        vorm: `M${getal(cx - r)} ${getal(cy)} A${getal(r)} ${getal(r)} 0 1 0 ${getal(cx + r)} ${getal(cy)} A${getal(r)} ${getal(r)} 0 1 0 ${getal(cx - r)} ${getal(cy)} Z`,
        teken: `${lijn([0, -0.45], [0, -0.44])} ${lijn([0, -0.1], [0, 0.5])}`,
      };
    case "afgeweken":
      return {
        vorm: veelhoek([p(-0.9, -0.9), p(0.9, -0.9), p(0.9, 0.9), p(-0.9, 0.9)]),
        teken: lijn([-0.45, 0], [-0.1, 0.35], [0.45, -0.35]),
      };
  }
}
