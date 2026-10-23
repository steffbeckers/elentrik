import type { Bevinding } from "../types";
import { EN } from "./en";
import { FR } from "./fr";
import { NL } from "./nl";

export type Taal = "nl" | "fr" | "en";
type Catalogus = Readonly<Record<Taal, Readonly<Record<string, string>>>>;

export const BERICHTEN: Catalogus = { nl: NL, fr: FR, en: EN };

const LOCALE: Readonly<Record<Taal, string>> = { nl: "nl-BE", fr: "fr-BE", en: "en-GB" };

/**
 * Vult de `{naam}`-plaatshouders van een bericht in; valt terug op de sleutel als de tekst ontbreekt.
 * Een tekstparameter die in de catalogus als `waarde.<tekst>` staat (een ruimte of toestelsoort),
 * wordt vertaald; elke andere tekst blijft zoals ze is.
 */
export function formatteerBericht(b: Bevinding, taal: Taal, catalogus: Catalogus = BERICHTEN): string {
  const woorden = catalogus[taal];
  const tekst = woorden[b.berichtSleutel];
  if (tekst === undefined) return b.berichtSleutel;
  const getalFormaat = new Intl.NumberFormat(LOCALE[taal]);
  return tekst.replace(/\{(\w+)\}/g, (plaatshouder, naam: string) => {
    const waarde = Object.hasOwn(b.parameters, naam) ? b.parameters[naam] : undefined;
    if (waarde === undefined) return plaatshouder;
    if (typeof waarde === "number") return getalFormaat.format(waarde);
    const vertaling = `waarde.${waarde}`;
    return Object.hasOwn(woorden, vertaling) ? woorden[vertaling]! : waarde;
  });
}
