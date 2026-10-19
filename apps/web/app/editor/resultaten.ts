// Expliciete imports, geen Nuxt-auto-imports (ruling E1).
import type { InstallatieDocument, OperatieResultaat } from "@elentrik/model";

/** Voegt operaties die na elkaar op hetzelfde document liepen samen tot één resultaat. */
export function samengevoegd(doc: InstallatieDocument, resultaten: OperatieResultaat[]): OperatieResultaat {
  return {
    doc: resultaten.at(-1)?.doc ?? doc,
    patches: resultaten.flatMap((r) => r.patches),
    inversePatches: resultaten.toReversed().flatMap((r) => r.inversePatches),
  };
}
