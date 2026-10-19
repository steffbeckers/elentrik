// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1). `useBestandenApi` is de Nuxt-ingang; `maakBestandenApi` krijgt de
// fetch-functie van buitenaf en is zo zonder Nuxt te testen.
import type { BestandInfo } from "../../shared/bestandsinhoud";

export type { BestandInfo };

export type BestandenSoort = "plan-origineel" | "plan-raster";

export type BestandenFetch = (
  url: string,
  opties?: { method?: string; body?: FormData; signal?: AbortSignal },
) => Promise<unknown>;

export function maakBestandenApi(haal: BestandenFetch) {
  return {
    /** Uploadt een planbestand als multipart; een `signal` laat de aanroeper het afbreken. */
    upload(
      projectId: string,
      soort: BestandenSoort,
      bestand: Blob,
      naam: string,
      signal?: AbortSignal,
    ): Promise<BestandInfo> {
      const body = new FormData();
      body.append("bestand", bestand, naam);
      body.append("soort", soort);
      return haal(`/api/projecten/${projectId}/bestanden`, {
        method: "POST",
        body,
        ...(signal ? { signal } : {}),
      }) as Promise<BestandInfo>;
    },

    url: (bestandId: string): string => `/api/bestanden/${bestandId}`,
  };
}

export type BestandenApi = ReturnType<typeof maakBestandenApi>;

export function useBestandenApi(): BestandenApi {
  return maakBestandenApi($fetch as unknown as BestandenFetch);
}
