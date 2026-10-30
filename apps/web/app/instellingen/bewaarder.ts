// Het bewaren van de bedrijfsgegevens en het logo, voor het bedrijf waarvoor het formulier geladen
// werd. Wisselt het actieve bedrijf intussen (in dit of een ander tabblad), dan bewaart het
// formulier nooit onder het nieuwe bedrijf: het stuurt het bedrijf van zijn eigen gegevens mee en
// de server weigert met 409 ANDERE_ORGANISATIE. Daarna wordt eerst opnieuw geladen.
//
// Puur en zonder Nuxt; expliciete imports (ruling E1). De toestand komt van buiten (op de pagina een
// `reactive`), zodat het scherm erop reageert.
import type { Partij } from "@elentrik/model";
import type { BestandInfo } from "../../shared/bestandsinhoud";
import { isAndereOrganisatie } from "../sessie/organisatie";

export type BewaarderToestand = {
  /** Het bedrijf waarvoor het formulier geladen werd; null zolang er (opnieuw) geladen wordt. */
  geladenVoor: string | null;
  bezig: boolean;
  logoBezig: boolean;
};

export type BewaarderOpties = {
  bewaar(partij: Partij, organisatieId: string): Promise<Partij>;
  uploadLogo(bestand: Blob, naam: string, organisatieId: string): Promise<BestandInfo>;
  /** Behandelt een 409 ANDERE_ORGANISATIE (sessie opnieuw lezen en melden); true als ze dat was. */
  andereOrganisatie(fout: unknown): Promise<boolean>;
  /** Laadt de gegevens van het actieve bedrijf opnieuw en zet daarna `geladenVoor`. */
  herlaad(): Promise<void>;
};

export type BewaarUitkomst<T> =
  | { status: "gedaan"; waarde: T }
  /** Niets verstuurd: er loopt al een actie, of het formulier is niet (meer) geladen. */
  | { status: "overgeslagen" }
  /** Verstuurd, maar het formulier hoort intussen bij een ander bedrijf: het antwoord is niet voor dit formulier. */
  | { status: "verlopen" }
  /** Het actieve bedrijf bleek een ander: de melding staat er en het formulier is herladen. */
  | { status: "andereOrganisatie" };

export function maakBedrijfBewaarder(toestand: BewaarderToestand, opties: BewaarderOpties) {
  async function voerUit<T>(
    vlag: "bezig" | "logoBezig",
    actie: (organisatieId: string) => Promise<T>,
  ): Promise<BewaarUitkomst<T>> {
    const organisatieId = toestand.geladenVoor;
    if (toestand[vlag] || organisatieId === null) return { status: "overgeslagen" };
    toestand[vlag] = true;
    try {
      const waarde = await actie(organisatieId);
      if (toestand.geladenVoor !== organisatieId) return { status: "verlopen" };
      return { status: "gedaan", waarde };
    } catch (fout) {
      if (!isAndereOrganisatie(fout)) throw fout;
      // Meteen niet meer bewaarbaar, nog vóór de melding en het herladen.
      toestand.geladenVoor = null;
      await opties.andereOrganisatie(fout);
      await opties.herlaad();
      return { status: "andereOrganisatie" };
    } finally {
      toestand[vlag] = false;
    }
  }

  return {
    bewaar: (partij: Partij) => voerUit("bezig", (id) => opties.bewaar(partij, id)),
    uploadLogo: (bestand: Blob, naam: string) => voerUit("logoBezig", (id) => opties.uploadLogo(bestand, naam, id)),
  };
}

export type BedrijfBewaarder = ReturnType<typeof maakBedrijfBewaarder>;
