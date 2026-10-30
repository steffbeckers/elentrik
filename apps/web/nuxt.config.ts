import { createRequire } from "node:module";
import { dirname } from "node:path";

// pdf.js haalt zijn binaire bronnen op via URL's; Nitro serveert ze rechtstreeks uit het pakket,
// zodat er niets in de repo wordt gekopieerd en niets van een CDN komt.
// Een publicAssets-map kan in Nitro geen afzonderlijke bestanden uitsluiten (alleen dir, baseURL,
// maxAge en fallthrough; de devserver serveert de hele map). `wasm/` gaat dus volledig mee, ook
// `quickjs-eval`; dat laadt alleen de scripting-sandbox van de pdf.js-viewer, die wij niet gebruiken.
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
  // De e2e-server (Playwright) bouwt in een eigen map, naast de ontwikkelserver.
  buildDir: process.env.ELENTRIK_BUILD_DIR || ".nuxt",
  modules: ["@nuxt/ui", "@pinia/nuxt", "@nuxtjs/i18n"],
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    // Alleen op de server: de basis-URL waarmee de auth-client tijdens SSR Better Auth aanspreekt.
    authBasisUrl: process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000",
  },
  vite: {
    // Alleen voor `nuxt build`: de server-build laat de imports van shared/ (relatieve imports uit app/)
    // extern, voor Nitro. Rolldown schrijft ze dan om naar een relatief pad dat in deze monorepo
    // naar een map buiten de repo wijst (".../apps/web/shared/taal.ts" niet gevonden) en de productiebuild
    // faalt. Met absolute paden vindt Nitro de bestanden en bundelt hij ze mee. De ontwikkelserver
    // gebruikt deze optie niet.
    build: { rolldownOptions: { makeAbsoluteExternalsRelative: false } },
  },
  nitro: {
    // Taken (server/tasks) en hun planning: de uurlijkse inhaaltaak voor gemiste Stripe-meldingen en
    // het dagelijkse opruimen van de prullenbak en van verweesde bestanden (04:00, tijdzone van de container).
    experimental: { tasks: true },
    scheduledTasks: { "0 * * * *": ["abonnementen:inhalen"], "0 4 * * *": ["bestanden:opruimen"] },
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
  // De taal van de interface (plan 8): geen prefix in de URL. De eerste keer de taal van de browser
  // (Accept-Language op de server), daarna de cookie `elentrik_taal`. Na het lezen van de sessie
  // wint `user.taal` (app/stores/sessie.ts); de terugvaltaal is nl. `fallbackLocale` voor
  // ontbrekende berichten staat in i18n/i18n.config.ts. De locales `language` dienen voor
  // `<html lang>` (app.vue); ze zijn dezelfde als `LOCALES` in shared/taal.ts.
  i18n: {
    strategy: "no_prefix",
    defaultLocale: "nl",
    langDir: "locales",
    locales: [
      { code: "nl", language: "nl-BE", file: "nl.json" },
      { code: "fr", language: "fr-BE", file: "fr.json" },
      { code: "en", language: "en-GB", file: "en.json" },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "elentrik_taal",
      // Met `no_prefix` stuurt de module nergens naar door; deze twee hebben dan geen effect. De
      // detectie gebeurt bij elke eerste lading van de app (SSR): eerst de cookie, dan Accept-Language.
      redirectOn: "root",
      alwaysRedirect: false,
      fallbackLocale: "nl",
    },
  },
});
