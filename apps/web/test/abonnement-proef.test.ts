// De proefperiode per eerste eigen bedrijf, op beide aanmaakpaden, en de migratie. Better Auth
// tegen PGlite via `auth.api.*`. Expliciete imports (ruling E1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { kenProefperiodeToe } from "../server/abonnementen/proef";
import { type Auth, maakAuth } from "../server/auth";
import type { Db } from "../server/db";
import { invitation, member, organization, user } from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { richtEersteOrganisatieIn } from "../server/organisaties/registratie";
import { maakTestDb, maakTestOrganisatie } from "./db";

const BASIS = "http://127.0.0.1:3000";
const WACHTWOORD = "lang-genoeg-1";
const DAG = 24 * 3600 * 1000;

let db: Db;
let auth: Auth;
const mails: Mail[] = [];
const verzamelaar: Verzender = {
  async verstuur(mail) {
    mails.push(mail);
  },
};

beforeAll(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", BASIS);
  zetVerzender(verzamelaar);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  mails.length = 0;
  db = await maakTestDb();
  auth = maakAuth(db);
});

function headers(cookie?: string): Headers {
  const h = new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" });
  if (cookie) h.set("cookie", cookie);
  return h;
}

function tokenUit(mail: Mail): string {
  return new URL(mail.tekst.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
}

/** Registreert en bevestigt (dat logt meteen in en richt de eerste organisatie in). */
async function registreer(email: string, bedrijf: string | null): Promise<string> {
  await auth.api.signUpEmail({
    body: {
      name: "Jan Peeters",
      email,
      password: WACHTWOORD,
      ...(bedrijf === null ? {} : { wachtendeBedrijfsnaam: bedrijf }),
    },
    headers: headers(),
  });
  await new Promise((r) => setTimeout(r, 0));
  const mail = mails.find((m) => m.aan === email);
  await auth.api.verifyEmail({ query: { token: tokenUit(mail!) }, headers: headers() });
  mails.length = 0;
  const [rij] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return rij!.id;
}

async function sessieHeaders(email: string): Promise<Headers> {
  const { headers: antwoord } = await auth.api.signInEmail({
    body: { email, password: WACHTWOORD },
    headers: headers(),
    returnHeaders: true,
  });
  return headers(
    antwoord
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  );
}

async function proefGebruikt(userId: string): Promise<boolean> {
  const [rij] = await db.select({ p: user.proefGebruikt }).from(user).where(eq(user.id, userId));
  return rij!.p;
}

async function proefEinde(organisatieId: string): Promise<Date> {
  const [rij] = await db
    .select({ p: organization.proefEinde })
    .from(organization)
    .where(eq(organization.id, organisatieId));
  return rij!.p;
}

function ongeveer(waarde: Date, verwacht: number, marge = 5000) {
  expect(Math.abs(waarde.getTime() - verwacht)).toBeLessThan(marge);
}

async function maakGebruiker(email: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: "Test", email, emailVerified: true });
  return id;
}

describe("kenProefperiodeToe", () => {
  test("de eerste keer 30 dagen en proefGebruikt; de tweede keer voor dezelfde gebruiker nu", async () => {
    const gebruikerId = await maakGebruiker("a@voorbeeld.be");
    const eerste = await maakTestOrganisatie(db, "Eerste");
    const tweede = await maakTestOrganisatie(db, "Tweede");
    const nu = new Date("2026-11-01T12:00:00Z");

    expect(await proefGebruikt(gebruikerId)).toBe(false);
    const einde1 = await kenProefperiodeToe(db, { organisatieId: eerste, gebruikerId, nu });
    expect(einde1).toEqual(new Date(nu.getTime() + 30 * DAG));
    expect(await proefGebruikt(gebruikerId)).toBe(true);
    expect(await proefEinde(eerste)).toEqual(einde1);

    const einde2 = await kenProefperiodeToe(db, { organisatieId: tweede, gebruikerId, nu });
    expect(einde2).toEqual(nu);
    expect(await proefEinde(tweede)).toEqual(nu);
    expect(await proefEinde(eerste)).toEqual(einde1);
  });

  test("een andere gebruiker heeft zijn eigen proefperiode", async () => {
    const a = await maakGebruiker("a@voorbeeld.be");
    const b = await maakGebruiker("b@voorbeeld.be");
    const nu = new Date("2026-11-01T12:00:00Z");
    await kenProefperiodeToe(db, { organisatieId: await maakTestOrganisatie(db), gebruikerId: a, nu });
    const einde = await kenProefperiodeToe(db, { organisatieId: await maakTestOrganisatie(db), gebruikerId: b, nu });
    expect(einde).toEqual(new Date(nu.getTime() + 30 * DAG));
  });

  test("twee gelijktijdige aanroepen voor dezelfde gebruiker geven samen één proefperiode", async () => {
    const gebruikerId = await maakGebruiker("a@voorbeeld.be");
    const nu = new Date("2026-11-01T12:00:00Z");
    const orgs = [await maakTestOrganisatie(db, "A"), await maakTestOrganisatie(db, "B")];
    const eindes = await Promise.all(
      orgs.map((organisatieId) => db.transaction((tx) => kenProefperiodeToe(tx, { organisatieId, gebruikerId, nu }))),
    );
    const metProef = eindes.filter((e) => e.getTime() > nu.getTime());
    expect(metProef).toHaveLength(1);
  });
});

