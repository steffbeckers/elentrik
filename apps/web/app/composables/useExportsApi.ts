// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1). `useExportsApi` is de Nuxt-ingang; `maakExportsApi` krijgt de fetch-functie
// van buitenaf en is zo zonder Nuxt te testen.
import type { ExportInfo, ExportInvoer } from "../../shared/exports";

export type { ExportInfo, ExportInvoer };

export type ExportsFetch = (url: string, opties?: { method?: string; body?: unknown }) => Promise<unknown>;

export function maakExportsApi(haal: ExportsFetch) {
  return {
    /** Maakt een PDF uit het opgeslagen document; de server bewaart de export en het bestand. */
    maak: (projectId: string, invoer: ExportInvoer) =>
      haal(`/api/projecten/${projectId}/exports`, { method: "POST", body: invoer }) as Promise<ExportInfo>,

    /** De eerdere exports van het project, de nieuwste eerst. */
    lijst: (projectId: string) => haal(`/api/projecten/${projectId}/exports`) as Promise<ExportInfo[]>,

    downloadUrl: (bestandId: string): string => `/api/bestanden/${bestandId}`,
  };
}

export type ExportsApi = ReturnType<typeof maakExportsApi>;

export function useExportsApi(): ExportsApi {
  return maakExportsApi($fetch as unknown as ExportsFetch);
}
