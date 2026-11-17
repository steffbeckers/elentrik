// De revisie (korte git-sha) voor de app. Zoals useOmgeving: de server leest ELENTRIK_REVISIE bij het
// renderen, de waarde gaat via de payload (useState) naar de client. De semantische versie is
// `APP_VERSIE` uit shared/versie.ts en zit gewoon in de bundel.
import { leesRevisie } from "../../shared/versie";

export function useRevisie() {
  return useState<string | null>("revisie", () => (import.meta.server ? leesRevisie(process.env) : null));
}
