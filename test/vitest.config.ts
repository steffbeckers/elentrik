import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "wortel",
    include: ["*.test.ts"],
  },
});
