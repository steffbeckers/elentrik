// Het formulier van de projectgegevens en zijn omzetting van en naar de gegevens voor de store.
// Puur en zonder I/O; expliciete imports (ruling E1).
import type { Adres, InstallatieDocument, Stroomtype, Taal } from "@elentrik/model";
import {
  adresFormulierUitAdres,
  adresUitFormulier,
  ontbrekendeAdresvelden,
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
  /** De taal van het dossier (PDF); een document zonder taal toont `nl`. */
  dossierTaal: Taal;
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
  /** Ontbreekt als het formulier geen werfadres heeft: dan blijft het werfadres ongewijzigd. */
  werfadres?: Adres;
  ean: string;
  datum: string;
  dossierTaal: Taal;
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
    dossierTaal: doc.meta.dossierTaal ?? "nl",
  };
}

export function valideerProjectFormulier(f: ProjectFormulier): ProjectFormulierFout[] {
  const fouten: ProjectFormulierFout[] = [];
  if (f.naam.trim() === "") fouten.push({ name: "naam", fout: "naamVerplicht" });
  // Werf- en klantadres zijn optioneel, maar een gedeeltelijk adres vraagt de rest. Bestaande projecten
  // hebben een leeg werfadres: dat mag hernoemen of de klant wijzigen niet blokkeren.
  for (const veld of ontbrekendeAdresvelden(f.werf)) {
    fouten.push({ name: `werf.${veld}`, fout: "adresVerplicht" });
  }
  for (const veld of ontbrekendeAdresvelden(f.klant)) {
    fouten.push({ name: `klant.${veld}`, fout: "adresVerplicht" });
  }
  if (f.datum.trim() === "") fouten.push({ name: "datum", fout: "datumVerplicht" });
  return fouten;
}

/**
 * Verwacht een geldig formulier (zie `valideerProjectFormulier`). Een leeg klantadres wordt `null`;
 * een leeg werfadres gaat niet mee, zodat het werfadres in het document ongewijzigd blijft.
 */
export function gegevensUitFormulier(f: ProjectFormulier): ProjectgegevensWijziging {
  const werfadres = adresUitFormulier(f.werf);
  return {
    naam: f.naam.trim(),
    klantNaam: f.klantNaam.trim(),
    stroomtype: f.stroomtype,
    klantAdres: adresUitFormulier(f.klant) ?? null,
    ...(werfadres !== undefined ? { werfadres } : {}),
    ean: f.ean.trim(),
    datum: f.datum.trim(),
    dossierTaal: f.dossierTaal,
  };
}
