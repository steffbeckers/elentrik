// Het adresformulier en zijn omzetting van en naar een `Adres`. Gedeeld door het bedrijfsformulier
// en de projectgegevens. Puur en zonder I/O; expliciete imports (ruling E1).
import type { Adres } from "@elentrik/model";

export const STANDAARD_LAND = "België";

export type AdresFormulier = {
  straat: string;
  nummer: string;
  bus: string;
  postcode: string;
  gemeente: string;
  land: string;
};

export type AdresVeld = keyof AdresFormulier;

export const VERPLICHTE_ADRESVELDEN = ["straat", "nummer", "postcode", "gemeente"] as const;

export function leegAdresFormulier(): AdresFormulier {
  return { straat: "", nummer: "", bus: "", postcode: "", gemeente: "", land: STANDAARD_LAND };
}

export function adresFormulierUitAdres(adres: Adres | undefined): AdresFormulier {
  const leeg = leegAdresFormulier();
  return {
    straat: adres?.straat ?? leeg.straat,
    nummer: adres?.nummer ?? leeg.nummer,
    bus: adres?.bus ?? leeg.bus,
    postcode: adres?.postcode ?? leeg.postcode,
    gemeente: adres?.gemeente ?? leeg.gemeente,
    land: adres?.land ?? leeg.land,
  };
}

/** Het land alleen telt niet: zonder straat, nummer, bus, postcode of gemeente is er geen adres. */
export function heeftAdres(f: AdresFormulier): boolean {
  return [f.straat, f.nummer, f.bus, f.postcode, f.gemeente].some((waarde) => waarde.trim() !== "");
}

/** De verplichte velden die leeg zijn, maar alleen als het adres (deels) ingevuld is. */
export function ontbrekendeAdresvelden(f: AdresFormulier): AdresVeld[] {
  if (!heeftAdres(f)) return [];
  return VERPLICHTE_ADRESVELDEN.filter((veld) => f[veld].trim() === "");
}

/** Het adres uit de velden, ook als die leeg zijn. Getrimd; een lege bus ontbreekt, een leeg land wordt België. */
export function volledigAdresUitFormulier(f: AdresFormulier): Adres {
  const bus = f.bus.trim();
  return {
    straat: f.straat.trim(),
    nummer: f.nummer.trim(),
    ...(bus !== "" ? { bus } : {}),
    postcode: f.postcode.trim(),
    gemeente: f.gemeente.trim(),
    land: f.land.trim() || STANDAARD_LAND,
  };
}

/** Het adres om te bewaren, of `undefined` als het formulier geen adres heeft. */
export function adresUitFormulier(f: AdresFormulier): Adres | undefined {
  return heeftAdres(f) ? volledigAdresUitFormulier(f) : undefined;
}

/** Inhoudelijke gelijkheid; twee ontbrekende adressen zijn gelijk. */
export function zelfdeAdres(a: Adres | undefined, b: Adres | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.straat === b.straat &&
    a.nummer === b.nummer &&
    (a.bus ?? "") === (b.bus ?? "") &&
    a.postcode === b.postcode &&
    a.gemeente === b.gemeente &&
    a.land === b.land
  );
}
