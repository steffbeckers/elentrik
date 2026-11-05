// Een fout bij het laden van code tijdens een navigatie (de service worker en de server hebben het
// bestand allebei niet, bv. bij een eerste bezoek zonder service worker of in een privévenster):
// dan herladen we op de pagina waar de gebruiker naartoe wilde, anders loopt de app daar vast.
//
// Dit vervangt de plugin `chunk-reload` van Nuxt (`emitRouteChunkError: "manual"`), met één verschil:
// een nieuwe build is hier géén reden om te herladen. Dat gaat alleen via de toast of het modale venster.
export default defineNuxtPlugin({
  name: "chunkfout",
  setup(nuxtApp) {
    const router = useRouter();
    const { app } = useRuntimeConfig();
    const chunkFouten = new Set<unknown>();

    // Een fout hoort bij de navigatie waarin hij optrad.
    router.beforeEach(() => {
      chunkFouten.clear();
    });

    nuxtApp.hook("app:chunkError", ({ error }) => {
      chunkFouten.add(error);
    });

    router.onError((fout, naar) => {
      if (!chunkFouten.has(fout)) return;
      reloadNuxtApp({ path: `${app.baseURL.replace(/\/+$/, "")}${naar.fullPath}`, persistState: true });
    });
  },
});
