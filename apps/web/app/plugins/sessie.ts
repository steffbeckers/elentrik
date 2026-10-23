// Geeft de sessie-store haar API. Tijdens SSR gaat de cookie van het verzoek mee naar /api/mij,
// zodat de server de sessie kent en de middleware al op de server doorverwijst: een beschermde
// pagina flitst nooit even op vóór de doorverwijzing. Verlengt Better Auth daarbij de sessie, dan
// gaat de nieuwe cookie mee in het antwoord van de pagina (app/sessie/ssr.ts).
//
// `zetLocale` zet na het lezen van de sessie de taal van het account (`setLocale` van de i18n-module
// zet ook de cookie `elentrik_taal`). Tijdens SSR gebeurt dat in de middleware, vóór het renderen:
// de eerste HTML is dus al in de taal van het account.
import { appendResponseHeader } from "h3";
import { haalMijOpServer } from "~/sessie/ssr";
import { useSessieStore, type Mij } from "~/stores/sessie";

export default defineNuxtPlugin((nuxtApp) => {
  const event = import.meta.server ? useRequestEvent() : undefined;
  const cookie = import.meta.server ? useRequestHeader("cookie") : undefined;

  useSessieStore().gebruikApi({
    mij: () =>
      event
        ? haalMijOpServer({
            haalRuw: (pad, opties) => $fetch.raw<Mij>(pad, opties),
            cookie: cookie ?? undefined,
            voegCookieToe: (waarde) => appendResponseHeader(event, "set-cookie", waarde),
          })
        : $fetch<Mij>("/api/mij"),
    async wisselActief(organisatieId) {
      await $fetch("/api/organisaties/actief", { method: "POST", body: { organisatieId } });
    },
    async uitloggen() {
      const { error } = await useAuthClient().signOut();
      if (error) throw error;
    },
    zetLocale: (taal) => nuxtApp.runWithContext(() => nuxtApp.$i18n.setLocale(taal)),
  });
});
