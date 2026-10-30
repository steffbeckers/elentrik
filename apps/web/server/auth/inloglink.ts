// De links in een mail: Better Auth verifieert de token op GET /api/auth/magic-link/verify (de
// inloglink) of GET /api/auth/verify-email (de bevestiging van het adres), maakt een sessie (met de
// sessiehook van server/auth/index.ts) en stuurt door. Faalt er na een geldige link iets aan de
// serverkant (de hook, de database), dan antwoordt Better Auth met een kale 500. Wie op een link in
// een mail klikte, krijgt dan liever /inloggen met een melding en de knop voor een nieuwe link, en
// de oorspronkelijke bestemming (`callbackURL`, bv. een uitnodiging) blijft als `terug` bewaard.
//
// Alleen een serverfout (5xx of een gegooide fout) van deze paden wordt zo omgezet. Een ongeldige of
// verlopen token is een 4xx of een redirect van Better Auth zelf, en andere auth-paden blijven
// ongemoeid: een fout elders mag niet stil verdwijnen.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks (ruling E1).
import { INLOGLINK_MISLUKT } from "../../shared/inloglink";
import { veiligTerugpad } from "../../shared/terugpad";

/** Het pad waar de inloglink uit de mail op uitkomt. */
export const INLOGLINK_PAD = "/api/auth/magic-link/verify";

/** Het pad waar de bevestigingslink van het e-mailadres op uitkomt. */
export const BEVESTIGING_PAD = "/api/auth/verify-email";

/** De paden (alleen GET) waarvan een serverfout een redirect naar /inloggen wordt. */
const LINKPADEN: ReadonlySet<string> = new Set([INLOGLINK_PAD, BEVESTIGING_PAD]);

/** Het doel van de redirect; een relatief pad, de browser blijft op dezelfde oorsprong. */
const MISLUKT_DOEL = `/inloggen?fout=${INLOGLINK_MISLUKT}`;

/**
 * Het doel van de redirect, met de `callbackURL` van het verzoek als `terug` als die een veilig
 * relatief pad is. Alles anders (een schema, `//`, een lege waarde) valt weg.
 */
function misluktDoel(verzoek: Request): string {
  const terug = veiligTerugpad(new URL(verzoek.url).searchParams.get("callbackURL"));
  // De standaardbestemming is `/`; die hoeft niet mee.
  return terug === null || terug === "/" ? MISLUKT_DOEL : `${MISLUKT_DOEL}&terug=${encodeURIComponent(terug)}`;
}

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
  return verzoek.method === "GET" && LINKPADEN.has(new URL(verzoek.url).pathname);
}

function mislukt(verzoek: Request): Response {
  return new Response(null, { status: 302, headers: { location: misluktDoel(verzoek) } });
}

/**
 * Voert `afhandelaar` uit. Is het de verificatie van een inloglink of een bevestigingslink en eindigt
 * die in een serverfout (status 500 of hoger, of een gegooide fout), dan een 302 naar
 * `/inloggen?fout=INLOGLINK_MISLUKT`, met `&terug=<callbackURL>` als die een veilig relatief pad is.
 * Het log noemt alleen het pad (zonder query), de statuscode of de soort fout: nooit het adres, de token of de boodschap.
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
    console.error(`Inloglink verifiëren mislukt op ${new URL(verzoek.url).pathname}: ${foutSoort(fout)}`);
    return mislukt(verzoek);
  }
  if (antwoord.status < 500) return antwoord;
  console.error(`Inloglink verifiëren mislukt op ${new URL(verzoek.url).pathname}: status ${antwoord.status}`);
  return mislukt(verzoek);
}
