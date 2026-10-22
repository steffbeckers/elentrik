// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1). `useBedrijfApi` is de Nuxt-ingang; `maakBedrijfApi` krijgt de fetch-functie
// van buitenaf en is zo zonder Nuxt te testen.
import type { Partij } from "@elentrik/model";
import type { BestandInfo } from "../../shared/bestandsinhoud";

export type BedrijfFetch = (
  url: string,
  opties?: { method?: string; body?: unknown },
) => Promise<unknown>;

export function maakBedrijfApi(haal: BedrijfFetch) {
  return {
    haal: () => haal("/api/bedrijfsgegevens") as Promise<Partij>,

    bewaar: (partij: Partij) =>
      haal("/api/bedrijfsgegevens", { method: "PUT", body: partij }) as Promise<Partij>,

    /** Uploadt het logo als multipart; de server zet zelf `logoBestandId` op de bedrijfsgegevens. */
    uploadLogo(bestand: Blob, naam: string): Promise<BestandInfo> {
      const body = new FormData();
      body.append("bestand", bestand, naam);
      return haal("/api/bedrijfsgegevens/logo", { method: "POST", body }) as Promise<BestandInfo>;
    },
  };
}

export type BedrijfApi = ReturnType<typeof maakBedrijfApi>;

export function useBedrijfApi(): BedrijfApi {
  return maakBedrijfApi($fetch as unknown as BedrijfFetch);
}
