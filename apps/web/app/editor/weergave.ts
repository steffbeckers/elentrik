// Pure zoom- en pan-wiskunde, zonder DOM; expliciete imports (ruling E1).
// Generiek over de afmeting van de inhoud: mm voor het schema, rasterpixels voor een plan.

/** Het zichtbare deel van de inhoud: linkerbovenhoek (x, y) en afmetingen (b, h) in inhoudseenheden. */
export type Weergave = { x: number; y: number; b: number; h: number };

export type Afmeting = { breedte: number; hoogte: number };

/** Zoom is begrensd tot 25 % – 400 % van de passende weergave. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** Zoomfactor per wielpuls: `exp(-delta * WIEL_GEVOELIGHEID)`. */
const WIEL_GEVOELIGHEID = 0.0015;

/** De weergave waarop de hele inhoud (plus marge) in het venster past, gecentreerd. Null zolang het venster geen afmeting heeft. */
export function passendeWeergave(inhoud: Afmeting, venster: Afmeting, marge: number): Weergave | null {
  if (venster.breedte === 0 || venster.hoogte === 0) return null;
  const breedte = inhoud.breedte + 2 * marge;
  const hoogte = inhoud.hoogte + 2 * marge;
  const schaal = Math.min(venster.breedte / breedte, venster.hoogte / hoogte);
  const b = venster.breedte / schaal;
  const h = venster.hoogte / schaal;
  return { x: (inhoud.breedte - b) / 2, y: (inhoud.hoogte - h) / 2, b, h };
}

/** Houdt het midden van de weergave binnen de inhoud, zodat die niet uit beeld kan raken. */
export function begrens(w: Weergave, inhoud: Afmeting): Weergave {
  const midX = Math.min(Math.max(w.x + w.b / 2, 0), inhoud.breedte);
  const midY = Math.min(Math.max(w.y + w.h / 2, 0), inhoud.hoogte);
  return { ...w, x: midX - w.b / 2, y: midY - w.h / 2 };
}

/**
 * Zoomt met `factor` ten opzichte van de huidige zoom; het punt onder `anker` (fracties van het venster,
 * 0..1) blijft op dezelfde plaats. De zoom is relatief aan de passende weergave en blijft binnen `grenzen`.
 * Begrenzen op de inhoud doet de aanroeper met `begrens`.
 */
export function zoomRond(
  huidig: Weergave,
  passend: Weergave,
  anker: { fx: number; fy: number },
  factor: number,
  venster: Afmeting,
  grenzen: { min: number; max: number },
): Weergave {
  const zoom = Math.min(Math.max((passend.b / huidig.b) * factor, grenzen.min), grenzen.max);
  const b = passend.b / zoom;
  const h = b * (venster.hoogte / venster.breedte);
  const ankerX = huidig.x + anker.fx * huidig.b;
  const ankerY = huidig.y + anker.fy * huidig.h;
  return { x: ankerX - anker.fx * b, y: ankerY - anker.fy * h, b, h };
}

/** Verschuift de weergave met een sleep van `dx_px` en `dy_px` schermpixels; de inhoud volgt de muis. Begrenzen doet de aanroeper. */
export function pan(begin: Weergave, dx_px: number, dy_px: number, venster: Afmeting): Weergave {
  return {
    ...begin,
    x: begin.x - (dx_px / venster.breedte) * begin.b,
    y: begin.y - (dy_px / venster.hoogte) * begin.h,
  };
}

/**
 * De zoomfactor van één wielpuls. Wiel naar boven (negatieve deltaY) zoomt in.
 * deltaMode 1 = regels, 2 = pagina's; zonder omrekening zoomt een muis met regelstappen nauwelijks.
 */
export function wielFactor(deltaY: number, deltaMode: number, schermHoogte: number): number {
  const delta = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? schermHoogte : 1);
  return Math.exp(-delta * WIEL_GEVOELIGHEID);
}

/** Het punt in de inhoud onder een schermpositie; de inverse van de projectie van de weergave op het venster. */
export function schermNaarInhoud(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  w: Weergave,
): { x: number; y: number } {
  return {
    x: w.x + ((clientX - rect.left) / rect.width) * w.b,
    y: w.y + ((clientY - rect.top) / rect.height) * w.h,
  };
}
