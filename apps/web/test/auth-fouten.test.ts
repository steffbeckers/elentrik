// De vertaling van de APIError's van Better Auth (organisaties, uitnodigingen, leden) naar een
// h3-fout met een code uit FOUTCODES (plan 12, Task 6). Wat de gebruiker kan tegenkomen krijgt een
// eigen code met een vertaling; een onbekende APIError geeft `null` en blijft de algemene fout.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { isFoutcode } from "../shared/foutcodes";
import { nietGevondenFout } from "../server/fouten";
import { vertaalAuthFout } from "../server/organisaties/auth-fouten";

/** Een fout zoals `auth.api.*` ze gooit: `statusCode` en `body.code`. */
function apiFout(statusCode: number, code?: string) {
  return { statusCode, body: code === undefined ? { message: "x" } : { code, message: "Engelse tekst" } };
}

const WEB = join(import.meta.dirname, "..");

const BEKEND: [string, number, number, string][] = [
  // [code van Better Auth, status van Better Auth, onze status, onze code]
  ["ALLEEN_EIGENAAR", 403, 403, "ALLEEN_EIGENAAR"],
  ["LAATSTE_EIGENAAR", 409, 409, "LAATSTE_EIGENAAR"],
  ["YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER", 400, 409, "LAATSTE_EIGENAAR"],
  ["YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER", 400, 409, "LAATSTE_EIGENAAR"],
  ["USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION", 400, 409, "AL_LID"],
  ["USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION", 400, 409, "AL_UITGENODIGD"],
  ["INVITATION_NOT_FOUND", 400, 410, "UITNODIGING_VERVALLEN"],
  ["INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION", 400, 410, "UITNODIGING_VERVALLEN"],
  ["YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION", 403, 403, "UITNODIGING_ANDER_ADRES"],
  ["EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION", 403, 403, "EMAIL_NIET_BEVESTIGD"],
  ["EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION", 403, 403, "EMAIL_NIET_BEVESTIGD"],
  ["INVITATION_LIMIT_REACHED", 403, 409, "UITNODIGINGEN_VOL"],
  ["ORGANIZATION_MEMBERSHIP_LIMIT_REACHED", 403, 409, "LEDEN_VOL"],
];

describe("vertaalAuthFout", () => {
  test.each(BEKEND)("%s wordt %i-> %i %s", (code, status, onzeStatus, onzeCode) => {
    const fout = vertaalAuthFout(apiFout(status, code));
    expect(fout).not.toBeNull();
    expect(fout).toMatchObject({ statusCode: onzeStatus, data: { code: onzeCode } });
    expect(isFoutcode(onzeCode)).toBe(true);
  });

  test("een onbekend organisatie, lid of lidmaatschap is dezelfde 404 als elk onbekend object", () => {
    const verwacht = nietGevondenFout();
    for (const code of [
      "MEMBER_NOT_FOUND",
      "ORGANIZATION_NOT_FOUND",
      "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
      "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION",
    ]) {
      const fout = vertaalAuthFout(apiFout(400, code));
      expect(fout?.statusCode, code).toBe(verwacht.statusCode);
      expect(fout?.statusMessage, code).toBe(verwacht.statusMessage);
      expect(fout?.data, code).toEqual(verwacht.data);
    }
  });

  test("een recht dat ontbreekt (YOU_ARE_NOT_ALLOWED_TO_...) is de algemene 403 NIET_TOEGELATEN", () => {
    for (const code of [
      "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION",
      "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION",
      "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE",
      "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION",
      "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
      "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
    ]) {
      expect(vertaalAuthFout(apiFout(403, code)), code).toMatchObject({ statusCode: 403, data: { code: "NIET_TOEGELATEN" } });
    }
  });

  test("een onbekende code met een 400 of 401 geeft de algemene fout van die status", () => {
    expect(vertaalAuthFout(apiFout(400, "ROLE_NOT_FOUND"))).toMatchObject({
      statusCode: 400,
      data: { code: "ONGELDIGE_INVOER" },
    });
    expect(vertaalAuthFout(apiFout(401))).toMatchObject({ statusCode: 401, data: { code: "NIET_AANGEMELD" } });
  });

  test("een fout die geen APIError van Better Auth is, of een 5xx: null (de aanroeper gooit hem ongewijzigd)", () => {
    expect(vertaalAuthFout(new Error("kapot"))).toBeNull();
    expect(vertaalAuthFout(null)).toBeNull();
    expect(vertaalAuthFout("tekst")).toBeNull();
    expect(vertaalAuthFout(apiFout(500, "INTERNAL"))).toBeNull();
  });

  test("de boodschap van Better Auth gaat nooit mee", () => {
    const fout = vertaalAuthFout(apiFout(400, "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION"));
    expect(JSON.stringify(fout?.toJSON())).not.toContain("Engelse tekst");
  });
});

describe("vertalingen van de Better Auth-fouten", () => {
  test("elke nieuwe code heeft een vertaling in nl, fr en en", () => {
    for (const taal of ["nl", "fr", "en"]) {
      const json = JSON.parse(readFileSync(join(WEB, `i18n/locales/${taal}.json`), "utf8")) as {
        fouten: Record<string, string>;
      };
      for (const code of [
        "UITNODIGINGEN_VOL",
        "LEDEN_VOL",
        "ORGANIZATION_ALREADY_EXISTS",
        "ORGANIZATION_SLUG_ALREADY_TAKEN",
      ]) {
        expect(isFoutcode(code), code).toBe(true);
        expect(json.fouten[code], `${taal}.${code}`).toBeTruthy();
      }
    }
  });
});
