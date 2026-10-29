// Better Auth bepaalt het IP voor rate limiting uit x-forwarded-for. Die header komt van de client
// en is dus vrij te kiezen; zo zou elk verzoek een nieuwe teller krijgen. Daarom vervangt de
// auth-route hem door het client-IP dat de server zelf bepaalt, en verwijdert ze x-real-ip.
//
// Achter de Cloudflare Tunnel is het socket-IP dat van de tunnelcontainer. Komt het verzoek uit het
// vertrouwde subnet (ELENTRIK_VERTROUWD_PROXYNET), dan geldt cf-connecting-ip als client-IP;
// Cloudflare zet die header zelf en een client kan hem niet kiezen. Komt het verzoek ergens
// anders vandaan, dan telt de header niet mee.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { getRequestIP, type H3Event } from "h3";
import { inSubnet, isIp } from "../net";

/** Een kopie van het verzoek waarin alleen `ip` als client-IP staat. */
export function metSocketIp(verzoek: Request, ip: string | undefined): Request {
  const headers = new Headers(verzoek.headers);
  headers.delete("x-real-ip");
  if (ip) headers.set("x-forwarded-for", ip);
  else headers.delete("x-forwarded-for");
  return new Request(verzoek, { headers });
}

/**
 * Het IP van de bezoeker: `cf-connecting-ip` als de socket in `vertrouwdNet` (een CIDR) valt en de
 * header een geldig IP is; anders het IP van de socket. x-forwarded-for en x-real-ip tellen nooit mee.
 */
export function clientIp(
  headers: Headers,
  socketIp: string | undefined,
  vertrouwdNet: string | undefined,
): string | undefined {
  const net = vertrouwdNet?.trim();
  if (!socketIp || !net || !inSubnet(socketIp, net)) return socketIp;
  const doorgegeven = headers.get("cf-connecting-ip")?.trim();
  return doorgegeven && isIp(doorgegeven) ? doorgegeven : socketIp;
}

/** Het IP van de bezoeker van dit verzoek, met het vertrouwde net uit de omgeving. */
export function verzoekIp(event: H3Event, env: Record<string, string | undefined> = process.env): string | undefined {
  return clientIp(event.headers, getRequestIP(event), env.ELENTRIK_VERTROUWD_PROXYNET);
}
