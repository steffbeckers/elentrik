// De eerste organisatie bij de eerste bevestigde aanmelding, en de eenmalige overname van de
// bestaande lokale gegevens. Better Auth tegen PGlite via `auth.api.*`; mails gaan naar een
// verzamelende verzender. Expliciete imports (ruling E1).
import type { Partij } from "@elentrik/model";
import { eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, type MockInstance, test, vi } from "vitest";
import { type Auth, maakAuth } from "../server/auth";
import type { Db } from "../server/db";
import {
  bedrijfsinstellingen,
  bestanden,
  member,
  organization,
  projecten,
  session,
  user,
} from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { neemBestaandeGegevensOver } from "../server/organisaties/overname";
import { richtEersteOrganisatieIn } from "../server/organisaties/registratie";
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
let waarschuwingen: MockInstance<typeof console.warn>;

beforeAll(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", BASIS);
  zetVerzender(verzamelaar);
  waarschuwingen = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  waarschuwingen.mockRestore();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  mails.length = 0;
  waarschuwingen.mockClear();
  db = await maakTestDb();
  auth = maakAuth(db);
});

afterEach(() => {
  expect(waarschuwingen).not.toHaveBeenCalled();
});

function headers(): Headers {
  return new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" });
}

function tokenUit(mail: Mail): string {
  const gevonden = mail.tekst.match(/https?:\/\/\S+/);
  if (!gevonden) throw new Error(`Geen link in mail "${mail.onderwerp}"`);
  return new URL(gevonden[0]).searchParams.get("token")!;
}

/** Registreert; `bedrijf` null is een genodigde zonder eigen bedrijfsnaam. */
async function registreer(email: string, bedrijf: string | null) {
  return auth.api.signUpEmail({
    body: {
      name: "Jan Peeters",
      email,
      password: WACHTWOORD,
      ...(bedrijf === null ? {} : { wachtendeBedrijfsnaam: bedrijf }),
    },
    headers: headers(),
  });
}

/** Bevestigt via de link uit de mail; dat logt meteen in (de eerste bevestigde aanmelding). */
async function bevestig(email: string) {
  await new Promise((r) => setTimeout(r, 0));
  const mail = mails.find((m) => m.aan === email);
  await auth.api.verifyEmail({ query: { token: tokenUit(mail!) }, headers: headers() });
  mails.length = 0;
}

async function inloggen(email: string) {
  return auth.api.signInEmail({ body: { email, password: WACHTWOORD }, headers: headers() });
}

async function gebruikerId(email: string): Promise<string> {
  const [rij] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return rij!.id;
}

async function lidmaatschappen(email: string) {
  return db.select().from(member).where(eq(member.userId, await gebruikerId(email)));
}

const BESTAAND: Partij = {
  naam: "Elektro Bestaand BV",
  ondernemingsnummer: "BE0123.456.789",
  email: "info@bestaand.example",
};

/** Zaait wat de lokale versie vóór het inloggen had: 3 projecten, bedrijfsgegevens met logo. */
async function zaaiBestaandeGegevens(installateur: Partij = BESTAAND) {
  await db.insert(projecten).values([
    { naam: "Woning Peeters", document: {} },
    { naam: "Garage Janssens", document: {} },
    { naam: "Oud project", document: {}, verwijderd: new Date() },
  ]);
  const [logo] = await db
    .insert(bestanden)
    .values({ projectId: null, soort: "logo", mime: "image/png", grootte: 33, sleutel: "bedrijf/logo" })
    .returning({ id: bestanden.id });
  await db.insert(bedrijfsinstellingen).values({ id: 1, installateur: { ...installateur, logoBestandId: logo!.id } });
  return { logoId: logo!.id };
}

/** Een bevestigde gebruiker rechtstreeks in de database, zonder dat de hook al liep. */
async function maakGebruiker(email: string, wachtendeBedrijfsnaam: string | null, bevestigd = true) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: "Test", email, emailVerified: bevestigd, wachtendeBedrijfsnaam });
  return id;
}

async function maakSessie(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(session).values({
    id,
    userId,
    token: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 3600_000),
    updatedAt: new Date(),
  });
  return id;
}

