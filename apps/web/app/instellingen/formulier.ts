// Het bedrijfsformulier en zijn omzetting van en naar een `Partij`. Puur en zonder I/O;
// expliciete imports, geen Nuxt-auto-imports (ruling E1).
import type { Adres, Partij } from "@elentrik/model";
import { herkenSoort, MAX_LOGO_BYTES } from "../../shared/bestandsinhoud";

export const STANDAARD_LAND = "België";

export type BedrijfFormulier = {
  naam: string;
  ondernemingsnummer: string;
  telefoon: string;
  email: string;
  straat: string;
  nummer: string;
  bus: string;
  postcode: string;
  gemeente: string;
  land: string;
};

export type FormulierVeld = keyof BedrijfFormulier;
export type FormulierFout = { name: FormulierVeld; fout: "naamVerplicht" | "adresVerplicht" };

export function leegFormulier(): BedrijfFormulier {
  return {
    naam: "",
    ondernemingsnummer: "",
    telefoon: "",
    email: "",
    straat: "",
    nummer: "",
    bus: "",
    postcode: "",
    gemeente: "",
    land: STANDAARD_LAND,
  };
}

export function formulierUitPartij(partij: Partij): BedrijfFormulier {
  const leeg = leegFormulier();
  return {
    naam: partij.naam,
    ondernemingsnummer: partij.ondernemingsnummer ?? "",
    telefoon: partij.telefoon ?? "",
    email: partij.email ?? "",
    straat: partij.adres?.straat ?? leeg.straat,
    nummer: partij.adres?.nummer ?? leeg.nummer,
    bus: partij.adres?.bus ?? leeg.bus,
    postcode: partij.adres?.postcode ?? leeg.postcode,
    gemeente: partij.adres?.gemeente ?? leeg.gemeente,
    land: partij.adres?.land ?? leeg.land,
  };
}

/** Het land alleen telt niet: zonder straat, nummer, bus, postcode of gemeente is er geen adres. */
function heeftAdres(f: BedrijfFormulier): boolean {
  return [f.straat, f.nummer, f.bus, f.postcode, f.gemeente].some((waarde) => waarde.trim() !== "");
}

const VERPLICHTE_ADRESVELDEN = ["straat", "nummer", "postcode", "gemeente"] as const;

export function valideerFormulier(f: BedrijfFormulier): FormulierFout[] {
  const fouten: FormulierFout[] = [];
  if (f.naam.trim() === "") fouten.push({ name: "naam", fout: "naamVerplicht" });
  if (heeftAdres(f)) {
    for (const veld of VERPLICHTE_ADRESVELDEN) {
      if (f[veld].trim() === "") fouten.push({ name: veld, fout: "adresVerplicht" });
    }
  }
  return fouten;
}

/**
 * De `Partij` om te bewaren. Lege optionele velden en een leeg adres ontbreken; `logoBestandId`
 * gaat nooit mee, want alleen de logo-upload zet het en de server behoudt het bij het bewaren.
 * Verwacht een geldig formulier (zie `valideerFormulier`).
 */
export function partijUitFormulier(f: BedrijfFormulier): Partij {
  const partij: Partij = { naam: f.naam.trim() };
  const ondernemingsnummer = f.ondernemingsnummer.trim();
  const telefoon = f.telefoon.trim();
  const email = f.email.trim();
  if (ondernemingsnummer !== "") partij.ondernemingsnummer = ondernemingsnummer;
  if (email !== "") partij.email = email;
  if (telefoon !== "") partij.telefoon = telefoon;

  if (heeftAdres(f)) {
    const bus = f.bus.trim();
    const adres: Adres = {
      straat: f.straat.trim(),
      nummer: f.nummer.trim(),
      ...(bus !== "" ? { bus } : {}),
      postcode: f.postcode.trim(),
      gemeente: f.gemeente.trim(),
      land: f.land.trim() || STANDAARD_LAND,
    };
    partij.adres = adres;
  }
  return partij;
}

/** Eerste controle van een logo (PNG of JPEG, hoogstens 2 MB); de server herhaalt ze. */
export function controleerLogo(
  grootte: number,
  kop: Uint8Array,
): { ok: true } | { ok: false; reden: "te-groot" | "onbekend-type" } {
  if (grootte > MAX_LOGO_BYTES) return { ok: false, reden: "te-groot" };
  const soort = herkenSoort(kop);
  return soort === "png" || soort === "jpeg" ? { ok: true } : { ok: false, reden: "onbekend-type" };
}
