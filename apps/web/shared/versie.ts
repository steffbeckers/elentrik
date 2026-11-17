// De versie van de app, gedeeld door de server en de client:
// - `APP_VERSIE`: de semantische versie uit apps/web/package.json. Verhoog die bij een release.
// - de revisie: de korte git-sha (7 tekens) uit ELENTRIK_REVISIE, die de image-workflow als build-arg
//   meegeeft (de volledige sha). Lokaal vult server/plugins/versie.ts hem uit git; zonder is hij `null`.
// Expliciet geïmporteerd (ruling E1). Een named import uit JSON: alleen `version` komt in de bundel.
import { version } from "../package.json";

export const APP_VERSIE: string = version;

const SHA = /^[0-9a-f]{7,64}$/i;

/** De korte sha uit ELENTRIK_REVISIE, of `null` als die leeg is of geen sha. */
export function leesRevisie(env: Record<string, string | undefined>): string | null {
  const revisie = env.ELENTRIK_REVISIE?.trim();
  return revisie && SHA.test(revisie) ? revisie.slice(0, 7).toLowerCase() : null;
}