describe("eerste bevestigde aanmelding", () => {
  test("de eerste gebruiker krijgt een organisatie met de 3 bestaande projecten en de bedrijfsgegevens", async () => {
    const { logoId } = await zaaiBestaandeGegevens();
    const email = "eerste@voorbeeld.be";

    await registreer(email, "Peeters Elektro");
    // Registreren alleen maakt nog niets aan.
    expect(await db.select().from(organization)).toHaveLength(0);

    await bevestig(email);

    const orgs = await db.select().from(organization);
    expect(orgs).toHaveLength(1);
    const org = orgs[0]!;
    expect(org.name).toBe("Peeters Elektro");
    expect(org.slug).toMatch(/^peeters-elektro-[a-z0-9]{6}$/);

    const leden = await lidmaatschappen(email);
    expect(leden).toHaveLength(1);
    expect(leden[0]!.organizationId).toBe(org.id);
    expect(leden[0]!.role).toBe("owner");

    // De sessie van de aanmelding heeft de organisatie actief.
    const sessies = await db.select().from(session).where(eq(session.userId, await gebruikerId(email)));
    expect(sessies).toHaveLength(1);
    expect(sessies[0]!.activeOrganizationId).toBe(org.id);

    const projectenVanOrg = await db.select().from(projecten).where(eq(projecten.organisatieId, org.id));
    expect(projectenVanOrg).toHaveLength(3);
    expect(await db.select().from(projecten).where(isNull(projecten.organisatieId))).toHaveLength(0);

    // De bestaande bedrijfsgegevens blijven ongewijzigd (spec 5b.6), nu van de organisatie.
    const rijen = await db.select().from(bedrijfsinstellingen);
    expect(rijen).toHaveLength(1);
    expect(rijen[0]!.id).toBe(1);
    expect(rijen[0]!.organisatieId).toBe(org.id);
    expect(rijen[0]!.installateur).toEqual({ ...BESTAAND, logoBestandId: logoId });

    const [logo] = await db.select().from(bestanden).where(eq(bestanden.id, logoId));
    expect(logo!.organisatieId).toBe(org.id);

    const [gebruiker] = await db.select().from(user).where(eq(user.email, email));
    expect(gebruiker!.wachtendeBedrijfsnaam).toBeNull();
  });

  test("een tweede gebruiker die zich daarna registreert, krijgt een lege organisatie", async () => {
    await zaaiBestaandeGegevens();
    await registreer("eerste@voorbeeld.be", "Peeters Elektro");
    await bevestig("eerste@voorbeeld.be");

    await registreer("tweede@voorbeeld.be", "Janssens BV");
    await bevestig("tweede@voorbeeld.be");

    const [lid] = await lidmaatschappen("tweede@voorbeeld.be");
    const [org] = await db.select().from(organization).where(eq(organization.id, lid!.organizationId));
    expect(org!.name).toBe("Janssens BV");
    expect(lid!.role).toBe("owner");
    expect(await db.select().from(projecten).where(eq(projecten.organisatieId, org!.id))).toHaveLength(0);

    // Eigen bedrijfsgegevens met de bedrijfsnaam; de overgenomen rij blijft bij de eerste.
    const [eigen] = await db
      .select()
      .from(bedrijfsinstellingen)
      .where(eq(bedrijfsinstellingen.organisatieId, org!.id));
    expect(eigen!.installateur).toEqual({ naam: "Janssens BV" });
    const [legacy] = await db.select().from(bedrijfsinstellingen).where(eq(bedrijfsinstellingen.id, 1));
    expect(legacy!.organisatieId).not.toBe(org!.id);
    expect(legacy!.installateur.naam).toBe(BESTAAND.naam);
  });

  test("opnieuw inloggen maakt geen tweede organisatie", async () => {
    await zaaiBestaandeGegevens();
    await registreer("eerste@voorbeeld.be", "Peeters Elektro");
    await bevestig("eerste@voorbeeld.be");

    await inloggen("eerste@voorbeeld.be");
    await auth.api.signInMagicLink({ body: { email: "eerste@voorbeeld.be" }, headers: headers() });
    await new Promise((r) => setTimeout(r, 0));
    await auth.api.magicLinkVerify({ query: { token: tokenUit(mails[0]!) }, headers: headers() });

    expect(await db.select().from(organization)).toHaveLength(1);
    expect(await lidmaatschappen("eerste@voorbeeld.be")).toHaveLength(1);
  });

  test("een genodigde zonder wachtendeBedrijfsnaam krijgt geen organisatie", async () => {
    await zaaiBestaandeGegevens();
    await registreer("genodigde@voorbeeld.be", null);
    await bevestig("genodigde@voorbeeld.be");

    expect(await db.select().from(organization)).toHaveLength(0);
    expect(await lidmaatschappen("genodigde@voorbeeld.be")).toHaveLength(0);
    const sessies = await db
      .select()
      .from(session)
      .where(eq(session.userId, await gebruikerId("genodigde@voorbeeld.be")));
    expect(sessies).toHaveLength(1);
    expect(sessies[0]!.activeOrganizationId).toBeNull();
    // Niets overgenomen.
    expect(await db.select().from(projecten).where(isNull(projecten.organisatieId))).toHaveLength(3);
    const [legacy] = await db.select().from(bedrijfsinstellingen).where(eq(bedrijfsinstellingen.id, 1));
    expect(legacy!.organisatieId).toBeNull();
  });

  test("installateur.naam wordt ingevuld als die nog leeg is; de rest blijft", async () => {
    const { logoId } = await zaaiBestaandeGegevens({ naam: "", telefoon: "+32 3 123 45 67" });
    await registreer("eerste@voorbeeld.be", "Peeters Elektro");
    await bevestig("eerste@voorbeeld.be");

    const [rij] = await db.select().from(bedrijfsinstellingen);
    expect(rij!.installateur).toEqual({ naam: "Peeters Elektro", telefoon: "+32 3 123 45 67", logoBestandId: logoId });
  });

  test("zonder bestaande gegevens krijgt de eerste gebruiker een lege organisatie met de bedrijfsnaam", async () => {
    await registreer("eerste@voorbeeld.be", "Peeters Elektro");
    await bevestig("eerste@voorbeeld.be");

    const [lid] = await lidmaatschappen("eerste@voorbeeld.be");
    const [rij] = await db.select().from(bedrijfsinstellingen);
    expect(rij!.organisatieId).toBe(lid!.organizationId);
    expect(rij!.installateur).toEqual({ naam: "Peeters Elektro" });
  });
});

