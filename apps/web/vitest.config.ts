import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "web",
    include: ["test/**/*.test.ts"],
    // De Playwright-specs in e2e/ draaien met `playwright test`, niet in Vitest.
    exclude: ["e2e/**", "**/node_modules/**"],
    environment: "node",
  },
});
