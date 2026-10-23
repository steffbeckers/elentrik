// Bij elke navigatie: zonder sessie naar /inloggen (met de gevraagde pagina als `terug`), zonder
// organisatie naar /geen-organisatie. De beslissing zelf staat in `bestemming` (app/sessie).
//
// De sessie wordt één keer gelezen (tijdens SSR, met de cookies van het verzoek) en daarna uit de
// store gebruikt; inloggen, wisselen en uitloggen werken de store zelf bij.
import { bestemming, isPubliek } from "~/sessie/bestemming";
import { useSessieStore } from "~/stores/sessie";

export default defineNuxtRouteMiddleware(async (to) => {
  const sessie = useSessieStore();
  if (!sessie.geladen) {
    try {
      await sessie.laad();
    } catch {
      // De sessie is onbekend (de server antwoordt niet zoals verwacht, geen 401). Een publieke
      // pagina mag; een beschermde pagina nooit: dan de foutpagina, niet de pagina zelf. De
      // volgende navigatie probeert opnieuw.
      if (isPubliek(to.path)) return;
      return abortNavigation(createError({ statusCode: 503, statusMessage: "Sessie onbekend", fatal: true }));
    }
  }
  const doel = bestemming(to, sessie.sessieInfo);
  if (doel) return navigateTo(doel, { replace: true });
});
