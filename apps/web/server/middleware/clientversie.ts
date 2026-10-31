// Het compatibiliteitsgetal op /api (zie shared/clientversie.ts): elk antwoord meldt het minimum,
// en een schrijfactie van een client met een ander getal krijgt 426. Ook het antwoord van de
// weigering meldt het minimum, zodat de client het kan lezen.
import { createError, defineEventHandler, getMethod, getRequestHeader, getRequestURL, setResponseHeader } from "h3";
import {
  CLIENT_COMPATIBILITEIT,
  CLIENT_HEADER,
  CLIENT_MINIMUM_HEADER,
  leesClientversie,
  moetWeigeren,
} from "../../shared/clientversie";

export default defineEventHandler((event) => {
  if (!getRequestURL(event).pathname.startsWith("/api/")) return;
  setResponseHeader(event, CLIENT_MINIMUM_HEADER, String(CLIENT_COMPATIBILITEIT));
  const client = leesClientversie(getRequestHeader(event, CLIENT_HEADER));
  if (!moetWeigeren(getMethod(event), client, CLIENT_COMPATIBILITEIT)) return;
  throw createError({
    statusCode: 426,
    statusMessage: "Nieuwe versie van de app vereist",
    data: { code: "NIEUWE_VERSIE_VEREIST" },
  });
});
