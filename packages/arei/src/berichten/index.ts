import type { Bevinding } from "../types";
import { FR } from "./fr";
import { NL } from "./nl";

export type Taal = "nl" | "fr";
type Catalogus = Readonly<Record<Taal, Readonly<Record<string, string>>>>;

export const BERICHTEN: Catalogus = { nl: NL, fr: FR };

const LOCALE: Readonly<Record<Taal, string>> = { nl: "nl-BE", fr: "fr-BE" };

/** Vult de `{naam}`-plaatshouders van een bericht in; valt terug op de sleutel als de tekst ontbreekt. */
export function formatteerBericht(b: Bevinding, taal: Taal, catalogus: Catalogus = BERICHTEN): string {
  const tekst = catalogus[taal][b.berichtSleutel];
  if (tekst === undefined) return b.berichtSleutel;
  const getalFormaat = new Intl.NumberFormat(LOCALE[taal]);
  return tekst.replace(/\{(\w+)\}/g, (plaatshouder, naam: string) => {
    const waarde = Object.hasOwn(b.parameters, naam) ? b.parameters[naam] : undefined;
    if (waarde === undefined) return plaatshouder;
    return typeof waarde === "number" ? getalFormaat.format(waarde) : waarde;
  });
}
