// De versie en revisie voor de app. Zoals useOmgeving: de server leest de omgeving bij het renderen, de
// waarde gaat via de payload (useState) naar de client.
import { type AppVersie, leesAppVersie } from "../../shared/versie";

export function useAppVersie() {
  return useState<AppVersie>("appVersie", () =>
    import.meta.server ? leesAppVersie(process.env) : { versie: null, revisie: null },
  );
}
