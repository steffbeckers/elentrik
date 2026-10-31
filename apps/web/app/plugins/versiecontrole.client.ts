// De eigen versiecontrole (zie app/versie/controle.ts): elke 5 minuten, als het tabblad weer
// zichtbaar wordt en als de browser weer online komt. Ze haalt `latest.json` op (de nieuwste build)
// en `/api/gezondheid` (de header met de minimumversie gaat via de omhulling van `fetch` naar de store).
// Een nieuwe build komt in de store, die de toast toont; er wordt nooit automatisch herladen.
import { koppelVensters, maakVersiecontrole } from "~/versie/controle";
import { useVersieStore } from "~/stores/versie";

const INTERVAL_MS = 300_000;

export default defineNuxtPlugin({
  name: "versiecontrole",
  setup(nuxtApp) {
    const { app } = useRuntimeConfig();
    const store = () => useVersieStore(nuxtApp.$pinia as Parameters<typeof useVersieStore>[0]);
    // Dezelfde plek als waar Nuxt zelf `latest.json` zoekt (baseURL + buildAssetsDir).
    const latestUrl = `${app.baseURL}${app.buildAssetsDir}builds/latest.json`.replace(/\/+/g, "/");

    const controle = maakVersiecontrole({
      eigenBuildId: app.buildId,
      haalLaatsteBuildId: async () => {
        const antwoord = await fetch(latestUrl, { cache: "no-store" });
        if (!antwoord.ok) throw new Error(`latest.json: ${antwoord.status}`);
        const { id } = (await antwoord.json()) as { id: string };
        return id;
      },
      // Het antwoord zelf telt niet; de omhulling van `fetch` (clientversie.client.ts) leest de header.
      haalGezondheid: () => fetch("/api/gezondheid", { cache: "no-store" }),
      bijNieuweBuild: (id) => {
        store().meldBuild(id);
        // De service worker haalt de nieuwe bestanden alvast binnen, zodat ze klaarstaan bij het herladen.
        navigator.serviceWorker
          ?.getRegistration()
          .then((registratie) => registratie?.update())
          .catch(() => {});
      },
      intervalMs: INTERVAL_MS,
    });

    nuxtApp.hook("app:mounted", () => {
      controle.start();
      koppelVensters(controle, window);
    });
  },
});
