// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1). `useExportsApi` is de Nuxt-ingang; `maakExportsApi` krijgt de fetch-functie
// van buitenaf en is zo zonder Nuxt te testen.
import type { ExportInfo, ExportInvoer } from "../../shared/exports";
import { ConflictFout, huidigeVersieUitConflict } from "./useProjectenApi";

export type { ExportInfo, ExportInvoer };

export type ExportsFetch = (
  url: string,
  opties?: { method?: string; headers?: Record<string, string>; body?: unknown },
) => Promise<unknown>;

export function maakExportsApi(haal: ExportsFetch) {
  return {
    /**
     * Maakt een PDF uit het opgeslagen document; de server bewaart de export en het bestand.
     * `versie` is de versie die de editor toont (`If-Match`, zoals bij het bewaren). Heeft de server
     * intussen een andere versie, dan volgt een `ConflictFout` en wordt er niets geëxporteerd.
     */
    async maak(projectId: string, versie: number, invoer: ExportInvoer): Promise<ExportInfo> {
      try {
        return (await haal(`/api/projecten/${projectId}/exports`, {
          method: "POST",
          headers: { "If-Match": String(versie) },
          body: invoer,
        })) as ExportInfo;
      } catch (fout) {
        const huidige = huidigeVersieUitConflict(fout);
        if (huidige !== undefined) throw new ConflictFout(huidige);
        throw fout;
      }
    },

    /** De eerdere exports van het project, de nieuwste eerst. */
    lijst: (projectId: string) => haal(`/api/projecten/${projectId}/exports`) as Promise<ExportInfo[]>,

    downloadUrl: (bestandId: string): string => `/api/bestanden/${bestandId}`,
  };
}

export type ExportsApi = ReturnType<typeof maakExportsApi>;

export function useExportsApi(): ExportsApi {
  return maakExportsApi($fetch as unknown as ExportsFetch);
}
