// De teksten van de interface uit de vertaalbestanden zelf, zodat een e2e-spec zijn verwachtingen
// niet naast `i18n/locales/*.json` dupliceert: een aangepaste tekst breekt de spec dan niet.
import { readFileSync } from "node:fs";
import type { Taal } from "@elentrik/arei";
import { WEB_DIR } from "../omgeving";

const catalogi = new Map<Taal, unknown>();

/** De tekst bij een sleutel zoals `projecten.titel`, in de gevraagde taal. Een ontbrekende sleutel is een fout. */
export function vertaling(taal: Taal, sleutel: string): string {
  let catalogus = catalogi.get(taal);
  if (catalogus === undefined) {
    catalogus = JSON.parse(readFileSync(`${WEB_DIR}i18n/locales/${taal}.json`, "utf8")) as unknown;
    catalogi.set(taal, catalogus);
  }
  let huidig = catalogus;
  for (const deel of sleutel.split(".")) {
    huidig = typeof huidig === "object" && huidig !== null ? (huidig as Record<string, unknown>)[deel] : undefined;
  }
  if (typeof huidig !== "string") throw new Error(`Sleutel ${sleutel} ontbreekt in ${taal}.json`);
  return huidig;
}

/** Een regex die een tekst met `{plaatshouders}` herkent, met om het even welke waarde op die plekken. */
export function sjabloonRegex(sjabloon: string): RegExp {
  const delen = sjabloon.split(/\{\w+\}/).map((deel) => deel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(delen.join(".+?"));
}
