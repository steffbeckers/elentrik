import { createRequire } from "node:module";
import { dirname } from "node:path";

// pdf.js haalt zijn binaire bronnen op via URL's; Nitro serveert ze rechtstreeks uit het pakket,
// zodat er niets in de repo wordt gekopieerd en niets van een CDN komt.
const pdfjsMap = dirname(
  createRequire(import.meta.url).resolve("pdfjs-dist/package.json"),
);
const pdfjsBron = (naam: string) => ({
  dir: `${pdfjsMap}/${naam}`,
  baseURL: `/pdfjs/${naam}`,
  maxAge: 60 * 60 * 24 * 365,
});

export default defineNuxtConfig({
  compatibilityDate: "2026-10-18",
  modules: ["@nuxt/ui", "@pinia/nuxt", "@nuxtjs/i18n"],
  css: ["~/assets/css/main.css"],
  nitro: {
    publicAssets: [
      pdfjsBron("wasm"),
      pdfjsBron("standard_fonts"),
      pdfjsBron("iccs"),
    ],
  },
  devServer: {
    host: "127.0.0.1",
  },
  typescript: {
    // Tests en tool-configs draaien in gewone Node (Vitest, drizzle-kit).
    nodeTsConfig: {
      compilerOptions: { types: ["node"] },
      include: [
        "../test/**/*",
        "../e2e/**/*",
        "../drizzle.config.ts",
        "../vitest.config.ts",
        "../playwright.config.ts",
      ],
    },
  },
  i18n: {
    strategy: "no_prefix",
    defaultLocale: "nl",
    locales: [{ code: "nl", language: "nl-BE", file: "nl.json" }],
  },
});
