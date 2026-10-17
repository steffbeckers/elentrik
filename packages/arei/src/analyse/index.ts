import type { InstallatieDocument } from "@elentrik/model";
import { leidAnalyseAf } from "./kringen";
import type { Analyse } from "./types";

export { kringLetter } from "./kringen";
export type { Analyse, Keten, Kring } from "./types";

/** Pure analyse van een document in één doorgang (spec §5.1). */
export function analyseer(doc: InstallatieDocument): Analyse {
  return leidAnalyseAf(doc);
}
