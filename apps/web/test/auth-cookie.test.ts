// Sessietokens staan leesbaar in `session.token` (zie de kop van server/auth/index.ts). Deze test
// legt vast waarom dat veilig genoeg is: het sessiecookie is `token.handtekening` (HMAC-SHA-256 met
// BETTER_AUTH_SECRET), en wie alleen het token uit de database heeft, krijgt geen sessie.
// Echte auth op PGlite, via de server-API, zonder HTTP-server.
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { type Auth, maakAuth } from "../server/auth";
import type { Db } from "../server/db";
import { session, user } from "../server/db/schema";
import { type Verzender, zetVerzender } from "../server/mail/verzend";
import { maakTestDb } from "./db";

const BASIS = "http://127.0.0.1:3000";
const GEHEIM = "vitest-geheim-alleen-voor-tests-0123456789abcdef";
const ANDER_GEHEIM = "een-ander-geheim-alleen-voor-tests-fedcba9876543210";
const WACHTWOORD = "lang-genoeg-1";
const EMAIL = "cookie@voorbeeld.be";

let db: Db;
let auth: Auth;
let cookieNaam: string;
let cookieWaarde: string;
let dbToken: string;

const verzamelaar: Verzender = { async verstuur() {} };

function headers(cookie?: string): Headers {
  const h = new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" });
  if (cookie) h.set("cookie", cookie);
  return h;
}

/** Zoals Better Auth het doet: `waarde.base64(HMAC-SHA-256(waarde, geheim))`, URL-gecodeerd. */
function onderteken(waarde: string, geheim: string): string {
  const handtekening = createHmac("sha256", geheim).update(waarde).digest("base64");
  return encodeURIComponent(`${waarde}.${handtekening}`);
}

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", GEHEIM);
  vi.stubEnv("BETTER_AUTH_URL", BASIS);
  zetVerzender(verzamelaar);
  db = await maakTestDb();
  auth = maakAuth(db);

  await auth.api.signUpEmail({
    body: { name: "Jan Peeters", email: EMAIL, password: WACHTWOORD, wachtendeBedrijfsnaam: "Peeters Elektro" },
    headers: headers(),
  });
  // Bevestigen zonder mail: de test wil alleen een sessie, geen mailstroom.
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, EMAIL));

  const { headers: antwoord } = await auth.api.signInEmail({
    body: { email: EMAIL, password: WACHTWOORD },
    headers: headers(),
    returnHeaders: true,
  });
  const sessieCookie = antwoord
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .find((c) => c.includes("session_token"));
  if (!sessieCookie) throw new Error("Geen sessiecookie in het antwoord.");
  const gelijk = sessieCookie.indexOf("=");
  cookieNaam = sessieCookie.slice(0, gelijk);
  cookieWaarde = sessieCookie.slice(gelijk + 1);

  const [rij] = await db.select().from(session);
  dbToken = rij!.token;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

async function sessieVoor(cookieWaardeOfNiets?: string) {
  const cookie = cookieWaardeOfNiets === undefined ? undefined : `${cookieNaam}=${cookieWaardeOfNiets}`;
  return auth.api.getSession({ headers: headers(cookie) });
}

describe("sessiecookie", () => {
  test("het cookie is token.handtekening, en het token in de database is het ongetekende deel", () => {
    expect(cookieNaam).toBe("better-auth.session_token");
    expect(decodeURIComponent(cookieWaarde)).toBe(`${dbToken}.${createHmac("sha256", GEHEIM).update(dbToken).digest("base64")}`);
  });

  test("controle: het ondertekende cookie geeft een sessie", async () => {
    const gevonden = await sessieVoor(cookieWaarde);
    expect(gevonden?.session.token).toBe(dbToken);
    expect(gevonden?.user.email).toBe(EMAIL);
  });

  test("alleen het token uit de database geeft geen sessie", async () => {
    expect(await sessieVoor(dbToken)).toBeNull();
    expect(await sessieVoor(encodeURIComponent(dbToken))).toBeNull();
  });

  test("het token met een handtekening van een ander geheim geeft geen sessie", async () => {
    expect(await sessieVoor(onderteken(dbToken, ANDER_GEHEIM))).toBeNull();
  });

  test("het token met een willekeurige handtekening van de juiste vorm geeft geen sessie", async () => {
    const nep = encodeURIComponent(`${dbToken}.${Buffer.alloc(32).toString("base64")}`);
    expect(nep).not.toBe(cookieWaarde);
    expect(await sessieVoor(nep)).toBeNull();
  });

  test("een geldige handtekening van het juiste geheim over dit token werkt (de controle klopt dus in beide richtingen)", async () => {
    expect((await sessieVoor(onderteken(dbToken, GEHEIM)))?.session.token).toBe(dbToken);
  });
});