describe("aanmaakpaden", () => {
  test("registratiepad: de eerste organisatie krijgt proefEinde = nu + 30 dagen", async () => {
    const voor = Date.now();
    const gebruikerId = await registreer("jan@voorbeeld.be", "Peeters Elektro");
    const [lid] = await db.select().from(member).where(eq(member.userId, gebruikerId));
    ongeveer(await proefEinde(lid!.organizationId), voor + 30 * DAG);
    expect(await proefGebruikt(gebruikerId)).toBe(true);
  });

  test("richtEersteOrganisatieIn zelf, met een wachtende naam", async () => {
    const id = crypto.randomUUID();
    await db.insert(user).values({
      id,
      name: "Test",
      email: "rechtstreeks@voorbeeld.be",
      emailVerified: true,
      wachtendeBedrijfsnaam: "Direct BV",
    });
    const voor = Date.now();
    const organisatieId = await richtEersteOrganisatieIn(db, { id });
    ongeveer(await proefEinde(organisatieId!), voor + 30 * DAG);
    expect(await proefGebruikt(id)).toBe(true);
  });

  test("Better Auth-pad: een tweede organisatie van dezelfde gebruiker krijgt proefEinde ongeveer nu", async () => {
    const gebruikerId = await registreer("jan@voorbeeld.be", "Peeters Elektro");
    const h = await sessieHeaders("jan@voorbeeld.be");
    const voor = Date.now();
    const tweede = await auth.api.createOrganization({ body: { name: "Tweede BV", slug: "tweede-bv" }, headers: h });
    ongeveer(await proefEinde(tweede!.id), voor);
    expect(await proefGebruikt(gebruikerId)).toBe(true);
  });

  test("Better Auth-pad: wie nog geen eigen bedrijf had (genodigde), krijgt 30 dagen voor het eerste", async () => {
    const gebruikerId = await registreer("zonder@voorbeeld.be", null);
    expect(await proefGebruikt(gebruikerId)).toBe(false);
    const h = await sessieHeaders("zonder@voorbeeld.be");
    const voor = Date.now();
    const eerste = await auth.api.createOrganization({ body: { name: "Eerste BV", slug: "eerste-bv" }, headers: h });
    ongeveer(await proefEinde(eerste!.id), voor + 30 * DAG);
    expect(await proefGebruikt(gebruikerId)).toBe(true);

    const tweede = await auth.api.createOrganization({ body: { name: "Tweede BV", slug: "tweede-bv" }, headers: h });
    ongeveer(await proefEinde(tweede!.id), voor);
  });

  test("een uitnodiging aanvaarden verbruikt de proefperiode niet", async () => {
    const eigenaarId = await registreer("eigenaar@voorbeeld.be", "Peeters Elektro");
    const [lid] = await db.select().from(member).where(eq(member.userId, eigenaarId));
    const gastId = await registreer("gast@voorbeeld.be", null);
    const uitnodigingId = crypto.randomUUID();
    await db.insert(invitation).values({
      id: uitnodigingId,
      organizationId: lid!.organizationId,
      email: "gast@voorbeeld.be",
      role: "member",
      expiresAt: new Date(Date.now() + 7 * DAG),
      inviterId: eigenaarId,
    });
    const h = await sessieHeaders("gast@voorbeeld.be");
    await auth.api.acceptInvitation({ body: { invitationId: uitnodigingId }, headers: h });

    const leden = await db.select().from(member).where(eq(member.userId, gastId));
    expect(leden).toHaveLength(1);
    expect(await proefGebruikt(gastId)).toBe(false);
  });

  test("proefGebruikt is niet te zetten, niet bij de registratie en niet via update-user", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { name: "Jan", email: "kaper@voorbeeld.be", password: WACHTWOORD, proefGebruikt: true } as never,
        headers: headers(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.select().from(user).where(eq(user.email, "kaper@voorbeeld.be"))).toHaveLength(0);

    const gebruikerId = await registreer("jan@voorbeeld.be", null);
    const h = await sessieHeaders("jan@voorbeeld.be");
    for (const waarde of [true, false]) {
      await expect(auth.api.updateUser({ body: { proefGebruikt: waarde } as never, headers: h })).rejects.toMatchObject({
        statusCode: 400,
      });
    }
    expect(await proefGebruikt(gebruikerId)).toBe(false);
  });
});

