// Pure rasterberekeningen, zonder DOM of pdf.js; expliciete imports (ruling E1).
import { MAX_RASTER_PX, RASTER_DPI } from "../../shared/bestandsinhoud";

/** pdf.js-schaal voor een pagina in punten (1/72 inch): 300 dpi, begrensd op de maximale lange zijde. */
export function rasterSchaal(breedte_pt: number, hoogte_pt: number): number {
  const schaal = RASTER_DPI / 72;
  const lang = Math.max(breedte_pt, hoogte_pt) * schaal;
  return lang > MAX_RASTER_PX ? schaal * (MAX_RASTER_PX / lang) : schaal;
}

/** Brengt een afbeeldingsmaat terug tot een lange zijde van hoogstens `MAX_RASTER_PX`, proportioneel. */
export function verkleinMaat(
  breedte: number,
  hoogte: number,
): { breedte: number; hoogte: number } {
  const lang = Math.max(breedte, hoogte);
  if (lang <= MAX_RASTER_PX) return { breedte, hoogte };
  const factor = MAX_RASTER_PX / lang;
  return breedte >= hoogte
    ? { breedte: MAX_RASTER_PX, hoogte: Math.floor(hoogte * factor) }
    : { breedte: Math.floor(breedte * factor), hoogte: MAX_RASTER_PX };
}

/** Paginatitel uit de bestandsnaam (zonder extensie), met `p<n>` voor een PDF-pagina. */
export function paginaTitel(
  bestandsnaam: string,
  pdfPagina: number | undefined,
  aantalPaginas: number,
): string {
  const naam = bestandsnaam.replace(/\.[^.]*$/, "").trim();
  if (naam === "") return `Pagina ${aantalPaginas + 1}`;
  return pdfPagina === undefined ? naam : `${naam} p${pdfPagina}`;
}
