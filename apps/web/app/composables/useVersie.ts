// De versie (korte git-sha) voor de app. Zoals useOmgeving: de server leest ELENTRIK_REVISIE bij het
// renderen, de waarde gaat via de payload (useState) naar de client. Lokaal `null`.
import { leesVersie } from "../../shared/versie";

export function useVersie() {
  return useState<string | null>("versie", () => (import.meta.server ? leesVersie(process.env) : null));
}
