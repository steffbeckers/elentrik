// De volgende versie van de app, afgeleid uit de git-geschiedenis (Conventional Commits). Geen versiecommit:
// de image-workflow zet bij elke productiedeploy een tag `vX.Y.Z`, en de volgende versie volgt uit de
// commits sinds de hoogste tag:
// - `type!:` of `BREAKING CHANGE:` in de tekst → major;
// - `feat:` → minor;
// - elke andere commit → patch.
// Zonder tag is het de eerste release, 1.0.0. Zonder nieuwe commits sinds de tag blijft de versie gelijk.
//
// De tag staat op de merge-commit op `main`; `staging` en `develop` hebben die niet in hun geschiedenis.
// Daarom de hoogste tag en `git log <tag>..HEAD` (wat HEAD heeft en de tag niet), geen `git describe`.
//
// Geen imports en alleen wisbare TypeScript: `node scripts/versie.ts` (de workflow) en nuxt.config.ts
// (lokaal) gebruiken allebei dit bestand.

export type Semver = readonly [major: number, minor: number, patch: number];

export const EERSTE_VERSIE = "1.0.0";

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i;
const BREEKT = /^\w+(?:\([^)]*\))?!:|^BREAKING[ -]CHANGE:/m;
const FEAT = /^feat(?:\([^)]*\))?:/;

/** `true` voor een geldige semver zoals `1.2.3`, `1.2.3-staging` of `1.2.3-dev+abc`. */
export function isSemver(waarde: string | null | undefined): waarde is string {
  return typeof waarde === "string" && SEMVER.test(waarde);
}

export function leesTag(tag: string): Semver | null {
  const m = TAG.exec(tag.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function vergelijk(a: Semver, b: Semver): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** De hoogste tag `vX.Y.Z` uit een lijst; andere tags tellen niet. */
export function hoogsteTag(tags: readonly string[]): string | null {
  let beste: { tag: string; v: Semver } | null = null;
  for (const tag of tags) {
    const v = leesTag(tag);
    if (v && (!beste || vergelijk(v, beste.v) > 0)) beste = { tag: tag.trim(), v };
  }
  return beste?.tag ?? null;
}

/** De volgende versie na `vorigeTag`, gegeven de volledige berichten van de commits sinds die tag. */
export function volgendeVersie(vorigeTag: string | null, berichten: readonly string[]): string {
  const vorige = vorigeTag ? leesTag(vorigeTag) : null;
  if (!vorige) return EERSTE_VERSIE;
  const [major, minor, patch] = vorige;
  if (berichten.length === 0) return `${major}.${minor}.${patch}`;
  if (berichten.some((b) => BREEKT.test(b))) return `${major + 1}.0.0`;
  if (berichten.some((b) => FEAT.test(b.trimStart()))) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Scheidt de berichten in de uitvoer van `git log --format=%B%x00`. */
export const SCHEIDING = "\u0000";

/**
 * Leest de tags en de commits sinds de hoogste tag via `git` (de functie `git` voert het uit en geeft
 * stdout terug) en geeft de tag en de volgende versie. Merge-commits tellen niet: ze dragen geen type.
 */
export function bepaalVersie(git: (args: string[]) => string): { vorigeTag: string | null; versie: string } {
  const vorigeTag = hoogsteTag(git(["tag", "--list", "v*"]).split(/\r?\n/));
  const berichten = vorigeTag
    ? git(["log", "--no-merges", "--format=%B%x00", `${vorigeTag}..HEAD`])
        .split(SCHEIDING)
        .map((b) => b.trim())
        .filter(Boolean)
    : [];
  return { vorigeTag, versie: volgendeVersie(vorigeTag, berichten) };
}
