// Bij elke navigatie: zonder sessie naar /inloggen (met de gevraagde pagina als `terug`), zonder
// organisatie naar /geen-organisatie. De beslissing zelf staat in `bestemming` (app/sessie).
//
// De sessie wordt één keer gelezen (tijdens SSR, met de cookies van het verzoek) en daarna uit de
// store gebruikt; inloggen, wisselen en uitloggen werken de store zelf bij.
import { bestemming } from "~/sessie/bestemming";
import { useSessieStore } from "~/stores/sessie";

export default defineNuxtRouteMiddleware(async (to) => {
  const sessie = useSessieStore();
  if (!sessie.geladen) {
    try {
      await sessie.laad();
    } catch {
      // De server antwoordt niet zoals verwacht (geen 401): de pagina toont zelf de laadfout van
      // haar gegevens, die zonder sessie toch niet lukken. De volgende navigatie probeert opnieuw.
      return;
    }
  }
  const doel = bestemming(to, sessie.gebruiker ? { actieveOrganisatieId: sessie.actieveOrganisatieId } : null);
  if (doel) return navigateTo(doel, { replace: true });
});
