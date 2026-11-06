// Het formulier van de projectgegevens en zijn omzetting van en naar de gegevens voor de store.
// Puur en zonder I/O; expliciete imports (ruling E1).
import type { Adres, InstallatieDocument, Metingen, Stroomtype, Taal } from "@elentrik/model";
import {
  adresFormulierUitAdres,
  adresUitFormulier,
  ontbrekendeAdresvelden,
  volledigAdresUitFormulier,
  type AdresFormulier,
} from "./adres";

/** De metingen zoals het formulier ze toont: een leeg veld is "niet ingevuld". */
export type MetingenFormulier = {
  /** `JJJJ-MM-DD` of leeg. */
  datum: string;
  /** Zoals het getalveld ze geeft: tekst, ook met een decimale komma (`28,5`). */
  aardingsweerstand_ohm: string;
  isolatieweerstand_MOhm: string;
  meettoestel: string;
  opmerking: string;
};

const MEETWAARDEN = ["aardingsweerstand_ohm", "isolatieweerstand_MOhm"] as const;

export type ProjectFormulier = {
  naam: string;
  klantNaam: string;
  stroomtype: Stroomtype;
  frequentie_Hz?: number | string;
  klant: AdresFormulier;
  werf: AdresFormulier;
  ean: string;
  /** `JJJJ-MM-DD`, zoals een datumveld ze geeft. */
  datum: string;
  /** De taal van het dossier (PDF); een document zonder taal toont `nl`. */
  dossierTaal: Taal;
  installatieContext?: "nieuw" | "bestaand" | "onbekend";
  metingen: MetingenFormulier;
};

export type ProjectFormulierFout = {
  /** Veldnaam voor `UFormField`; adresvelden als `klant.straat` of `werf.straat`. */
  name: string;
  fout: "naamVerplicht" | "adresVerplicht" | "datumVerplicht" | "meetwaardeOngeldig";
};

/** De gegevens voor `wijzigProjectgegevens`. */
export type ProjectgegevensWijziging = {
  naam: string;
  klantNaam: string;
  stroomtype: Stroomtype;
  frequentie_Hz?: number | null;
  klantAdres: Adres | null;
  /** Zonder ingevulde velden het lege adres, zoals een nieuw project het heeft: het oude werfadres wordt gewist. */
  werfadres: Adres;
  ean: string;
  datum: string;
  dossierTaal: Taal;
  installatieContext: "nieuw" | "bestaand" | "onbekend";
  /** Alleen de ingevulde metingen; leeg wist ze. */
  metingen: Metingen;
};

export function leegMetingenFormulier(): MetingenFormulier {
  return { datum: "", aardingsweerstand_ohm: "", isolatieweerstand_MOhm: "", meettoestel: "", opmerking: "" };
}

function metingenFormulierUit(m: Metingen | undefined): MetingenFormulier {
  return {
    datum: m?.datum ?? "",
    aardingsweerstand_ohm: m?.aardingsweerstand_ohm === undefined ? "" : String(m.aardingsweerstand_ohm),
    isolatieweerstand_MOhm: m?.isolatieweerstand_MOhm === undefined ? "" : String(m.isolatieweerstand_MOhm),
    meettoestel: m?.meettoestel ?? "",
    opmerking: m?.opmerking ?? "",
  };
}

/** Een leeg veld is `undefined`; anders het getal (ook 0), of `NaN` als het geen getal ≥ 0 is. */
function meetwaarde(waarde: number | string | null | undefined): number | undefined {
  if (waarde === null || waarde === undefined || String(waarde).trim() === "") return undefined;
  const getal = typeof waarde === "number" ? waarde : Number(waarde.trim().replace(",", "."));
  return Number.isFinite(getal) && getal >= 0 ? getal : Number.NaN;
}

function metingenUitFormulier(f: MetingenFormulier): Metingen {
  const metingen: Metingen = {};
  const datum = f.datum.trim();
  if (datum !== "") metingen.datum = datum;
  for (const veld of MEETWAARDEN) {
    const waarde = meetwaarde(f[veld]);
    if (waarde !== undefined) metingen[veld] = waarde;
  }
  const meettoestel = f.meettoestel.trim();
  if (meettoestel !== "") metingen.meettoestel = meettoestel;
  const opmerking = f.opmerking.trim();
  if (opmerking !== "") metingen.opmerking = opmerking;
  return metingen;
}

export function formulierUitProject(naam: string, doc: InstallatieDocument): ProjectFormulier {
  return {
    naam,
    klantNaam: doc.meta.klant.naam,
    stroomtype: doc.voeding.stroomtype,
    frequentie_Hz: doc.voeding.frequentie_Hz ?? "",
    klant: adresFormulierUitAdres(doc.meta.klant.adres),
    werf: adresFormulierUitAdres(doc.meta.werfadres),
    ean: doc.meta.ean ?? "",
    datum: doc.meta.datum,
    dossierTaal: doc.meta.dossierTaal ?? "nl",
    installatieContext: doc.meta.installatieContext ?? "onbekend",
    metingen: metingenFormulierUit(doc.meta.metingen),
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
  for (const veld of MEETWAARDEN) {
    if (Number.isNaN(meetwaarde(f.metingen[veld]))) fouten.push({ name: `metingen.${veld}`, fout: "meetwaardeOngeldig" });
  }
  return fouten;
}

/**
 * Verwacht een geldig formulier (zie `valideerProjectFormulier`). Een leeg klantadres wordt `null`;
 * een leeg werfadres is het lege adres van een nieuw project (het document kent geen "geen werfadres"),
 * zodat leegmaken het oude werfadres echt wist. Een document dat al leeg was, blijft zonder wijziging.
 */
export function gegevensUitFormulier(f: ProjectFormulier): ProjectgegevensWijziging {
  return {
    naam: f.naam.trim(),
    klantNaam: f.klantNaam.trim(),
    stroomtype: f.stroomtype,
    frequentie_Hz: f.frequentie_Hz === "" || f.frequentie_Hz == null ? null : Number(f.frequentie_Hz),
    klantAdres: adresUitFormulier(f.klant) ?? null,
    werfadres: volledigAdresUitFormulier(f.werf),
    ean: f.ean.trim(),
    datum: f.datum.trim(),
    dossierTaal: f.dossierTaal,
    installatieContext: f.installatieContext ?? "onbekend",
    metingen: metingenUitFormulier(f.metingen),
  };
}
