// Better Auth tegen PGlite, via de server-API (`auth.api.*`), zonder HTTP-server.
// Mails gaan naar een verzamelende verzender; er wordt niets echt verstuurd.
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, type MockInstance, test, vi } from "vitest";
import { type Auth, leesGeheim, maakAuth } from "../server/auth";
import type { Db } from "../server/db";
import { invitation, member, organization, session, user, verification } from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { maakTestDb } from "./db";

const BASIS = "http://127.0.0.1:3000";
const WACHTWOORD = "lang-genoeg-1";

let db: Db;
let auth: Auth;
const mails: Mail[] = [];
const verzamelaar: Verzender = {
  async verstuur(mail) {
    mails.push(mail);
  },
};
// Better Auth waarschuwt via console.warn bij geweigerde pogingen. Een test die dat verwacht,
// zet de tekst in `verwacht`; elke andere waarschuwing doet de test falen.
let waarschuwingen: MockInstance<typeof console.warn>;
let verwacht: string[] = [];

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", BASIS);
  zetVerzender(verzamelaar);
  waarschuwingen = vi.spyOn(console, "warn").mockImplementation(() => {});
  db = await maakTestDb();
  auth = maakAuth(db);
});

afterAll(() => {
  waarschuwingen.mockRestore();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  mails.length = 0;
  verwacht = [];
  waarschuwingen.mockClear();
});

afterEach(() => {
  const teksten = waarschuwingen.mock.calls.map((c) => String(c[0]));
  for (const tekst of teksten) {
    expect(verwacht.some((v) => tekst.includes(v)), `onverwachte waarschuwing: ${tekst}`).toBe(true);
  }
  for (const v of verwacht) {
    expect(teksten.some((t) => t.includes(v)), `verwachte waarschuwing ontbreekt: ${v}`).toBe(true);
  }
});

let teller = 0;
function nieuwAdres(): string {
  teller += 1;
  return `gebruiker${teller}@voorbeeld.be`;
}

function headers(): Headers {
  return new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" });
}

/** Wacht tot mails die op de achtergrond vertrekken, verzameld zijn. */
async function mailsVoor(adres: string): Promise<Mail[]> {
  await new Promise((r) => setTimeout(r, 0));
  return mails.filter((m) => m.aan === adres);
}

function linkUit(mail: Mail): URL {
  const gevonden = mail.tekst.match(/https?:\/\/\S+/);
  if (!gevonden) throw new Error(`Geen link in mail "${mail.onderwerp}"`);
  return new URL(gevonden[0]);
}

