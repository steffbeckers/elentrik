// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1). `useBedrijfApi` is de Nuxt-ingang; `maakBedrijfApi` krijgt de fetch-functie
// van buitenaf en is zo zonder Nuxt te testen.
import type { Partij } from "@elentrik/model";
import type { BestandInfo } from "../../shared/bestandsinhoud";
import { voorOrganisatie } from "../sessie/organisatie";
import { useSessieStore } from "../stores/sessie";

export type BedrijfFetch = (
  url: string,
  opties?: { method?: string; headers?: Record<string, string>; body?: unknown },
) => Promise<unknown>;

export type BedrijfApiOpties = {
  /**
   * De actieve organisatie zoals de pagina die kent. Bewaren en het logo opladen sturen ze mee;
   * wisselde een ander tabblad intussen, dan weigert de server met 409 ANDERE_ORGANISATIE.
   */
  actieveOrganisatieId?: () => string | null;
};

export function maakBedrijfApi(haal: BedrijfFetch, opties: BedrijfApiOpties = {}) {
  const organisatie = () => voorOrganisatie(opties.actieveOrganisatieId?.());
  return {
    haal: () => haal("/api/bedrijfsgegevens") as Promise<Partij>,

    bewaar: (partij: Partij) =>
      haal("/api/bedrijfsgegevens", { method: "PUT", body: partij, ...organisatie() }) as Promise<Partij>,

    /** Uploadt het logo als multipart; de server zet zelf `logoBestandId` op de bedrijfsgegevens. */
    uploadLogo(bestand: Blob, naam: string): Promise<BestandInfo> {
      const body = new FormData();
      body.append("bestand", bestand, naam);
      return haal("/api/bedrijfsgegevens/logo", { method: "POST", body, ...organisatie() }) as Promise<BestandInfo>;
    },
  };
}

export type BedrijfApi = ReturnType<typeof maakBedrijfApi>;

export function useBedrijfApi(): BedrijfApi {
  const sessie = useSessieStore();
  return maakBedrijfApi($fetch as unknown as BedrijfFetch, { actieveOrganisatieId: () => sessie.actieveOrganisatieId });
}
