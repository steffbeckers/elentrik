// Registreert de service worker (app/service-worker/sw.ts, gebouwd als /sw.js) die de code van een open
// app bewaart tijdens en na een update. Alleen in de productiebuild: in `nuxt dev` (en dus in de gewone
// e2e) is er geen /sw.js. Lukt de registratie niet, dan werkt de app gewoon zonder.
// Een nieuwe versie van /sw.js neemt zelf over (skipWaiting); er wordt nooit automatisch herladen.
export default defineNuxtPlugin({
  name: "service-worker",
  setup(nuxtApp) {
    if (import.meta.dev || !("serviceWorker" in navigator)) return;
    // Na het opbouwen van de pagina, zodat het binnenhalen van de bestanden de eerste lading niet vertraagt.
    nuxtApp.hook("app:mounted", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    });
  },
});
