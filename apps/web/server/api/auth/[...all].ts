// Alle routes onder /api/auth gaan naar Better Auth, met het IP van de socket als client-IP
// (nooit een doorgestuurde header van de client), zodat rate limiting niet te omzeilen is.
// Organisatie-endpoints van Better Auth zijn van buitenaf dicht (404), behalve de expliciet
// toegelaten (server/auth/toegelaten.ts, ruling R7); de eigen routes vervangen ze.
import { createError, defineEventHandler, getRequestIP, toWebRequest } from "h3";
import { gebruikAuth } from "../../auth";
import { metSocketIp } from "../../auth/ip";
import { isGeweigerdAuthPad } from "../../auth/toegelaten";

export default defineEventHandler((event) => {
  const verzoek = toWebRequest(event);
  if (isGeweigerdAuthPad(new URL(verzoek.url).pathname)) {
    throw createError({ statusCode: 404, statusMessage: "Niet gevonden", data: { code: "NIET_GEVONDEN" } });
  }
  return gebruikAuth().handler(metSocketIp(verzoek, getRequestIP(event)));
});
