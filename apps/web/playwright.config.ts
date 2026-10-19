import { defineConfig, devices } from "@playwright/test";

// De dev-server krijgt DATABASE_URL uit de omgeving, met als standaard de lokale
// Docker-Postgres (zie .env.example). Die start met `pnpm db:up` en `pnpm db:migrate`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter @elentrik/web dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgres://elentrik:elentrik@127.0.0.1:5432/elentrik",
    },
    timeout: 120_000,
  },
});
