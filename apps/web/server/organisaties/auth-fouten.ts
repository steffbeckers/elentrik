// De fouten van de organization-API van Better Auth (`auth.api.*`) als h3-fouten met een code uit
// FOUTCODES, zodat de client ze vertaalt (`fouten.<CODE>`). De boodschap van Better Auth (Engels)
// gaat nooit mee. Een `APIError` die een gebruiker kan tegenkomen krijgt hier een eigen code. Een
// onbekende code met status 401, 403, 400 of 422 krijgt de algemene fout van die status
// (NIET_AANGEMELD, NIET_TOEGELATEN, ONGELDIGE_INVOER). Al de rest geeft `null`: een onbekende code
// met een andere status (404, 409, 410, 429, 5xx) en een fout die geen `APIError` is. De aanroeper
// gooit die ongewijzigd, zodat ze als gewone serverfout zonder eigen code bij de client komt.
//
// Een onbekend organisatie, lid of lidmaatschap is dezelfde 404 als elk ander onbekend object (zie
// server/fouten.ts): het verschil mag het bestaan van andermans gegevens niet verraden.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import type { H3Error } from "h3";
import type { Foutcode } from "../../shared/foutcodes";
import { maakFout, nietGevondenFout } from "../fouten";
import { LAATSTE_EIGENAAR, LAATSTE_EIGENAAR_FOUTTEKST } from "./regels";

/** Codes van Better Auth (en van onze eigen hooks) naar status, boodschap en eigen code. */
const AUTH_CODES: Record<string, [number, string, Foutcode]> = {
  ALLEEN_EIGENAAR: [403, "Alleen een eigenaar mag dit", "ALLEEN_EIGENAAR"],
  LAATSTE_EIGENAAR: [409, LAATSTE_EIGENAAR_FOUTTEKST, LAATSTE_EIGENAAR],
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: [409, LAATSTE_EIGENAAR_FOUTTEKST, LAATSTE_EIGENAAR],
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: [409, LAATSTE_EIGENAAR_FOUTTEKST, LAATSTE_EIGENAAR],
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: [409, "Dit adres is al lid", "AL_LID"],
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: [409, "Dit adres is al uitgenodigd", "AL_UITGENODIGD"],
  INVITATION_NOT_FOUND: [410, "Deze uitnodiging is niet meer geldig", "UITNODIGING_VERVALLEN"],
  INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION: [410, "Deze uitnodiging is niet meer geldig", "UITNODIGING_VERVALLEN"],
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: [403, "Deze uitnodiging is voor een ander adres", "UITNODIGING_ANDER_ADRES"],
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION: [403, "Bevestig eerst je e-mailadres", "EMAIL_NIET_BEVESTIGD"],
  EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION: [403, "Bevestig eerst je e-mailadres", "EMAIL_NIET_BEVESTIGD"],
  INVITATION_LIMIT_REACHED: [409, "Er staan al te veel uitnodigingen open", "UITNODIGINGEN_VOL"],
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: [409, "Het maximum aantal leden is bereikt", "LEDEN_VOL"],
};

/** Codes van Better Auth voor een onbekend organisatie, lid of lidmaatschap: de ene 404. */
const ONBEKEND_OBJECT: ReadonlySet<string> = new Set([
  "MEMBER_NOT_FOUND",
  "ORGANIZATION_NOT_FOUND",
  "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
  "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION",
]);

/** Komt deze fout (ergens in de keten van oorzaken) van de databasetrigger voor de laatste eigenaar? */
function isTriggerLaatsteEigenaar(f: unknown): boolean {
  for (let huidig: unknown = f; huidig && typeof huidig === "object"; huidig = (huidig as { cause?: unknown }).cause) {
    if ((huidig as { message?: unknown }).message === LAATSTE_EIGENAAR) return true;
  }
  return false;
}

/**
 * Een fout van `auth.api.*` als h3-fout, of `null` als ze geen vertaling krijgt. De databasetrigger
 * voor de laatste eigenaar (migratie 0005) wordt 409 `LAATSTE_EIGENAAR`. Geëxporteerd voor de test.
 */
export function vertaalAuthFout(fout: unknown): H3Error | null {
  if (isTriggerLaatsteEigenaar(fout)) return maakFout(409, LAATSTE_EIGENAAR_FOUTTEKST, LAATSTE_EIGENAAR);
  if (!fout || typeof fout !== "object" || !("statusCode" in fout) || !("body" in fout)) return null;
  const status = (fout as { statusCode: unknown }).statusCode;
  const code = ((fout as { body?: { code?: unknown } }).body ?? {}).code;
  if (typeof code === "string" && ONBEKEND_OBJECT.has(code)) return nietGevondenFout();
  const bekend = typeof code === "string" ? AUTH_CODES[code] : undefined;
  if (bekend) return maakFout(bekend[0], bekend[1], bekend[2]);
  if (status === 401) return maakFout(401, "Niet ingelogd", "NIET_AANGEMELD");
  if (status === 403) return maakFout(403, "Niet toegelaten", "NIET_TOEGELATEN");
  if (status === 400 || status === 422) return maakFout(400, "Ongeldige invoer", "ONGELDIGE_INVOER");
  return null;
}
