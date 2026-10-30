import type { Bevinding } from "../types";
import { EN } from "./en";
import { FR } from "./fr";
import { NL } from "./nl";

export type Taal = "nl" | "fr" | "en";
type Catalogus = Readonly<Record<Taal, Readonly<Record<string, string>>>>;

export const BERICHTEN: Catalogus = { nl: NL, fr: FR, en: EN };

/** De locale per taal, voor `Intl` (getallen, bedragen en datums) en de pdf. */
export const LOCALES: Readonly<Record<Taal, string>> = { nl: "nl-BE", fr: "fr-BE", en: "en-GB" };

/**
 * De parameters van een bericht die een enumwaarde van het model bevatten (een ruimte of een
 * toestelsoort) en dus vertaald worden. Alle andere tekstparameters (kringlabels, puntlabels)
 * zijn vrije tekst van de gebruiker en blijven zoals ze zijn.
 * De lijst wordt bewaakt door apps/web/test/arei-vertaalde-parameters.test.ts: een nieuwe parameter in een regel moet daar een soort krijgen.
 */
export const VERTAALDE_PARAMETERS: readonly string[] = ["reden", "toestel"];

/**
 * Vult de `{naam}`-plaatshouders van een bericht in; valt terug op de sleutel als de tekst ontbreekt.
 * Een parameter uit `VERTAALDE_PARAMETERS` die in de catalogus als `waarde.<tekst>` staat (een ruimte of
 * toestelsoort), wordt vertaald; elke andere tekst blijft zoals ze is.
 */
export function formatteerBericht(b: Bevinding, taal: Taal, catalogus: Catalogus = BERICHTEN): string {
  const woorden = catalogus[taal];
  const tekst = woorden[b.berichtSleutel];
  if (tekst === undefined) return b.berichtSleutel;
  const getalFormaat = new Intl.NumberFormat(LOCALES[taal]);
  return tekst.replace(/\{(\w+)\}/g, (plaatshouder, naam: string) => {
    const waarde = Object.hasOwn(b.parameters, naam) ? b.parameters[naam] : undefined;
    if (waarde === undefined) return plaatshouder;
    if (typeof waarde === "number") return getalFormaat.format(waarde);
    if (!VERTAALDE_PARAMETERS.includes(naam)) return waarde;
    const vertaling = `waarde.${waarde}`;
    return Object.hasOwn(woorden, vertaling) ? woorden[vertaling]! : waarde;
  });
}
