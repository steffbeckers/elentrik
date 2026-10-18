export type Papier = { formaat: "A4" | "A3"; marge_mm: number; cartoucheHoogte_mm: number };

export const STANDAARD_PAPIER_A4: Papier = { formaat: "A4", marge_mm: 10, cartoucheHoogte_mm: 30 };

/** Maat van het papier in mm, liggend. */
export function papierMaat(formaat: Papier["formaat"]): { breedte: number; hoogte: number } {
  return formaat === "A4" ? { breedte: 297, hoogte: 210 } : { breedte: 420, hoogte: 297 };
}

/**
 * Ruimte voor het schema in mm: het papier min de marges rondom en de cartouche. Gooit een
 * RangeError als er in de breedte of de hoogte geen ruimte overblijft.
 */
export function bruikbaar(papier: Papier): { breedte: number; hoogte: number } {
  const maat = papierMaat(papier.formaat);
  const breedte = maat.breedte - 2 * papier.marge_mm;
  const hoogte = maat.hoogte - 2 * papier.marge_mm - papier.cartoucheHoogte_mm;
  if (!(breedte > 0 && hoogte > 0)) {
    throw new RangeError(`Geen bruikbare ruimte op ${papier.formaat}: ${breedte} × ${hoogte} mm`);
  }
  return { breedte, hoogte };
}