function cookiesUit(h: Headers): string {
  return h
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function registreer(email: string, wachtwoord = WACHTWOORD) {
  return auth.api.signUpEmail({
    body: { name: "Jan Peeters", email, password: wachtwoord, wachtendeBedrijfsnaam: "Peeters Elektro" },
    headers: headers(),
  });
}

/** Registreert en bevestigt een adres via de link uit de bevestigingsmail. */
async function bevestigdeGebruiker(email: string) {
  await registreer(email);
  const [bevestiging] = await mailsVoor(email);
  const token = linkUit(bevestiging!).searchParams.get("token");
  await auth.api.verifyEmail({ query: { token: token! }, headers: headers() });
  mails.length = 0;
}

/** Geen enkele rij in `verification` bevat de ruwe token uit een mail. */
async function verwachtNietOpgeslagen(token: string) {
  expect(token.length).toBeGreaterThanOrEqual(16);
  const rijen = await db.select().from(verification);
  for (const rij of rijen) {
    expect(rij.identifier).not.toContain(token);
    expect(rij.value).not.toContain(token);
  }
}

async function inloggen(email: string, wachtwoord = WACHTWOORD) {
  return auth.api.signInEmail({ body: { email, password: wachtwoord }, headers: headers() });
}

async function sessieHeaders(email: string): Promise<Headers> {
  const { headers: antwoord } = await auth.api.signInEmail({
    body: { email, password: WACHTWOORD },
    headers: headers(),
    returnHeaders: true,
  });
  const h = headers();
  h.set("cookie", cookiesUit(antwoord));
  return h;
}

describe("geheim", () => {
  test("zonder BETTER_AUTH_SECRET faalt het duidelijk, met verwijzing naar .env.example", () => {
    expect(() => leesGeheim({})).toThrow(/BETTER_AUTH_SECRET.*\.env\.example/);
  });

  test("in productie zonder geheim: fout", () => {
    expect(() => leesGeheim({ NODE_ENV: "production" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  test("de plaatshouder uit .env.example telt niet als geheim", () => {
    expect(() =>
      leesGeheim({ BETTER_AUTH_SECRET: "<vervang-door-een-lange-willekeurige-waarde>" }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  test("een geheim van 31 tekens is te kort, 32 tekens mag", () => {
    expect(() => leesGeheim({ BETTER_AUTH_SECRET: "x".repeat(31) })).toThrow(/32 tekens/);
    expect(() => leesGeheim({ BETTER_AUTH_SECRET: "x".repeat(31), NODE_ENV: "production" })).toThrow(
      /32 tekens/,
    );
    expect(leesGeheim({ BETTER_AUTH_SECRET: "x".repeat(32) })).toBe("x".repeat(32));
  });
});

describe("registreren en bevestigen", () => {
  test("registreren en daarna inloggen zonder bevestiging wordt geweigerd", async () => {
    const email = nieuwAdres();
    const geregistreerd = await registreer(email);
    expect(geregistreerd.token).toBeNull();

    const verstuurd = await mailsVoor(email);
    expect(verstuurd).toHaveLength(1);
    expect(verstuurd[0]!.onderwerp).toBe("Bevestig je e-mailadres bij Elentrik");
    expect(verstuurd[0]!.tekst).toContain("Dag Jan Peeters,");

    await expect(inloggen(email)).rejects.toMatchObject({ statusCode: 403 });
  });

  test("inloggen zonder bevestiging stuurt de bevestigingsmail opnieuw, en die link werkt", async () => {
    const email = nieuwAdres();
    await registreer(email);
    mails.length = 0;

    await expect(inloggen(email)).rejects.toMatchObject({ statusCode: 403 });
    const opnieuw = await mailsVoor(email);
    expect(opnieuw).toHaveLength(1);
    expect(opnieuw[0]!.onderwerp).toBe("Bevestig je e-mailadres bij Elentrik");

    const token = linkUit(opnieuw[0]!).searchParams.get("token")!;
    await auth.api.verifyEmail({ query: { token }, headers: headers() });
    expect((await inloggen(email)).token).toEqual(expect.any(String));
  });

  test("opnieuw registreren met een bestaand adres: zelfde vorm van antwoord, geen mail", async () => {
    const bestaand = nieuwAdres();
    await bevestigdeGebruiker(bestaand);
    const nieuw = nieuwAdres();

    const antwoordNieuw = await registreer(nieuw);
    mails.length = 0;
    const antwoordBestaand = await registreer(bestaand);

    expect(antwoordBestaand.token).toBeNull();
    expect(Object.keys(antwoordBestaand).sort()).toEqual(Object.keys(antwoordNieuw).sort());
    expect(Object.keys(antwoordBestaand.user).sort()).toEqual(Object.keys(antwoordNieuw.user).sort());
    expect(antwoordBestaand.user.email).toBe(bestaand);
    expect(await mailsVoor(bestaand)).toHaveLength(0);
    expect(await db.select().from(user).where(eq(user.email, bestaand))).toHaveLength(1);
  });

  test("de bevestigingstoken staat niet in de database", async () => {
    const email = nieuwAdres();
    await registreer(email);
    const [bevestiging] = await mailsVoor(email);
    const token = linkUit(bevestiging!).searchParams.get("token")!;
    await verwachtNietOpgeslagen(token);
  });

  test("de bevestigingslink uit de mail laat de gebruiker inloggen", async () => {
    const email = nieuwAdres();
    await registreer(email);
    const [bevestiging] = await mailsVoor(email);
    const link = linkUit(bevestiging!);
    expect(link.origin).toBe(BASIS);
    expect(link.pathname).toBe("/api/auth/verify-email");

    await auth.api.verifyEmail({ query: { token: link.searchParams.get("token")! }, headers: headers() });

    const ingelogd = await inloggen(email);
    expect(ingelogd.token).toEqual(expect.any(String));
    const [rij] = await db.select().from(user).where(eq(user.email, email));
    expect(rij!.emailVerified).toBe(true);
  });

  test("de bevestigingslink is 24 uur geldig", async () => {
    const email = nieuwAdres();
    await registreer(email);
    const [bevestiging] = await mailsVoor(email);
    const token = linkUit(bevestiging!).searchParams.get("token")!;
    const inhoud = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
    expect(inhoud.exp - inhoud.iat).toBe(24 * 3600);
  });

  test("een wachtwoord van 9 tekens wordt geweigerd, 10 tekens mag", async () => {
    verwacht = ["Password is too short"];
    const kort = nieuwAdres();
    await expect(registreer(kort, "123456789")).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.select().from(user).where(eq(user.email, kort))).toHaveLength(0);

    const lang = nieuwAdres();
    await registreer(lang, "1234567890");
    expect(await db.select().from(user).where(eq(user.email, lang))).toHaveLength(1);
  });

  test("de bedrijfsnaam uit de registratie wacht in wachtendeBedrijfsnaam", async () => {
    const email = nieuwAdres();
    await registreer(email);
    const [rij] = await db.select().from(user).where(eq(user.email, email));
    expect(rij!.wachtendeBedrijfsnaam).toBe("Peeters Elektro");
  });

  test("update-user kan wachtendeBedrijfsnaam niet zetten; de naam wijzigen mag wel", async () => {
    const email = nieuwAdres();
    await bevestigdeGebruiker(email);
    const h = await sessieHeaders(email);

    await expect(
      auth.api.updateUser({ body: { wachtendeBedrijfsnaam: "Kaper BV" }, headers: h }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      auth.api.updateUser({ body: { name: "Jan", wachtendeBedrijfsnaam: null }, headers: h }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await auth.api.updateUser({ body: { name: "Jan P." }, headers: h });
    const [rij] = await db.select().from(user).where(eq(user.email, email));
    expect(rij!.name).toBe("Jan P.");
    expect(rij!.wachtendeBedrijfsnaam).toBe("Peeters Elektro");
  });
});

describe("mail op de achtergrond", () => {
  test("een falende mailserver blokkeert de registratie niet; de log noemt alleen soort en foutcode", async () => {
    const fouten = vi.spyOn(console, "error").mockImplementation(() => {});
    zetVerzender({
      async verstuur(mail) {
        throw Object.assign(new Error(`Ontvanger ${mail.aan} geweigerd`), { code: "EENVELOPE" });
      },
    });
    try {
      const email = nieuwAdres();
      const geregistreerd = await registreer(email);
      expect(geregistreerd.user.email).toBe(email);
      await new Promise((r) => setTimeout(r, 0));
      expect(fouten).toHaveBeenCalledTimes(1);
      const gelogd = fouten.mock.calls.flat().map(String).join(" ");
      expect(gelogd).toBe("Mail (bevestiging) versturen mislukt: EENVELOPE");
      expect(gelogd).not.toContain(email);
    } finally {
      fouten.mockRestore();
      zetVerzender(verzamelaar);
    }
  });
});

describe("magic link", () => {
  test("een onbekend adres: geen account, geen mail, maar hetzelfde antwoord", async () => {
    const bekend = nieuwAdres();
    await bevestigdeGebruiker(bekend);
    const onbekend = nieuwAdres();

    const antwoordBekend = await auth.api.signInMagicLink({
      body: { email: bekend },
      headers: headers(),
      asResponse: true,
    });
    const antwoordOnbekend = await auth.api.signInMagicLink({
      body: { email: onbekend },
      headers: headers(),
      asResponse: true,
    });

    expect(antwoordOnbekend.status).toBe(200);
    expect(antwoordOnbekend.status).toBe(antwoordBekend.status);
    expect(await antwoordOnbekend.json()).toEqual(await antwoordBekend.json());
    expect(await mailsVoor(onbekend)).toHaveLength(0);
    expect(await mailsVoor(bekend)).toHaveLength(1);
    expect(await db.select().from(user).where(eq(user.email, onbekend))).toHaveLength(0);
  });

  test("een bekend adres krijgt een mail en de link geeft een sessie", async () => {
    const email = nieuwAdres();
    await bevestigdeGebruiker(email);

    const nu = Date.now();
    await auth.api.signInMagicLink({ body: { email }, headers: headers() });
    const [mail] = await mailsVoor(email);
    expect(mail!.onderwerp).toBe("Je inloglink voor Elentrik");
    const link = linkUit(mail!);
    expect(link.origin).toBe(BASIS);
    expect(link.pathname).toBe("/api/auth/magic-link/verify");

    // 15 minuten geldig.
    const rijen = await db.select().from(verification);
    const magic = rijen.filter((r) => r.value.includes('"magic-link"') && r.value.includes(email));
    expect(magic).toHaveLength(1);
    const duur = magic[0]!.expiresAt.getTime() - nu;
    expect(duur).toBeGreaterThan(15 * 60 * 1000 - 5000);
    expect(duur).toBeLessThanOrEqual(15 * 60 * 1000 + 5000);

    await verwachtNietOpgeslagen(link.searchParams.get("token")!);

    const resultaat = await auth.api.magicLinkVerify({
      query: { token: link.searchParams.get("token")! },
      headers: headers(),
    });
    expect(resultaat.user.email).toBe(email);
    const [rij] = await db.select().from(session).where(eq(session.token, resultaat.token));
    expect(rij).toBeDefined();
  });
});

describe("wachtwoord vergeten", () => {
  test("stuurt herstelMail en herstellen met het token werkt", async () => {
    verwacht = ["Invalid password"];
    const email = nieuwAdres();
    await bevestigdeGebruiker(email);

    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/wachtwoord-herstellen" },
      headers: headers(),
    });
    const [mail] = await mailsVoor(email);
    expect(mail!.onderwerp).toBe("Stel een nieuw wachtwoord in voor Elentrik");
    expect(mail!.tekst).toContain("Dag Jan Peeters,");
    const link = linkUit(mail!);
    expect(link.origin).toBe(BASIS);
    const token = link.pathname.split("/").at(-1)!;
    await verwachtNietOpgeslagen(token);

    await auth.api.resetPassword({ body: { newPassword: "nieuw-wachtwoord-2", token }, headers: headers() });

    await expect(inloggen(email)).rejects.toMatchObject({ statusCode: 401 });
    const ingelogd = await inloggen(email, "nieuw-wachtwoord-2");
    expect(ingelogd.token).toEqual(expect.any(String));
  });

  test("een onbekend adres krijgt geen mail en hetzelfde antwoord", async () => {
    verwacht = ["User not found"];
    const onbekend = nieuwAdres();
    const antwoord = await auth.api.requestPasswordReset({
      body: { email: onbekend, redirectTo: "/wachtwoord-herstellen" },
      headers: headers(),
    });
    expect(antwoord.status).toBe(true);
    expect(await mailsVoor(onbekend)).toHaveLength(0);
  });
});

describe("sessie", () => {
  test("een sessie duurt 30 dagen", async () => {
    const email = nieuwAdres();
    await bevestigdeGebruiker(email);
    const nu = Date.now();
    const ingelogd = await inloggen(email);
    const [rij] = await db.select().from(session).where(eq(session.token, ingelogd.token));
    const duur = rij!.expiresAt.getTime() - nu;
    expect(duur).toBeGreaterThan(30 * 24 * 3600 * 1000 - 5000);
    expect(duur).toBeLessThanOrEqual(30 * 24 * 3600 * 1000 + 5000);
  });
});

describe("organisaties", () => {
  test("de maker wordt eigenaar (owner); een uitnodiging stuurt uitnodigingMail met de juiste link", async () => {
    const email = nieuwAdres();
    await bevestigdeGebruiker(email);
    const h = await sessieHeaders(email);

    const org = await auth.api.createOrganization({
      body: { name: "Peeters Elektro", slug: `peeters-${teller}` },
      headers: h,
    });
    const leden = await db.select().from(member).where(eq(member.organizationId, org!.id));
    expect(leden).toHaveLength(1);
    expect(leden[0]!.role).toBe("owner");

    const gast = nieuwAdres();
    const nu = Date.now();
    const uitnodiging = await auth.api.createInvitation({
      body: { email: gast, role: "member", organizationId: org!.id },
      headers: h,
    });
    const [mail] = await mailsVoor(gast);
    expect(mail!.onderwerp).toBe("Jan Peeters nodigt je uit voor Peeters Elektro op Elentrik");
    expect(mail!.tekst).toContain("met de rol lid.");
    expect(linkUit(mail!).toString()).toBe(`${BASIS}/uitnodiging/${uitnodiging.id}`);

    const [rij] = await db.select().from(invitation).where(eq(invitation.id, uitnodiging.id));
    const duur = rij!.expiresAt.getTime() - nu;
    expect(duur).toBeGreaterThan(7 * 24 * 3600 * 1000 - 5000);
    expect(duur).toBeLessThanOrEqual(7 * 24 * 3600 * 1000 + 5000);
  });

  test("de rol admin bestaat niet", async () => {
    const email = nieuwAdres();
    await bevestigdeGebruiker(email);
    const h = await sessieHeaders(email);
    const org = await auth.api.createOrganization({
      body: { name: "Org zonder admin", slug: `zonder-admin-${teller}` },
      headers: h,
    });

    await expect(
      auth.api.createInvitation({
        // De types laten "admin" niet toe, maar over HTTP kan een client alles sturen.
        body: { email: nieuwAdres(), role: "admin" as "member", organizationId: org!.id },
        headers: h,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.select().from(invitation).where(eq(invitation.organizationId, org!.id))).toHaveLength(0);
  });

  test("addMember en updateMemberRole met admin worden geweigerd", async () => {
    const eigenaar = nieuwAdres();
    await bevestigdeGebruiker(eigenaar);
    const h = await sessieHeaders(eigenaar);
    const org = await auth.api.createOrganization({
      body: { name: "Rollen BV", slug: `rollen-${teller}` },
      headers: h,
    });
    const lidAdres = nieuwAdres();
    await bevestigdeGebruiker(lidAdres);
    const [lidRij] = await db.select().from(user).where(eq(user.email, lidAdres));

    await expect(
      auth.api.addMember({
        body: { userId: lidRij!.id, role: "admin" as "member", organizationId: org!.id },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.select().from(member).where(eq(member.userId, lidRij!.id))).toHaveLength(0);

    const lid = await auth.api.addMember({
      body: { userId: lidRij!.id, role: "member", organizationId: org!.id },
    });
    await expect(
      auth.api.updateMemberRole({
        body: { memberId: lid!.id, role: "admin" as "member", organizationId: org!.id },
        headers: h,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const [naWeigering] = await db.select().from(member).where(eq(member.id, lid!.id));
    expect(naWeigering!.role).toBe("member");
  });

  test("een organisatie verwijderen kan niet, ook niet door de eigenaar", async () => {
    const eigenaar = nieuwAdres();
    await bevestigdeGebruiker(eigenaar);
    const h = await sessieHeaders(eigenaar);
    const org = await auth.api.createOrganization({
      body: { name: "Blijft BV", slug: `blijft-${teller}` },
      headers: h,
    });

    await expect(
      auth.api.deleteOrganization({ body: { organizationId: org!.id }, headers: h }),
    ).rejects.toMatchObject({ statusCode: expect.any(Number) });
    expect(await db.select().from(organization).where(eq(organization.id, org!.id))).toHaveLength(1);
    expect(await db.select().from(member).where(eq(member.organizationId, org!.id))).toHaveLength(1);
  });
});
