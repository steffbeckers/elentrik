// De omgeving waarin de app draait (plan 10), gedeeld door de server en de client. Eén bron: de
// variabele ELENTRIK_OMGEVING op de server. Leeg of onbekend (lokaal, e2e) betekent: zoals altijd,
// zonder balk, titelvoorvoegsel of noindex. Expliciet geïmporteerd (ruling E1).

export type Omgeving = "productie" | "staging" | null;

/** Leest ELENTRIK_OMGEVING; een andere waarde dan `productie` of `staging` is `null`. */
export function leesOmgeving(env: Record<string, string | undefined>): Omgeving {
  const waarde = env.ELENTRIK_OMGEVING?.trim();
  return waarde === "staging" || waarde === "productie" ? waarde : null;
}

export function isStaging(omgeving: Omgeving): boolean {
  return omgeving === "staging";
}

/** De balk bovenaan de app staat alleen op staging. */
export function toonBalk(omgeving: Omgeving): boolean {
  return isStaging(omgeving);
}

export const TITEL_VOORVOEGSEL = "[Staging]";

/** De paginatitel, op staging met het voorvoegsel "[Staging] ". */
export function titelVoor(titel: string | null | undefined, omgeving: Omgeving): string | null {
  if (!isStaging(omgeving)) return titel ?? null;
  return titel ? `${TITEL_VOORVOEGSEL} ${titel}` : TITEL_VOORVOEGSEL;
}

/** De header op elk antwoord van staging. */
export const NIET_INDEXEREN = "noindex, nofollow";

/** De inhoud van /robots.txt op staging. */
export const ROBOTS_TXT = "User-agent: *\nDisallow: /";
