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

/**
 * Paginatitel uit de bestandsnaam (zonder extensie), met `p<n>` voor een PDF-pagina. Zonder
 * bruikbare naam wordt het `standaardTitel`: de vertaalde tekst die de aanroeper meegeeft.
 */
export function paginaTitel(
  bestandsnaam: string,
  pdfPagina: number | undefined,
  standaardTitel: string,
): string {
  const naam = bestandsnaam.replace(/\.[^.]*$/, "").trim();
  if (naam === "") return standaardTitel;
  return pdfPagina === undefined ? naam : `${naam} p${pdfPagina}`;
}

type Maat = { b: number; h: number };

/**
 * Moet een afbeelding via een canvas opnieuw worden gecodeerd? Ja als de lange zijde boven
 * `maxPx` ligt, of als de EXIF-oriëntatie uit de originele bytes niet 1 is: de server leest de
 * ruwe kop, dus de draaiing of spiegeling moet uit het bestand zijn, ook als de maat gelijk blijft.
 */
export function moetHercoderen(
  maat: Maat,
  orientatie: number,
  maxPx: number,
): boolean {
  return Math.max(maat.b, maat.h) > maxPx || orientatie !== 1;
}
