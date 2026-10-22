// Het formulier van de projectgegevens en zijn omzetting van en naar de gegevens voor de store.
// Puur en zonder I/O; expliciete imports (ruling E1).
import type { Adres, InstallatieDocument, Stroomtype } from "@elentrik/model";
import {
  VERPLICHTE_ADRESVELDEN,
  adresFormulierUitAdres,
  adresUitFormulier,
  ontbrekendeAdresvelden,
  volledigAdresUitFormulier,
  type AdresFormulier,
} from "./adres";

export type ProjectFormulier = {
  naam: string;
  klantNaam: string;
  stroomtype: Stroomtype;
  klant: AdresFormulier;
  werf: AdresFormulier;
  ean: string;
  /** `JJJJ-MM-DD`, zoals een datumveld ze geeft. */
  datum: string;
};

export type ProjectFormulierFout = {
  /** Veldnaam voor `UFormField`; adresvelden als `klant.straat` of `werf.straat`. */
  name: string;
  fout: "naamVerplicht" | "adresVerplicht" | "datumVerplicht";
};

/** De gegevens voor `wijzigProjectgegevens`. */
export type ProjectgegevensWijziging = {
  naam: string;
  klantNaam: string;
  stroomtype: Stroomtype;
  klantAdres: Adres | null;
  werfadres: Adres;
  ean: string;
  datum: string;
};

export function formulierUitProject(naam: string, doc: InstallatieDocument): ProjectFormulier {
  return {
    naam,
    klantNaam: doc.meta.klant.naam,
    stroomtype: doc.voeding.stroomtype,
    klant: adresFormulierUitAdres(doc.meta.klant.adres),
    werf: adresFormulierUitAdres(doc.meta.werfadres),
    ean: doc.meta.ean ?? "",
    datum: doc.meta.datum,
  };
}

export function valideerProjectFormulier(f: ProjectFormulier): ProjectFormulierFout[] {
  const fouten: ProjectFormulierFout[] = [];
  if (f.naam.trim() === "") fouten.push({ name: "naam", fout: "naamVerplicht" });
  // Het werfadres is altijd verplicht; het klantadres alleen zodra het deels ingevuld is.
  for (const veld of VERPLICHTE_ADRESVELDEN) {
    if (f.werf[veld].trim() === "") fouten.push({ name: `werf.${veld}`, fout: "adresVerplicht" });
  }
  for (const veld of ontbrekendeAdresvelden(f.klant)) {
    fouten.push({ name: `klant.${veld}`, fout: "adresVerplicht" });
  }
  if (f.datum.trim() === "") fouten.push({ name: "datum", fout: "datumVerplicht" });
  return fouten;
}

/** Verwacht een geldig formulier (zie `valideerProjectFormulier`). Een leeg klantadres wordt `null`. */
export function gegevensUitFormulier(f: ProjectFormulier): ProjectgegevensWijziging {
  return {
    naam: f.naam.trim(),
    klantNaam: f.klantNaam.trim(),
    stroomtype: f.stroomtype,
    klantAdres: adresUitFormulier(f.klant) ?? null,
    werfadres: volledigAdresUitFormulier(f.werf),
    ean: f.ean.trim(),
    datum: f.datum.trim(),
  };
}