describe("migratie", () => {
  test("een organisatie rechtstreeks in de tabel krijgt de DB-default van ongeveer nu + 30 dagen", async () => {
    const voor = Date.now();
    const id = await maakTestOrganisatie(db);
    ongeveer(await proefEinde(id), voor + 30 * DAG);
    const [rij] = await db.select({ v: organization.vrijgesteld }).from(organization).where(eq(organization.id, id));
    expect(rij!.v).toBe(false);
  });

  test("de nieuwe tabellen bestaan", async () => {
    const resultaat = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('abonnementen', 'stripe_events', 'doorgestuurde_facturen')`,
    );
    const rijen = (Array.isArray(resultaat) ? resultaat : (resultaat as { rows: unknown[] }).rows) as {
      table_name: string;
    }[];
    expect(rijen.map((r) => r.table_name).sort()).toEqual(["abonnementen", "doorgestuurde_facturen", "stripe_events"]);
  });

  test("een gebruiker zonder eigen organisatie heeft proefGebruikt = false", async () => {
    const id = await maakGebruiker("nieuw@voorbeeld.be");
    expect(await proefGebruikt(id)).toBe(false);
  });
});

describe("migratie 0007 op bestaande gegevens", () => {
  const map = join(import.meta.dirname, "..", "server", "db", "migraties");

  async function voerUit(pg: PGlite, bestand: string) {
    for (const stuk of readFileSync(join(map, bestand), "utf8").split("--> statement-breakpoint")) {
      if (stuk.trim()) await pg.exec(stuk);
    }
  }

  test("bestaande eigenaars hebben hun proefperiode gehad, leden niet; organisaties krijgen migratie + 30 dagen", async () => {
    const pg = new PGlite();
    const journal = JSON.parse(readFileSync(join(map, "meta", "_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    const tags = journal.entries.map((e) => e.tag);
    expect(tags.at(-1)).toBe("0007_abonnementen");
    for (const tag of tags.slice(0, -1)) await voerUit(pg, `${tag}.sql`);

    await pg.exec(`
      insert into "user" (id, name, email) values ('eigenaar', 'E', 'e@x.be'), ('lid', 'L', 'l@x.be'), ('niemand', 'N', 'n@x.be');
      insert into organization (id, name, slug, created_at) values ('org', 'Bestaand', 'bestaand', now() - interval '400 days');
      insert into member (id, organization_id, user_id, role, created_at) values
        ('m1', 'org', 'eigenaar', 'owner', now()), ('m2', 'org', 'lid', 'member', now());
    `);
    const voor = Date.now();
    await voerUit(pg, `${tags.at(-1)}.sql`);

    const gebruikers = await pg.query<{ id: string; proef_gebruikt: boolean }>(
      'select id, proef_gebruikt from "user" order by id',
    );
    expect(gebruikers.rows).toEqual([
      { id: "eigenaar", proef_gebruikt: true },
      { id: "lid", proef_gebruikt: false },
      { id: "niemand", proef_gebruikt: false },
    ]);
    const [org] = (await pg.query<{ proef_einde: Date; vrijgesteld: boolean }>("select proef_einde, vrijgesteld from organization")).rows;
    ongeveer(org!.proef_einde, voor + 30 * DAG);
    expect(org!.vrijgesteld).toBe(false);
  });
});
