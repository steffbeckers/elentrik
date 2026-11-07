import type { SituatiePagina } from "@elentrik/model";
import { getal } from "@elentrik/symbols";

/** Boven het originele raster en onder alle modelpunten; dezelfde laag op scherm en papier. */
export function situatieAfdekkingenSvg(afdekkingen: SituatiePagina["afdekkingen"]): string {
  return (afdekkingen ?? []).map(a => `<rect x="${getal(a.x)}" y="${getal(a.y)}" width="${getal(a.breedte)}" height="${getal(a.hoogte)}" fill="white"/>`).join("");
}
