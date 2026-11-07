// De vorm van een project zoals de API hem geeft; gedeeld door de server (`server/projecten/repo.ts`)
// en de client (`app/composables/useProjectenApi.ts`). Alleen types, expliciet geïmporteerd (ruling E1).
import type { InstallatieDocument } from "@elentrik/model";

export type ProjectSamenvatting = {
  id: string;
  naam: string;
  klantnaam: string;
  gewijzigd: string;
};

/** Een rij van de projectlijst: de samenvatting plus de werf en de status. */
export type ProjectInLijst = ProjectSamenvatting & {
  /** De gemeente van het werfadres, anders die van het klantadres; null als geen van beide ingevuld is. */
  werfGemeente: string | null;
  /** Het tijdstip (ISO) van de laatste export, of null: dan is het project nog een concept. */
  laatsteExport: string | null;
};

export type Project = ProjectSamenvatting & {
  /** De organisatie waartoe het project hoort. */
  organisatieId: string;
  document: InstallatieDocument;
  versie: number;
};
