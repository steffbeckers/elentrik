// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1). `useProjectenApi` is de Nuxt-ingang; `maakProjectenApi`
// krijgt de fetch-functie van buitenaf en is zo zonder Nuxt te testen.
import type { InstallatieDocument, Stroomtype } from "@elentrik/model";
import { VERWACHTE_GEBRUIKER_HEADER } from "../../shared/gebruiker";
import type { Project, ProjectSamenvatting } from "../../shared/projecten";

export type { Project, ProjectSamenvatting };

export type NieuwProject = { naam: string; klantnaam: string; stroomtype: Stroomtype };

export type BewaarInvoer = { naam?: string; document: InstallatieDocument };

/** Een bewaaractie op een verouderde versie: `huidigeVersie` is de versie op de server. */
export class ConflictFout extends Error {
  readonly huidigeVersie: number;

  constructor(huidigeVersie: number) {
    super("Het project is intussen gewijzigd");
    this.name = "ConflictFout";
    this.huidigeVersie = huidigeVersie;
  }
}

export type ProjectenFetch = (
  url: string,
  opties?: { method?: string; headers?: Record<string, string>; body?: unknown },
) => Promise<unknown>;

type FetchFoutVorm = { status?: number; statusCode?: number; data?: { data?: { versie?: unknown } } };

/** De versie op de server uit een 409 van `$fetch`, of `undefined` als het geen conflict is. Ook voor de export. */
export function huidigeVersieUitConflict(fout: unknown): number | undefined {
  if (typeof fout !== "object" || fout === null) return undefined;
  const { status, statusCode, data } = fout as FetchFoutVorm;
  if ((status ?? statusCode) !== 409) return undefined;
  const versie = data?.data?.versie;
  return typeof versie === "number" ? versie : undefined;
}

/** De HTTP-status van een fout zoals `$fetch` hem geeft (`status` of `statusCode`). */
export function httpStatus(fout: unknown): number | undefined {
  if (typeof fout !== "object" || fout === null) return undefined;
  const { status, statusCode } = fout as { status?: unknown; statusCode?: unknown };
  const waarde = status ?? statusCode;
  return typeof waarde === "number" ? waarde : undefined;
}

export type ProjectenApiOpties = {
  /**
   * De gebruiker voor wie de editor bewaart. Bewaren en dupliceren sturen hem mee; is de sessie
   * intussen van een ander (die in een ander tabblad inlogde), dan weigert de server met een 401.
   */
  gebruikerId?: string;
};

export function maakProjectenApi(haal: ProjectenFetch, opties: ProjectenApiOpties = {}) {
  const voorGebruiker: Record<string, string> = opties.gebruikerId
    ? { [VERWACHTE_GEBRUIKER_HEADER]: opties.gebruikerId }
    : {};
  return {
    lijst: () => haal("/api/projecten") as Promise<ProjectSamenvatting[]>,

    maak: (invoer: NieuwProject) =>
      haal("/api/projecten", { method: "POST", body: invoer }) as Promise<{
        id: string;
        versie: number;
      }>,

    haal: (id: string) => haal(`/api/projecten/${id}`) as Promise<Project>,

    async bewaar(id: string, versie: number, invoer: BewaarInvoer): Promise<{ versie: number }> {
      try {
        return (await haal(`/api/projecten/${id}`, {
          method: "PUT",
          headers: { "If-Match": String(versie), ...voorGebruiker },
          body: invoer,
        })) as { versie: number };
      } catch (fout) {
        const huidige = huidigeVersieUitConflict(fout);
        if (huidige !== undefined) throw new ConflictFout(huidige);
        throw fout;
      }
    },

    dupliceer: (id: string) =>
      haal(`/api/projecten/${id}/dupliceer`, {
        method: "POST",
        ...(opties.gebruikerId ? { headers: voorGebruiker } : {}),
      }) as Promise<{ id: string }>,

    verwijder: async (id: string): Promise<void> => {
      await haal(`/api/projecten/${id}`, { method: "DELETE" });
    },
  };
}

export type ProjectenApi = ReturnType<typeof maakProjectenApi>;

export function useProjectenApi(opties: ProjectenApiOpties = {}): ProjectenApi {
  return maakProjectenApi($fetch as unknown as ProjectenFetch, opties);
}
