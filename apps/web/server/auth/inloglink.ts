// De inloglink: Better Auth verifieert de token op GET /api/auth/magic-link/verify, maakt een sessie
// (met de sessiehook van server/auth/index.ts) en stuurt door. Faalt er na een geldige link iets aan
// de serverkant (de hook, de database), dan antwoordt Better Auth met een kale 500. Wie op een link
// in een mail klikte, krijgt dan liever /inloggen met een melding en de knop voor een nieuwe link.
//
// Alleen een serverfout (5xx of een gegooide fout) van dit ene pad wordt zo omgezet. Een ongeldige of
// verlopen token is een 4xx of een redirect van Better Auth zelf, en andere auth-paden blijven
// ongemoeid: een fout elders mag niet stil verdwijnen.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks (ruling E1).
import { INLOGLINK_MISLUKT } from "../../shared/inloglink";

/** Het pad waar de link uit de mail op uitkomt. */
export const INLOGLINK_PAD = "/api/auth/magic-link/verify";

/** Het doel van de redirect; een relatief pad, de browser blijft op dezelfde oorsprong. */
const MISLUKT_DOEL = `/inloggen?fout=${INLOGLINK_MISLUKT}`;

/** Naam of code van een fout, zonder de boodschap (die kan een adres of token bevatten). */
function foutSoort(fout: unknown): string {
  if (fout && typeof fout === "object") {
    const code = (fout as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(code)) return code;
    if (fout instanceof Error) return fout.name;
  }
  return "onbekend";
}

function isVerificatie(verzoek: Request): boolean {
  return verzoek.method === "GET" && new URL(verzoek.url).pathname === INLOGLINK_PAD;
}

function mislukt(): Response {
  return new Response(null, { status: 302, headers: { location: MISLUKT_DOEL } });
}

/**
 * Voert `afhandelaar` uit. Is het de verificatie van een inloglink en eindigt die in een serverfout
 * (status 500 of hoger, of een gegooide fout), dan een 302 naar `/inloggen?fout=INLOGLINK_MISLUKT`.
 * Het log noemt alleen de statuscode of de soort fout: nooit het adres, de token of de boodschap.
 */
export async function metInloglinkVangnet(
  verzoek: Request,
  afhandelaar: (verzoek: Request) => Promise<Response> | Response,
): Promise<Response> {
  if (!isVerificatie(verzoek)) return afhandelaar(verzoek);
  let antwoord: Response;
  try {
    antwoord = await afhandelaar(verzoek);
  } catch (fout) {
    console.error(`Inloglink verifiëren mislukt: ${foutSoort(fout)}`);
    return mislukt();
  }
  if (antwoord.status < 500) return antwoord;
  console.error(`Inloglink verifiëren mislukt: status ${antwoord.status}`);
  return mislukt();
}
