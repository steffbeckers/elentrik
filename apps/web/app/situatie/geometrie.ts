// Pure plangeometrie, zonder DOM; expliciete imports (ruling E1).

/** Een symbool is de lange zijde van het raster gedeeld door dit getal. */
const SYMBOOL_DELER = 60;
/** Een draaistap in graden. */
const DRAAISTAP = 15;

type Raster = { breedte_px: number; hoogte_px: number };

/** Symboolgrootte in rasterpixels: de lange zijde van het raster / 60. */
export function symboolGrootte(achtergrond: Raster): number {
  return Math.max(achtergrond.breedte_px, achtergrond.hoogte_px) / SYMBOOL_DELER;
}

/** Draait één stap van 15 graden; het resultaat ligt in [0, 360). */
export function draai(rotatie: number, richting: 1 | -1): number {
  return (((rotatie + richting * DRAAISTAP) % 360) + 360) % 360;
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
