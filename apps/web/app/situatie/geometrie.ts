// Pure plangeometrie, zonder DOM; expliciete imports (ruling E1).

// De symboolgrootte is gedeeld met de pdf-export en staat daarom in render.
export { symboolGrootte } from "@elentrik/render";

type Raster = { breedte_px: number; hoogte_px: number };

/** Draait fijn (15°) of een kwartslag (90°); het resultaat ligt in [0, 360). */
export function draai(rotatie: number, richting: 1 | -1, stap: 15 | 90 = 15): number {
  return (((rotatie + richting * stap) % 360) + 360) % 360;
}

/** Verschuift een positie met `dx` en `dy` en houdt die binnen het raster. */
export function schuif(
  positie: { x: number; y: number },
  dx: number,
  dy: number,
  raster: Raster,
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(positie.x + dx, 0), raster.breedte_px),
    y: Math.min(Math.max(positie.y + dy, 0), raster.hoogte_px),
  };
}
