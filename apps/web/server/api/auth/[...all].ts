// Alle routes onder /api/auth gaan naar Better Auth, met het client-IP dat de server zelf bepaalt
// (het IP van de socket, of cf-connecting-ip als de socket in het vertrouwde proxynet zit; nooit
// een doorgestuurde header van de client), zodat rate limiting niet te omzeilen is.
// Organisatie-endpoints van Better Auth zijn van buitenaf dicht (404), behalve de expliciet
// toegelaten (server/auth/toegelaten.ts, ruling R7); de eigen routes vervangen ze.
import { defineEventHandler, toWebRequest } from "h3";
import { gebruikAuth } from "../../auth";
import { metSocketIp, verzoekIp } from "../../auth/ip";
import { isGeweigerdAuthPad } from "../../auth/toegelaten";
import { nietGevondenFout } from "../../fouten";

export default defineEventHandler((event) => {
  const verzoek = toWebRequest(event);
  if (isGeweigerdAuthPad(new URL(verzoek.url).pathname)) {
    throw nietGevondenFout();
  }
  return gebruikAuth().handler(metSocketIp(verzoek, verzoekIp(event)));
});
