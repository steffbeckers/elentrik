// Schrijfrecht: de schrijfroutes voor projecten roepen `vereisSchrijfrecht` aan, na de
// lidmaatschapscontrole en vóór elke wijziging. Zonder schrijfrecht volgt 402 en verandert er niets.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { createError } from "h3";
import { ABONNEMENT_VEREIST } from "../../shared/abonnement";
import { gebruikDb } from "../db";
import { gebruikAbonnementen } from "./config";
import { toegangVoor } from "./repo";

/** Gooit 402 `ABONNEMENT_VEREIST` (met `data.reden`) als de organisatie niet mag schrijven. */
export async function vereisSchrijfrecht(organisatieId: string): Promise<void> {
  const toegang = await toegangVoor(gebruikDb(), organisatieId, gebruikAbonnementen().config);
  if (toegang.schrijven) return;
  throw createError({
    statusCode: 402,
    statusMessage: "Een abonnement is nodig om te bewerken",
    data: { code: ABONNEMENT_VEREIST, reden: toegang.reden },
  });
}
