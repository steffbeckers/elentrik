// De publieke basis-URL van de app en de oorsprongen die we vertrouwen: voor Better Auth
// (`trustedOrigins`) en voor de CSRF-controle op de eigen routes (`defineBeveiligdeHandler`).
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

/** De publieke basis-URL uit BETTER_AUTH_URL, zonder slash op het einde. */
export function basisUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.BETTER_AUTH_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
}

/**
 * De oorsprong van de basis-URL. Wijst die naar 127.0.0.1, dan ook dezelfde poort op localhost:
 * wie lokaal http://localhost:3000 opent, praat met dezelfde server.
 */
export function vertrouwdeOorsprongen(basis: string = basisUrl()): string[] {
  const url = new URL(basis);
  const oorsprongen = [url.origin];
  if (url.hostname === "127.0.0.1") {
    url.hostname = "localhost";
    oorsprongen.push(url.origin);
  }
  return oorsprongen;
}
