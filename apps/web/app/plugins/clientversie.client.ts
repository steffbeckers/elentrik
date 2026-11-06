// Het compatibiliteitsgetal aan de kant van de browser: elk eigen /api-verzoek krijgt
// `X-Elentrik-Client`, en actuele API-antwoorden geven `X-Elentrik-Client-Minimum` aan de
// versie-store. Cachebare iconen/bestanden bepalen de versie niet. Een 426 NIEUWE_VERSIE_VEREIST
// zet daar wel altijd `vereist`. De store is de enige plek met de
// toestand; hier staat er niets. De omhulling zelf staat in app/versie/fetch.ts, op `fetch` (niet op
// `$fetch`: zie daar waarom).
//
// `enforce: "pre"`: vóór de andere plugins, zodat hun eerste verzoek al meetelt. Alleen in de
// browser: tijdens SSR gaat er geen oude client naar de eigen server.
import { CLIENT_COMPATIBILITEIT } from "../../shared/clientversie";
import { useVersieStore } from "~/stores/versie";
import { omhulFetch } from "~/versie/fetch";

export default defineNuxtPlugin({
  name: "clientversie",
  enforce: "pre",
  setup(nuxtApp) {
    // De store pas bij gebruik: Pinia is er bij een plugin die vóór alle andere draait misschien nog niet.
    const store = () => useVersieStore(nuxtApp.$pinia as Parameters<typeof useVersieStore>[0]);

    window.fetch = omhulFetch(window.fetch, {
      origin: location.origin,
      eigenGetal: CLIENT_COMPATIBILITEIT,
      bijServerversie: (waarde) => store().meldServerversie(waarde),
      bijVereist: () => store().meldVereist(),
    });
  },
});
