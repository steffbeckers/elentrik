// Vaste waarden van de e2e-omgeving. Playwright draait tegen een eigen database en een eigen
// bestandenmap, nooit tegen de ontwikkelgegevens (`elentrik`, `.data/bestanden`).
// De waarden staan hier vast en komen niet uit de omgeving: een DATABASE_URL uit de shell of
// uit .env mag nooit tot echte gegevens leiden.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DATABASE_NAAM = "elentrik_e2e";
export const E2E_DATABASE_URL = `postgres://elentrik:elentrik@127.0.0.1:5432/${E2E_DATABASE_NAAM}`;
/** De map apps/web, los van de werkmap van het proces dat dit laadt. */
export const WEB_DIR = fileURLToPath(new URL("..", import.meta.url));
export const E2E_BESTANDEN_DIR = resolve(WEB_DIR, ".data/e2e-bestanden");
export const E2E_BUILD_DIR = ".nuxt-e2e";
export const E2E_POORT = 3100;
export const E2E_URL = `http://127.0.0.1:${E2E_POORT}`;
export const E2E_AUTH_SECRET = "e2e-geheim-alleen-voor-tests-niet-voor-gebruik-elders";
export const MAILPIT_URL = "http://127.0.0.1:8025";

/**
 * Veiligheidsnet: stopt tenzij de URL wijst naar de lokale Postgres (127.0.0.1 of localhost,
 * poort 5432) en naar de database `elentrik_e2e`.
 */
export function eisE2eDatabase(url: string | undefined = process.env.DATABASE_URL): string {
  let geldig = false;
  if (url) {
    try {
      const u = new URL(url);
      geldig =
        (u.protocol === "postgres:" || u.protocol === "postgresql:") &&
        (u.hostname === "127.0.0.1" || u.hostname === "localhost") &&
        u.port === "5432" &&
        u.pathname === `/${E2E_DATABASE_NAAM}`;
    } catch {
      geldig = false;
    }
  }
  if (!url || !geldig) {
    throw new Error(
      `Geweigerd: DATABASE_URL moet wijzen naar 127.0.0.1:5432/${E2E_DATABASE_NAAM} (e2e-tests raken nooit de echte database).`,
    );
  }
  return url;
}
