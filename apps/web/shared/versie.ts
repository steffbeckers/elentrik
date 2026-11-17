// De versie van de app, gedeeld door de server en de client. Beide komen bij het opstarten uit de omgeving;
// het image krijgt ze als build-arg van de image-workflow:
// - ELENTRIK_VERSIE: de semver (shared/semver.ts), bv. `1.1.0` op productie en `1.1.0-staging` op staging;
// - ELENTRIK_REVISIE: de volledige git-sha, waarvan de app de korte (7 tekens) toont.
// Lokaal vult nuxt.config.ts ze uit git (`1.1.0-dev`). Ontbreekt er een, dan is die `null`.
// Expliciet geïmporteerd (ruling E1).
import { isSemver } from "./semver";

export interface AppVersie {
  versie: string | null;
  revisie: string | null;
}

const SHA = /^[0-9a-f]{7,64}$/i;

/** De semver uit ELENTRIK_VERSIE, of `null` als die leeg is of geen semver. */
export function leesVersie(env: Record<string, string | undefined>): string | null {
  const versie = env.ELENTRIK_VERSIE?.trim();
  return isSemver(versie) ? versie : null;
}

/** De korte sha uit ELENTRIK_REVISIE, of `null` als die leeg is of geen sha. */
export function leesRevisie(env: Record<string, string | undefined>): string | null {
  const revisie = env.ELENTRIK_REVISIE?.trim();
  return revisie && SHA.test(revisie) ? revisie.slice(0, 7).toLowerCase() : null;
}

export function leesAppVersie(env: Record<string, string | undefined>): AppVersie {
  return { versie: leesVersie(env), revisie: leesRevisie(env) };
}

/** De tekst na "Versie": `1.1.0 abc1234`, of wat ervan bekend is; leeg als niets bekend is. */
export function versieTekst({ versie, revisie }: AppVersie): string {
  return [versie, revisie].filter(Boolean).join(" ");
}
