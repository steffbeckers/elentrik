export type FoutCode =
  | "ONGELDIG_SCHEMA"
  | "ONBEKENDE_NODE"
  | "NIET_TOEGELATEN_KIND"
  | "CYCLUS"
  | "ROOT_NIET_WIJZIGBAAR"
  | "ONGELDIGE_INDEX"
  | "ONBEKENDE_PAGINA"
  | "NIET_PLAATSBAAR"
  | "ONBEKENDE_SCHEMAVERSIE";

export class DocumentFout extends Error {
  readonly code: FoutCode;
  readonly details?: unknown;

  constructor(code: FoutCode, details?: unknown) {
    super(code);
    this.name = "DocumentFout";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
