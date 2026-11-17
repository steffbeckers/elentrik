// De vorm van een project zoals de API hem geeft; gedeeld door de server (`server/projecten/repo.ts`)
// en de client (`app/composables/useProjectenApi.ts`). Alleen types, expliciet geïmporteerd (ruling E1).
import type { InstallatieDocument, Limieten } from "@elentrik/model";
import type { Projecttoegang } from "./abonnement";

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
  /**
   * Het label in de lijst (spec 4.7), alleen voor een gratis bedrijf; anders null. `alleen-lezen`: het
   * project mag niet bewerkt worden; `vrijgegeven`: eenmalig betaald; `gratis`: de gratis versie.
   */
  label: ProjectLabel | null;
};

export type ProjectLabel = "gratis" | "vrijgegeven" | "alleen-lezen";

export type Project = ProjectSamenvatting & {
  /** De organisatie waartoe het project hoort. */
  organisatieId: string;
  document: InstallatieDocument;
  versie: number;
  /** Wat het bedrijf met dit project mag. */
  toegang: Projecttoegang;
  /** De limieten van de gratis versie, of null als abonnementen uit staan. */
  limieten: Limieten | null;
};
