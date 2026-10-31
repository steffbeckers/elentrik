import { defineConfig, devices } from "@playwright/test";
import {
  E2E_AUTH_SECRET,
  E2E_BESTANDEN_DIR,
  E2E_DATABASE_URL,
  eisE2eDatabase,
} from "./e2e/omgeving";

// De e2e van de service worker (pnpm e2e:sw). De service worker bestaat alleen in de productiebuild;
// deze config bouwt daarom een eigen productiebuild (.nuxt-sw, .output-sw) en start die op een eigen
// poort, los van de ontwikkelserver (3000) en de gewone e2e-server (3100). Zonder NODE_ENV=production,
// zodat de server zonder volledige productieconfiguratie start; wel tegen de e2e-database
// (`elentrik_e2e`), nooit tegen de echte. De specs gebruiken alleen de publieke pagina's.
const POORT = 3110;
const URL = `http://127.0.0.1:${POORT}`;

process.env.DATABASE_URL = eisE2eDatabase(E2E_DATABASE_URL);
process.env.ELENTRIK_BESTANDEN_DIR = E2E_BESTANDEN_DIR;

export default defineConfig({
  testDir: "./e2e-sw",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], locale: "nl-BE" } }],
  webServer: {
    command: "pnpm exec nuxt build && node .output-sw/server/index.mjs",
    url: URL,
    reuseExistingServer: false,
    env: {
      ELENTRIK_BUILD_DIR: ".nuxt-sw",
      ELENTRIK_OUTPUT_DIR: ".output-sw",
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: String(POORT),
      DATABASE_URL: E2E_DATABASE_URL,
      ELENTRIK_BESTANDEN_DIR: E2E_BESTANDEN_DIR,
      ELENTRIK_GOTENBERG_URL: "http://127.0.0.1:3001",
      BETTER_AUTH_URL: URL,
      BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
      NUXT_AUTH_BASIS_URL: URL,
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      SMTP_VAN: "Elentrik <noreply@elentrik.local>",
      SMTP_GEBRUIKER: "",
      SMTP_WACHTWOORD: "",
      SMTP_BEVEILIGD: "",
      BOEKHOUDING_INBOX: "",
      ELENTRIK_GEPLANDE_TAKEN: "uit",
    },
    // Bouwen duurt enkele minuten.
    timeout: 600_000,
  },
});
