// De talen van de app, gedeeld door de server en de client. Eén bron voor het type en de locales:
// @elentrik/arei (de berichten) en @elentrik/render (de dossierteksten) gebruiken dezelfde.
// Expliciet geïmporteerd (ruling E1).
import { LOCALES, type Taal } from "@elentrik/arei";

export { LOCALES, type Taal };

/** De ondersteunde talen; `nl` is de standaard. */
export const TALEN = ["nl", "fr", "en"] as const satisfies readonly Taal[];

/** De taal van de interface bij de registratie, als header van het verzoek. */
export const TAAL_HEADER = "x-elentrik-taal";

export function isTaal(waarde: unknown): waarde is Taal {
  return typeof waarde === "string" && (TALEN as readonly string[]).includes(waarde);
}
