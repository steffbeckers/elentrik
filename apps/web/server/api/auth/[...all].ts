// Alle routes onder /api/auth gaan naar Better Auth, met het IP van de socket als client-IP
// (nooit een doorgestuurde header van de client), zodat rate limiting niet te omzeilen is.
import { defineEventHandler, getRequestIP, toWebRequest } from "h3";
import { gebruikAuth } from "../../auth";
import { metSocketIp } from "../../auth/ip";

export default defineEventHandler((event) =>
  gebruikAuth().handler(metSocketIp(toWebRequest(event), getRequestIP(event))),
);
