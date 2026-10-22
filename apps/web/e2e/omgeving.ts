// Vaste waarden van de e2e-omgeving. Playwright draait tegen een eigen database en een eigen
// bestandenmap, nooit tegen de ontwikkelgegevens (`elentrik`, `.data/bestanden`).
// De waarden staan hier vast en komen niet uit de omgeving: een DATABASE_URL uit de shell of
// uit .env mag nooit tot echte gegevens leiden.
export const E2E_DATABASE_NAAM = "elentrik_e2e";
export const E2E_DATABASE_URL = `postgres://elentrik:elentrik@127.0.0.1:5432/${E2E_DATABASE_NAAM}`;
export const E2E_BESTANDEN_DIR = ".data/e2e-bestanden";
export const E2E_POORT = 3100;
export const E2E_URL = `http://127.0.0.1:${E2E_POORT}`;
export const E2E_AUTH_SECRET = "e2e-geheim-alleen-voor-tests-niet-voor-gebruik-elders";
export const MAILPIT_URL = "http://127.0.0.1:8025";

/** Veiligheidsnet: stopt als de huidige DATABASE_URL niet op de e2e-database wijst. */
export function eisE2eDatabase(url: string | undefined = process.env.DATABASE_URL): string {
  if (!url || !url.endsWith(`/${E2E_DATABASE_NAAM}`)) {
    throw new Error(
      `Geweigerd: DATABASE_URL moet eindigen op /${E2E_DATABASE_NAAM} (e2e-tests raken nooit de echte database).`,
    );
  }
  return url;
}
