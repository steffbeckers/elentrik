// Het compatibiliteitsgetal aan de kant van de browser: elk eigen /api-verzoek krijgt
// `X-Elentrik-Client`, en elk antwoord (ook een fout) geeft `X-Elentrik-Client-Minimum` aan de
// versie-store. Een 426 NIEUWE_VERSIE_VEREIST zet daar `vereist`. De store is de enige plek met de
// toestand; hier staat er niets.
//
// `enforce: "pre"`: vóór de andere plugins, zodat hun `$fetch` al de nieuwe is. Alleen in de
// browser: tijdens SSR gaat er geen oude client naar de eigen server.
import { CLIENT_COMPATIBILITEIT, CLIENT_HEADER, CLIENT_MINIMUM_HEADER } from "../../shared/clientversie";
import { useVersieStore } from "~/stores/versie";
import { isNieuweVersieFout } from "~/versie/regels";

export default defineNuxtPlugin({
  name: "clientversie",
  enforce: "pre",
  setup(nuxtApp) {
    // De store pas bij gebruik: Pinia is er bij een plugin die vóór alle andere draait misschien nog niet.
    const store = () => useVersieStore(nuxtApp.$pinia as Parameters<typeof useVersieStore>[0]);

    globalThis.$fetch = $fetch.create({
      onRequest({ request, options }) {
        const url = typeof request === "string" ? request : request instanceof URL ? request.pathname : request.url;
        if (!url.startsWith("/api/")) return;
        const headers = new Headers(options.headers);
        headers.set(CLIENT_HEADER, String(CLIENT_COMPATIBILITEIT));
        options.headers = headers;
      },
      // Draait ook bij een foutstatus: de fout wordt pas daarna gegooid.
      onResponse({ response }) {
        const minimum = response.headers.get(CLIENT_MINIMUM_HEADER);
        if (minimum !== null) store().meldServerversie(minimum);
        const data: unknown = response._data;
        if (isNieuweVersieFout({ status: response.status, data })) store().meldVereist();
      },
    });
  },
});
