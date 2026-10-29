// Gedeelde foutenhulp voor de servercode: een h3-fout met altijd een code uit FOUTCODES, en de ene
// 404 voor "bestaat niet of is niet van jou".
//
// Isolatie: een onbekend id en het id van een object van een andere organisatie geven exact
// dezelfde fout (status, statusMessage en code), voor elk soort object (project, bestand, export,
// lid, uitnodiging...). Wie een nieuw soort object toevoegt, gebruikt `nietGevondenFout()` en geen
// eigen code of boodschap, anders lekt het verschil het bestaan van andermans gegevens.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { createError, type H3Error } from "h3";
import type { Foutcode } from "../shared/foutcodes";

/** Een h3-fout met een boodschap voor logs en ontwikkelaars en een code die de client vertaalt. */
export function maakFout(statusCode: number, statusMessage: string, code: Foutcode): H3Error {
  return createError({ statusCode, statusMessage, data: { code } });
}

/** De 404 voor een onbekend object en voor een object van een andere organisatie: identiek. */
export function nietGevondenFout(): H3Error {
  return maakFout(404, "Niet gevonden", "NIET_GEVONDEN");
}
