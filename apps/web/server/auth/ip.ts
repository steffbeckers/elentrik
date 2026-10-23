// Better Auth bepaalt het IP voor rate limiting uit x-forwarded-for. Die header komt van de client
// en is dus vrij te kiezen; zo zou elk verzoek een nieuwe teller krijgen. Daarom vervangt de
// auth-route hem door het IP van de socket en verwijdert ze x-real-ip.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).

/** Een kopie van het verzoek waarin alleen het socket-IP als client-IP staat. */
export function metSocketIp(verzoek: Request, ip: string | undefined): Request {
  const headers = new Headers(verzoek.headers);
  headers.delete("x-real-ip");
  if (ip) headers.set("x-forwarded-for", ip);
  else headers.delete("x-forwarded-for");
  return new Request(verzoek, { headers });
}
