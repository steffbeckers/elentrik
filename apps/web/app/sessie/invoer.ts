// Controles op de invoer van de inlog-, registratie- en organisatieformulieren, voor de
// meldingen in de client. De server controleert alles zelf opnieuw.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

export const MIN_WACHTWOORD = 10;
export const MAX_WACHTWOORD = 128;
export const MAX_BEDRIJFSNAAM = 80;
export const MAX_NAAM = 100;

/** Een redelijk e-mailadres: iets, één @, een domein met een punt, geen spaties. */
export function isEmail(waarde: string): boolean {
  const getrimd = waarde.trim();
  return getrimd.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(getrimd);
}

export type WachtwoordFout = "wachtwoordTeKort" | "wachtwoordTeLang";

export function wachtwoordFout(wachtwoord: string): WachtwoordFout | null {
  if (wachtwoord.length < MIN_WACHTWOORD) return "wachtwoordTeKort";
  if (wachtwoord.length > MAX_WACHTWOORD) return "wachtwoordTeLang";
  return null;
}

/** Een bedrijfsnaam telt 1 tot 80 tekens na trimmen, zoals op de server. */
export function isBedrijfsnaam(naam: string): boolean {
  const getrimd = naam.trim();
  return getrimd.length >= 1 && getrimd.length <= MAX_BEDRIJFSNAAM;
}

export function isNaam(naam: string): boolean {
  const getrimd = naam.trim();
  return getrimd.length >= 1 && getrimd.length <= MAX_NAAM;
}
