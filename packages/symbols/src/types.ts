/** Een punt in millimeter. */
export type Punt = { x: number; y: number };

/**
 * Afmetingen van een symbool in mm. Het schema groeit naar boven: `in` is het aansluitpunt onderaan
 * (naar de voeding toe, `y = hoogte`) en `uit` het aansluitpunt bovenaan (naar de volgende node,
 * `y = 0`); beide liggen op `x = breedte / 2`.
 */
export type SymboolMaat = { breedte: number; hoogte: number; in: Punt; uit: Punt };

/** `svg` is de inhoud van een `<g>` in lokale coördinaten, met (0,0) linksboven. */
export type Symbool = { maat: SymboolMaat; svg: string };

/** Lijndikte van alle symboollijnen, in mm. */
export const LIJNDIKTE_MM = 0.35;

/** Standaard tekstgrootte in symbolen, in mm. */
export const TEKSTGROOTTE_MM = 2.5;

/**
 * Breedte van één kolom in het schema, in mm. Staat hier omdat symbols moet garanderen dat
 * `breedte <= KOLOM_BREEDTE_MM - 4`.
 */
export const KOLOM_BREEDTE_MM = 24;
