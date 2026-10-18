import { defineConfig, devices } from "@playwright/test";

// De Nuxt-dev-server leest DATABASE_URL uit apps/web/.env (zie .env.example); de
// lokale Postgres start met `pnpm db:up` en `pnpm db:migrate`.
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
    timeout: 120_000,
  },
});