describe("richtEersteOrganisatieIn", () => {
  test("niets te doen zonder wachtendeBedrijfsnaam: null", async () => {
    const id = await maakGebruiker("niets@voorbeeld.be", null);
    expect(await richtEersteOrganisatieIn(db, { id })).toBeNull();
    expect(await db.select().from(organization)).toHaveLength(0);
  });

  test("een onbevestigde gebruiker krijgt nog geen organisatie, de naam blijft wachten", async () => {
    const id = await maakGebruiker("onbevestigd@voorbeeld.be", "Wacht BV", false);
    expect(await richtEersteOrganisatieIn(db, { id })).toBeNull();
    expect(await db.select().from(organization)).toHaveLength(0);
    const [rij] = await db.select().from(user).where(eq(user.id, id));
    expect(rij!.wachtendeBedrijfsnaam).toBe("Wacht BV");
  });

  test("wie al lid is van een organisatie, krijgt er geen nieuwe; de wachtende naam vervalt", async () => {
    const id = await maakGebruiker("lid@voorbeeld.be", "Kaper BV");
    await db.insert(organization).values({ id: "org-a", name: "Bestaande", slug: "bestaande", createdAt: new Date() });
    await db.insert(member).values({ id: "lid-a", organizationId: "org-a", userId: id, role: "member", createdAt: new Date() });

    expect(await richtEersteOrganisatieIn(db, { id })).toBeNull();
    expect(await db.select().from(organization)).toHaveLength(1);
    const [rij] = await db.select().from(user).where(eq(user.id, id));
    expect(rij!.wachtendeBedrijfsnaam).toBeNull();
  });

  test("geeft het id van de nieuwe organisatie en maakt ze actief in de sessie", async () => {
    const id = await maakGebruiker("direct@voorbeeld.be", "Direct BV");
    const sessieId = await maakSessie(id);

    const orgId = await richtEersteOrganisatieIn(db, { id }, { sessieId });

    expect(orgId).toEqual(expect.any(String));
    const [sessie] = await db.select().from(session).where(eq(session.id, sessieId));
    expect(sessie!.activeOrganizationId).toBe(orgId);
  });

  test("faalt de overname halverwege, dan wordt niets overgenomen en geen organisatie gemaakt", async () => {
    const { logoId } = await zaaiBestaandeGegevens();
    const id = await maakGebruiker("faal@voorbeeld.be", "Peeters Elektro");
    const sessieId = await maakSessie(id);
    let gekoppeldVoorFout = 0;

    await expect(
      richtEersteOrganisatieIn(
        db,
        { id },
        {
          sessieId,
          tussenstap: async (tx) => {
            // De projecten zijn op dit moment al gekoppeld, binnen de transactie.
            const rijen = await tx.select().from(projecten).where(isNull(projecten.organisatieId));
            gekoppeldVoorFout = 3 - rijen.length;
            throw new Error("geïnjecteerde fout");
          },
        },
      ),
    ).rejects.toThrow("geïnjecteerde fout");

    expect(gekoppeldVoorFout).toBe(3);
    expect(await db.select().from(organization)).toHaveLength(0);
    expect(await db.select().from(member)).toHaveLength(0);
    expect(await db.select().from(projecten).where(isNull(projecten.organisatieId))).toHaveLength(3);
    const [legacy] = await db.select().from(bedrijfsinstellingen);
    expect(legacy!.organisatieId).toBeNull();
    expect(legacy!.installateur).toEqual({ ...BESTAAND, logoBestandId: logoId });
    const [logo] = await db.select().from(bestanden).where(eq(bestanden.id, logoId));
    expect(logo!.organisatieId).toBeNull();
    const [gebruiker] = await db.select().from(user).where(eq(user.id, id));
    expect(gebruiker!.wachtendeBedrijfsnaam).toBe("Peeters Elektro");
    const [sessie] = await db.select().from(session).where(eq(session.id, sessieId));
    expect(sessie!.activeOrganizationId).toBeNull();

    // Een volgende aanmelding probeert het opnieuw en slaagt.
    const orgId = await richtEersteOrganisatieIn(db, { id }, { sessieId });
    expect(await db.select().from(projecten).where(eq(projecten.organisatieId, orgId!))).toHaveLength(3);
  });
});

