// De omgeving (productie, staging of niets) voor de app. De server leest ELENTRIK_OMGEVING bij het
// renderen; de waarde gaat in de payload van de pagina naar de client (useState). Eén variabele op de NAS,
// geen tweede voor de client. Het image is voor staging en productie hetzelfde.
import { type Omgeving, leesOmgeving } from "../../shared/omgeving";

export function useOmgeving() {
  return useState<Omgeving>("omgeving", () => (import.meta.server ? leesOmgeving(process.env) : null));
}
