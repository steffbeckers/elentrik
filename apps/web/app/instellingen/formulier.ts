// Het bedrijfsformulier en zijn omzetting van en naar een `Partij`. Puur en zonder I/O;
// expliciete imports, geen Nuxt-auto-imports (ruling E1).
import type { Partij } from "@elentrik/model";
import { herkenSoort, MAX_LOGO_BYTES } from "../../shared/bestandsinhoud";
import { foutCode, foutStatus } from "../sessie/fouten";
import {
  STANDAARD_LAND,
  VERPLICHTE_ADRESVELDEN,
  adresFormulierUitAdres,
  adresUitFormulier,
  heeftAdres,
  leegAdresFormulier,
  type AdresFormulier,
} from "../editor/adres";

export { STANDAARD_LAND };

export type BedrijfFormulier = AdresFormulier & {
  naam: string;
  ondernemingsnummer: string;
  telefoon: string;
  email: string;
};

export type FormulierVeld = keyof BedrijfFormulier;
export type FormulierFout = { name: FormulierVeld; fout: "naamVerplicht" | "adresVerplicht" };

export function leegFormulier(): BedrijfFormulier {
  return {
    naam: "",
    ondernemingsnummer: "",
    telefoon: "",
    email: "",
    ...leegAdresFormulier(),
  };
}

export function formulierUitPartij(partij: Partij): BedrijfFormulier {
  return {
    naam: partij.naam,
    ondernemingsnummer: partij.ondernemingsnummer ?? "",
    telefoon: partij.telefoon ?? "",
    email: partij.email ?? "",
    ...adresFormulierUitAdres(partij.adres),
  };
}

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

  const adres = adresUitFormulier(f);
  if (adres !== undefined) partij.adres = adres;
  return partij;
}

export type LogoFoutSleutel = "onbekendType" | "teGroot" | "opslagVol" | "mislukt";

/**
 * De melding bij een mislukte logo-upload. Een 413 is `teGroot`, tenzij de server de code OPSLAG_VOL
 * stuurde: dan is de opslag van het bedrijf vol (`opslagVol`, de vertaling is `fouten.OPSLAG_VOL`).
 */
export function logoUploadFout(fout: unknown): LogoFoutSleutel {
  const status = foutStatus(fout);
  if (status === 413) return foutCode(fout) === "OPSLAG_VOL" ? "opslagVol" : "teGroot";
  return status === 415 ? "onbekendType" : "mislukt";
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
