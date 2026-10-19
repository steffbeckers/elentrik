// Pure zoom- en pan-wiskunde, zonder DOM; expliciete imports (ruling E1).
// Generiek over de afmeting van de inhoud: mm voor het schema, rasterpixels voor een plan.

/** Het zichtbare deel van de inhoud: linkerbovenhoek (x, y) en afmetingen (b, h) in inhoudseenheden. */
export type Weergave = { x: number; y: number; b: number; h: number };

export type Afmeting = { breedte: number; hoogte: number };

/** Zoom is begrensd tot 25 % – 400 % van de passende weergave; een plan mag verder (`maxPlanZoom`). */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** Op een plan mag je inzoomen tot één rasterpixel zoveel schermpixels beslaat. */
const PLAN_SCHERMPIXELS_PER_RASTERPIXEL = 2;

/**
 * De maximale zoom voor een plan, relatief aan de passende weergave: tot één rasterpixel
 * `PLAN_SCHERMPIXELS_PER_RASTERPIXEL` schermpixels beslaat. Hangt dus af van het raster en het
 * venster, en is nooit kleiner dan `MAX_ZOOM`.
 */
export function maxPlanZoom(passend: Weergave, venster: Afmeting): number {
  return Math.max(MAX_ZOOM, (PLAN_SCHERMPIXELS_PER_RASTERPIXEL * passend.b) / venster.breedte);
}

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

export type Punt = { x: number; y: number };
export type Vingers = { a: Punt; b: Punt };
type Rechthoek = { left: number; top: number; width: number; height: number };

/**
 * Twee-vingerzoom: zoomt met de verhouding van de vingerafstanden (nu / start) en pant met het
 * midden mee, zodat het inhoudspunt dat bij de start onder het midden lag, onder het huidige
 * midden blijft. Punten zijn schermcoördinaten (clientX/clientY); de zoom is relatief aan de
 * passende weergave en blijft binnen `grenzen`. Begrenzen op de inhoud doet de aanroeper.
 */
export function pinch(
  begin: Weergave,
  passend: Weergave,
  start: Vingers,
  nu: Vingers,
  rect: Rechthoek,
  grenzen: { min: number; max: number },
): Weergave {
  const startAfstand = Math.hypot(start.b.x - start.a.x, start.b.y - start.a.y);
  const factor = startAfstand > 0 ? Math.hypot(nu.b.x - nu.a.x, nu.b.y - nu.a.y) / startAfstand : 1;
  const zoom = Math.min(Math.max((passend.b / begin.b) * factor, grenzen.min), grenzen.max);
  const b = passend.b / zoom;
  const h = b * (rect.height / rect.width);
  const anker = schermNaarInhoud((start.a.x + start.b.x) / 2, (start.a.y + start.b.y) / 2, rect, begin);
  const fx = ((nu.a.x + nu.b.x) / 2 - rect.left) / rect.width;
  const fy = ((nu.a.y + nu.b.y) / 2 - rect.top) / rect.height;
  return { x: anker.x - fx * b, y: anker.y - fy * h, b, h };
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

/** De schermpositie van een punt in de inhoud; de inverse van `schermNaarInhoud`. */
export function inhoudNaarScherm(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
  w: Weergave,
): { x: number; y: number } {
  return {
    x: rect.left + ((x - w.x) / w.b) * rect.width,
    y: rect.top + ((y - w.y) / w.h) * rect.height,
  };
}
