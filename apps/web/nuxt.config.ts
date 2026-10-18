export default defineNuxtConfig({
  compatibilityDate: "2026-10-18",
  modules: ["@nuxt/ui", "@pinia/nuxt", "@nuxtjs/i18n"],
  css: ["~/assets/css/main.css"],
  devServer: {
    host: "127.0.0.1",
  },
  typescript: {
    // Tests en tool-configs draaien in gewone Node (Vitest, drizzle-kit).
    nodeTsConfig: {
      compilerOptions: { types: ["node"] },
      include: ["../test/**/*", "../drizzle.config.ts", "../vitest.config.ts"],
    },
  },
  i18n: {
    strategy: "no_prefix",
    defaultLocale: "nl",
    locales: [{ code: "nl", language: "nl-BE", file: "nl.json" }],
  },
});
