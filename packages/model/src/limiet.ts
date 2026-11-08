import type { InstallatieDocument } from "./schema";

/** Maximaal aantal per soort in de gratis versie. */
export type Limieten = { kringen: number; situatieschemas: number };
export type Telling = Limieten;

/** Telt wat voor de gratis limiet meetelt: kringen (automaten en zekeringen) en situatieschema's. */
export function telVoorLimiet(doc: InstallatieDocument): Telling {
  let kringen = 0;
  for (const node of Object.values(doc.nodes))
    if (node.type === "automaat" || node.type === "zekering") kringen++;
  return { kringen, situatieschemas: doc.situatie.paginas.length };
}

/**
 * Waar als in `na` een soort boven de limiet zit en hoger is dan in `voor`.
 * `voor = null` is een nieuw project: dan telt elke soort boven de limiet.
 */
export function overschrijdtLimiet(
  voor: Telling | null,
  na: Telling,
  limieten: Limieten,
): boolean {
  return (["kringen", "situatieschemas"] as const).some(
    (soort) => na[soort] > limieten[soort] && (voor === null || na[soort] > voor[soort]),
  );
}