describe("neemBestaandeGegevensOver", () => {
  test("is idempotent: een tweede aanroep neemt niets meer over", async () => {
    const { logoId } = await zaaiBestaandeGegevens();
    await db.insert(organization).values({ id: "org-a", name: "A", slug: "a", createdAt: new Date() });

    expect(await neemBestaandeGegevensOver(db, "org-a")).toEqual({ projecten: 3, bedrijfsgegevens: true });
    expect(await neemBestaandeGegevensOver(db, "org-a")).toEqual({ projecten: 0, bedrijfsgegevens: false });

    expect(await db.select().from(projecten).where(eq(projecten.organisatieId, "org-a"))).toHaveLength(3);
    const [logo] = await db.select().from(bestanden).where(eq(bestanden.id, logoId));
    expect(logo!.organisatieId).toBe("org-a");
  });

  test("een tweede organisatie neemt niets meer over", async () => {
    await zaaiBestaandeGegevens();
    await db.insert(organization).values([
      { id: "org-a", name: "A", slug: "a", createdAt: new Date() },
      { id: "org-b", name: "B", slug: "b", createdAt: new Date() },
    ]);
    await neemBestaandeGegevensOver(db, "org-a");

    expect(await neemBestaandeGegevensOver(db, "org-b")).toEqual({ projecten: 0, bedrijfsgegevens: false });
    expect(await db.select().from(projecten).where(eq(projecten.organisatieId, "org-b"))).toHaveLength(0);
  });

  test("faalt een stap, dan rolt alles terug", async () => {
    const { logoId } = await zaaiBestaandeGegevens();
    await db.insert(organization).values({ id: "org-a", name: "A", slug: "a", createdAt: new Date() });

    await expect(
      neemBestaandeGegevensOver(db, "org-a", {
        tussenstap: async () => {
          throw new Error("geïnjecteerde fout");
        },
      }),
    ).rejects.toThrow("geïnjecteerde fout");

    expect(await db.select().from(projecten).where(isNull(projecten.organisatieId))).toHaveLength(3);
    const [legacy] = await db.select().from(bedrijfsinstellingen);
    expect(legacy!.organisatieId).toBeNull();
    const [logo] = await db.select().from(bestanden).where(eq(bestanden.id, logoId));
    expect(logo!.organisatieId).toBeNull();
  });
});
