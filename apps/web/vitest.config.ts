import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "web",
    // De Playwright-specs in e2e/ vallen buiten deze include en draaien met
    // `playwright test`, niet in Vitest. Geen eigen `exclude` hier: een
    // projectinstelling wint van de CLI-vlag `--exclude` waarmee `pnpm test`
    // de prestatietests uit de parallelle run houdt.
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Elke DB-test bouwt een eigen PGlite met de migraties: onder parallelle last duurt dat
    // 1,4 tot 2,9 s. De standaard van 5 s is dan te krap.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
