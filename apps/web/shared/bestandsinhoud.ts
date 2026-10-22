// Bestandsinhoud herkennen op de bytes zelf, nooit op naam of header; gedeeld door de server
// (uploadroute) en de client (controle vóór het versturen). Puur en zonder I/O; geen auto-imports (ruling E1).

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/** Maximale grootte van het logo van de installateur. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const RASTER_DPI = 300;
/** Maximale lange zijde van een raster, in pixels. */
export const MAX_RASTER_PX = 8000;

export type BestandSoort = "pdf" | "png" | "jpeg";

/** Wat de server na een upload teruggeeft; de client importeert dit type hier. */
export type BestandInfo = {
  id: string;
  mime: string;
  grootte: number;
  breedte_px?: number;
  hoogte_px?: number;
};

const PDF_KOP = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG_KOP = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_KOP = [0xff, 0xd8, 0xff];

function begintMet(data: Uint8Array, kop: readonly number[]): boolean {
  return data.length >= kop.length && kop.every((byte, i) => data[i] === byte);
}

/** Het bestandstype volgens de magic bytes, of `null` (ook voor SVG en HTML). */
export function herkenSoort(kop: Uint8Array): BestandSoort | null {
  if (begintMet(kop, PDF_KOP)) return "pdf";
  if (begintMet(kop, PNG_KOP)) return "png";
  if (begintMet(kop, JPEG_KOP)) return "jpeg";
  return null;
}

function u16(data: Uint8Array, plek: number): number {
  return ((data[plek] ?? 0) << 8) | (data[plek + 1] ?? 0);
}

function u32(data: Uint8Array, plek: number): number {
  return ((data[plek] ?? 0) * 0x1000000) + (((data[plek + 1] ?? 0) << 16) | ((data[plek + 2] ?? 0) << 8) | (data[plek + 3] ?? 0));
}

function pngAfmetingen(data: Uint8Array): { breedte: number; hoogte: number } | null {
  // signatuur (8) + chunklengte (4) + "IHDR" (4) + breedte (4) + hoogte (4)
  if (data.length < 24 || !begintMet(data, PNG_KOP)) return null;
  if (u32(data, 8) !== 13) return null;
  if (![0x49, 0x48, 0x44, 0x52].every((byte, i) => data[12 + i] === byte)) return null;
  return { breedte: u32(data, 16), hoogte: u32(data, 20) };
}

function jpegAfmetingen(data: Uint8Array): { breedte: number; hoogte: number } | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let plek = 2;
  while (plek < data.length) {
    if (data[plek] !== 0xff) return null;
    // Vulbytes 0xFF voor de markercode overslaan.
    while (data[plek] === 0xff) plek++;
    const marker = data[plek];
    if (marker === undefined) return null;
    plek++;
    // Markers zonder lengte: TEM, RSTn, SOI, EOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8) || marker === 0xd9) {
      if (marker === 0xd9) return null;
      continue;
    }
    // Aan de scandata begint de beeldinhoud; een SOF komt daarna niet meer.
    if (marker === 0xda) return null;
    if (plek + 2 > data.length) return null;
    const lengte = u16(data, plek);
    if (lengte < 2) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      // lengte (2) + precisie (1) + hoogte (2) + breedte (2)
      if (lengte < 7 || plek + 7 > data.length) return null;
      return { breedte: u16(data, plek + 5), hoogte: u16(data, plek + 3) };
    }
    plek += lengte;
  }
  return null;
}

/** Pixelafmetingen van een PNG of JPEG; `null` als het bestand te kort of ongeldig is. */
export function afmetingen(data: Uint8Array, soort: "png" | "jpeg"): { breedte: number; hoogte: number } | null {
  return soort === "png" ? pngAfmetingen(data) : jpegAfmetingen(data);
}

/** Leest een 16- of 32-bitsgetal in de bytevolgorde van een TIFF-blok; de aanroeper bewaakt de grenzen. */
function tiffU16(data: Uint8Array, plek: number, klein: boolean): number {
  return klein ? ((data[plek + 1] ?? 0) << 8) | (data[plek] ?? 0) : u16(data, plek);
}

function tiffU32(data: Uint8Array, plek: number, klein: boolean): number {
  return klein ? tiffU16(data, plek + 2, true) * 0x10000 + tiffU16(data, plek, true) : u32(data, plek);
}

/** Tag 0x0112 uit IFD0 van een TIFF-blok tussen `begin` en `einde`; 1 bij elke afwijking. */
function tiffOrientatie(data: Uint8Array, begin: number, einde: number): number {
  if (begin + 8 > einde) return 1;
  const ii = data[begin] === 0x49 && data[begin + 1] === 0x49;
  const mm = data[begin] === 0x4d && data[begin + 1] === 0x4d;
  if (!ii && !mm) return 1;
  if (tiffU16(data, begin + 2, ii) !== 42) return 1;
  const offset = tiffU32(data, begin + 4, ii);
  if (offset < 8 || offset > einde - begin - 2) return 1;
  const ifd = begin + offset;
  const aantal = tiffU16(data, ifd, ii);
  for (let i = 0; i < aantal; i++) {
    const veld = ifd + 2 + i * 12;
    // tag (2) + type (2) + aantal (4) + waarde (4)
    if (veld + 12 > einde) return 1;
    if (tiffU16(data, veld, ii) !== 0x0112) continue;
    // Type 3 (SHORT) met één waarde, links uitgelijnd in het waardeveld.
    if (tiffU16(data, veld + 2, ii) !== 3 || tiffU32(data, veld + 4, ii) !== 1) return 1;
    const waarde = tiffU16(data, veld + 8, ii);
    return waarde >= 1 && waarde <= 8 ? waarde : 1;
  }
  return 1;
}

const EXIF_KOP = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

/**
 * De EXIF-oriëntatie (1–8) van een JPEG: tag 0x0112 uit IFD0 van het APP1-segment "Exif".
 * Geeft 1 zonder EXIF, voor een ander bestandstype en voor ongeldige of afgekapte gegevens.
 */
export function exifOrientatie(data: Uint8Array): number {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return 1;
  let plek = 2;
  while (plek < data.length) {
    if (data[plek] !== 0xff) return 1;
    while (data[plek] === 0xff) plek++;
    const marker = data[plek];
    if (marker === undefined) return 1;
    plek++;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    // EOI of het begin van de scandata: geen EXIF-segment meer te verwachten.
    if (marker === 0xd9 || marker === 0xda) return 1;
    if (plek + 2 > data.length) return 1;
    const lengte = u16(data, plek);
    if (lengte < 2) return 1;
    const einde = plek + lengte;
    if (einde > data.length) return 1;
    const inhoud = plek + 2;
    if (marker === 0xe1 && inhoud + EXIF_KOP.length <= einde && EXIF_KOP.every((byte, i) => data[inhoud + i] === byte)) {
      return tiffOrientatie(data, inhoud + EXIF_KOP.length, einde);
    }
    plek = einde;
  }
  return 1;
}

/** Eerste controle van een planbestand op grootte en type; de server herhaalt ze, de client spaart zo een upload uit. */
export function controleerPlanbestand(
  grootte: number,
  kop: Uint8Array,
): { ok: true; soort: BestandSoort } | { ok: false; reden: "te-groot" | "onbekend-type" } {
  if (grootte > MAX_UPLOAD_BYTES) return { ok: false, reden: "te-groot" };
  const soort = herkenSoort(kop);
  return soort ? { ok: true, soort } : { ok: false, reden: "onbekend-type" };
}
