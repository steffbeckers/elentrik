// De foutcodes die de server de gebruiker kan sturen, in `data.code` van een h3-fout of in `code`
// van een fout van Better Auth. De client vertaalt elke code met de sleutel `fouten.<CODE>`
// (plan 8, Task 4); de statusMessage van de server blijft Nederlands en is alleen voor logs en
// ontwikkelaars. De lijst is gesloten: test/foutcodes.test.ts eist dat elke `createError` met een
// statusMessage en een 4xx-status een code uit deze lijst meegeeft, en dat elke code hier ook
// echt gebruikt wordt.
//
// De scan in die test ziet alleen h3-`createError` (en hulpfuncties met een statusCode-parameter);
// de `APIError`-guards in server/auth/index.ts (bv. ALLEEN_EIGENAAR) worden niet gescand.
//
// Expliciete import in de server en client (ruling E1): dit bestand importeert niets.

/**
 * Codes van onze eigen server (`createError` en `APIError`). De bestaande codes
 * (`ABONNEMENT_VEREIST` tot `ONGELDIGE_TAAL`, en de PDF-codes) zijn niet gewijzigd.
 */
export const SERVER_FOUTCODES = [
  // Sessie en toegang
  "NIET_AANGEMELD",
  "ANDERE_GEBRUIKER",
  "ANDERE_ORGANISATIE",
  "ALLEEN_EIGENAAR",
  "NIET_TOEGELATEN",
  "VERZOEK_VAN_ANDERE_SITE",
  // Niet gevonden: ELK object (project, bestand, export, lid, uitnodiging...) dat niet bestaat of
  // van een andere organisatie is, geeft deze ene code en dezelfde statusMessage (server/fouten.ts).
  // Een code per soort object zou het bestaan van andermans gegevens verraden.
  "NIET_GEVONDEN",
  // Invoer
  "ONGELDIGE_INVOER",
  "ONGELDIGE_NAAM",
  "ONGELDIGE_TAAL",
  // Projecten en bestanden
  "IF_MATCH_VEREIST",
  "PROJECT_GEWIJZIGD",
  "ONGELDIG_DOCUMENT",
  "BESTAND_TE_GROOT",
  "BESTANDSTYPE_NIET_TOEGELATEN",
  "RASTER_TE_GROOT",
  // Export (502, de code van `PdfFout`)
  "ONBEREIKBAAR",
  "TIMEOUT",
  "MISLUKT",
  // Abonnement
  "ABONNEMENT_VEREIST",
  "ABONNEMENT_BESTAAT",
  "GEEN_KLANT",
  "ABONNEMENTEN_UIT",
  // Organisatie en uitnodigingen
  "LAATSTE_EIGENAAR",
  "AL_LID",
  "AL_UITGENODIGD",
  "UITNODIGING_VERVALLEN",
  "UITNODIGING_ANDER_ADRES",
  "EMAIL_NIET_BEVESTIGD",
  "ACCOUNT_BESTAAT",
  // Begrenzing: ook de rate limiter van Better Auth (429 zonder code) is voor de client dit
  "TE_VEEL_UITNODIGINGEN",
  "TE_VEEL_POGINGEN",
] as const;

/**
 * De codes van Better Auth 1.7.7 die de aanmeld- en herstelpagina's kunnen bereiken, met hun
 * Engelse naam zoals Better Auth ze stuurt (`error.code` van de client, of `?error=` in de URL
 * van een mail). Elke naam bestaat in `auth.$ERROR_CODES` (de test controleert dat). Een andere
 * code van Better Auth krijgt in de UI de algemene foutmelding.
 */
export const AUTH_FOUTCODES = [
  /** Sign-in met een onbekend adres of een fout wachtwoord (401). */
  "INVALID_EMAIL_OR_PASSWORD",
  /** Sign-in of magic link met een onbevestigd adres (403). */
  "EMAIL_NOT_VERIFIED",
  /** Een ongeldig of al gebruikt token: wachtwoordherstel, bevestigingslink of inloglink. */
  "INVALID_TOKEN",
  /** Een verlopen bevestigingslink (`?error=TOKEN_EXPIRED`). */
  "TOKEN_EXPIRED",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  /** Registreren met een adres dat al bestaat (422; normaal geeft Better Auth dan een neutraal antwoord). */
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  "INVALID_EMAIL",
] as const;

/** Alle codes die de server kan sturen, zonder dubbels. */
export const FOUTCODES = [...SERVER_FOUTCODES, ...AUTH_FOUTCODES] as const;

export type Foutcode = (typeof FOUTCODES)[number];

export function isFoutcode(waarde: unknown): waarde is Foutcode {
  return typeof waarde === "string" && (FOUTCODES as readonly string[]).includes(waarde);
}
