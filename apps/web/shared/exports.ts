// De vorm van een export zoals de API hem aanvaardt en teruggeeft; gedeeld door de server
// (`server/exports/repo.ts`) en de client. Alleen types, expliciet geïmporteerd (ruling E1).

export type Papierformaat = "A4" | "A3";

export type ExportOnderdelen = {
  eendraadschema: boolean;
  situatieschema: boolean;
  kringenlijst: boolean;
  bijlage: boolean;
};

/** De invoer van `POST /api/projecten/:id/exports`. */
export type ExportInvoer = {
  onderdelen: ExportOnderdelen;
  papier: Papierformaat;
  /** Na trimmen 1 tot 40 tekens. */
  versieLabel: string;
};

/** Eén export van een project, zoals `GET /api/projecten/:id/exports` hem geeft. */
export type ExportInfo = {
  id: string;
  bestandId: string;
  versieLabel: string;
  papier: Papierformaat;
  /** Onopgeloste fouten (niet afgeweken) op het moment van de export. */
  aantalFouten: number;
  /** Onopgeloste waarschuwingen (niet afgeweken) op het moment van de export. */
  aantalWaarschuwingen: number;
  /** ISO-tijdstip. */
  aangemaakt: string;
};
