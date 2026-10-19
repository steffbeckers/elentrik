// De vorm van een project zoals de API hem geeft; gedeeld door de server (`server/projecten/repo.ts`)
// en de client (`app/composables/useProjectenApi.ts`). Alleen types, expliciet geïmporteerd (ruling E1).
import type { InstallatieDocument } from "@elentrik/model";

export type ProjectSamenvatting = {
  id: string;
  naam: string;
  klantnaam: string;
  gewijzigd: string;
};

export type Project = ProjectSamenvatting & {
  document: InstallatieDocument;
  versie: number;
};
