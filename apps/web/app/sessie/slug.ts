// Een unieke slug voor een nieuwe organisatie die de client via Better Auth aanmaakt: de naam in
// kleine letters zonder accenten, plus 6 willekeurige tekens. Dezelfde vorm als de server bij de
// eerste organisatie (server/organisaties/registratie.ts), maar met de Web Crypto API.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

const SLUG_TEKENS = "abcdefghijklmnopqrstuvwxyz0123456789";

export function maakSlug(naam: string): string {
  const basis = naam
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  const willekeurig = globalThis.crypto.getRandomValues(new Uint8Array(6));
  const achtervoegsel = Array.from(willekeurig, (b) => SLUG_TEKENS[b % SLUG_TEKENS.length]).join("");
  return `${basis || "organisatie"}-${achtervoegsel}`;
}
