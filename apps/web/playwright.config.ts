import { defineConfig, devices } from "@playwright/test";
import {
  E2E_AUTH_SECRET,
  E2E_BESTANDEN_DIR,
  E2E_BUILD_DIR,
  E2E_DATABASE_URL,
  E2E_POORT,
  E2E_STRIPE_PRIJS_JAAR,
  E2E_STRIPE_PRIJS_MAAND,
  E2E_STRIPE_SLEUTEL,
  E2E_STRIPE_URL,
  E2E_STRIPE_WEBHOOK_GEHEIM,
  E2E_URL,
} from "./e2e/omgeving";

// Playwright draait tegen een eigen server (poort 3100) met een eigen database (`elentrik_e2e`)
// en een eigen bestandenmap, los van de ontwikkelserver op 3000 en de echte gegevens.
// De waarden zijn vast en komen niet uit de omgeving. Ook het testproces zelf (de specs en hun
// hulpfuncties) krijgt ze, zodat een hulpfunctie nooit per ongeluk de echte database raakt.
process.env.DATABASE_URL = E2E_DATABASE_URL;
process.env.ELENTRIK_BESTANDEN_DIR = E2E_BESTANDEN_DIR;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // Eén worker: e2e/aanmelden.spec.ts rekent erop. Zijn overnametest zaait projecten zonder
  // organisatie en registreert meteen daarna; een parallelle registratie zou ze kunnen overnemen.
  workers: 1,
  reporter: "list",
  use: {
    baseURL: E2E_URL,
    trace: "retain-on-failure",
  },
  // De bestaande specs lezen Nederlandse teksten: de browser vraagt dus Nederlands (Accept-Language),
  // ongeacht de taal van het toestel. Een spec die een andere taal test, zet zelf een andere locale.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], locale: "nl-BE" } }],
  webServer: {
    command: `pnpm exec nuxt dev --port ${E2E_POORT} --host 127.0.0.1`,
    url: E2E_URL,
    // Altijd een eigen server: hergebruik zou kunnen eindigen op een server met echte gegevens.
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      ELENTRIK_BESTANDEN_DIR: E2E_BESTANDEN_DIR,
      // Eigen builddir, zodat de ontwikkelserver op 3000 en deze server .nuxt niet delen.
      ELENTRIK_BUILD_DIR: E2E_BUILD_DIR,
      ELENTRIK_GOTENBERG_URL: "http://127.0.0.1:3001",
      BETTER_AUTH_URL: E2E_URL,
      BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      SMTP_VAN: "Elentrik <noreply@elentrik.local>",
      // Leeg, zodat een SMTP-login uit .env de lokale Mailpit niet in de weg zit.
      SMTP_GEBRUIKER: "",
      SMTP_WACHTWOORD: "",
      SMTP_BEVEILIGD: "",
      // Abonnementen aan, tegen de nep-Stripe van global-setup. Vaste testwaarden, nooit uit .env.
      STRIPE_GEHEIME_SLEUTEL: E2E_STRIPE_SLEUTEL,
      STRIPE_WEBHOOK_GEHEIM: E2E_STRIPE_WEBHOOK_GEHEIM,
      STRIPE_PRIJS_MAAND: E2E_STRIPE_PRIJS_MAAND,
      STRIPE_PRIJS_JAAR: E2E_STRIPE_PRIJS_JAAR,
      STRIPE_API_BASIS: E2E_STRIPE_URL,
      // Geen boekhoudmail in e2e, ook niet als .env een adres heeft.
      BOEKHOUDING_INBOX: "",
    },
    timeout: 120_000,
  },
});
