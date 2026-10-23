// Organisaties, leden en uitnodigingen: de eigen routes in een echte h3-app op 127.0.0.1 met
// echte sessiecookies, en dezelfde regels via de endpoints van Better Auth zelf (`auth.api.*`),
// want de client kan die ook rechtstreeks aanspreken (ruling R5).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq, sql } from "drizzle-orm";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type Auth, maakAuth, zetAuth } from "../server/auth";
import { zetAbonnementen } from "../server/abonnementen/config";
import { type Db, zetDb } from "../server/db";
import { account, invitation, member, organization, session, user, verification } from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { registratieLimiet, uitnodigingLimiet, vertaalAuthFout } from "../server/organisaties/leden";
import { maakLimiet } from "../server/organisaties/limiet";
import { maakUitnodigingstoken } from "../server/organisaties/uitnodigingstoken";
import { maakProject } from "../server/projecten/repo";
import { maakTestDb } from "./db";
import { API, AUTH_ROUTE, beveiligdeRoutebestanden, routeUit } from "./routes";

const WACHTWOORD = "lang-genoeg-1";
// Abonnementen staan uit in deze tests: elke organisatie mag schrijven, zonder proefperiode.
const UIT = { schrijven: true, reden: "uit", proefEinde: null, achterstalligTot: null };

let db: Db;
let auth: Auth;
let server: Server;
let basis: string;

const mails: Mail[] = [];
const verzamelaar: Verzender = {
  async verstuur(mail) {
    mails.push(mail);
  },
};

let teller = 0;
function nieuwAdres(voorvoegsel = "gebruiker"): string {
  teller += 1;
  return `${voorvoegsel}-${teller}@voorbeeld.be`;
}

function authHeaders(cookie?: string): Headers {
  const headers = new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" });
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

type Gebruiker = { id: string; email: string; cookie: string };

/** Registreert en bevestigt een gebruiker, met of zonder bedrijfsnaam (dan zonder organisatie). */
async function registreer(email: string, bedrijf?: string): Promise<string> {
  await auth.api.signUpEmail({
    body: {
      name: email.split("@")[0]!,
      email,
      password: WACHTWOORD,
      ...(bedrijf !== undefined ? { wachtendeBedrijfsnaam: bedrijf } : {}),
    },
    headers: authHeaders(),
  });
  await new Promise((klaar) => setTimeout(klaar, 0));
  const mail = mails.find((m) => m.aan === email);
  const token = new URL(mail!.tekst.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  await auth.api.verifyEmail({ query: { token }, headers: authHeaders() });
  const [rij] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return rij!.id;
}

function cookiesUit(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function inloggen(email: string): Promise<string> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: WACHTWOORD },
    headers: authHeaders(),
    returnHeaders: true,
  });
  return cookiesUit(headers);
}

async function gebruiker(bedrijf?: string, voorvoegsel?: string): Promise<Gebruiker> {
  const email = nieuwAdres(voorvoegsel);
  const id = await registreer(email, bedrijf);
  return { id, email, cookie: await inloggen(email) };
}

async function organisatieVan(userId: string): Promise<string> {
  const [rij] = await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, userId));
  return rij!.id;
}

async function wordLid(userId: string, organisatieId: string, rol: "owner" | "member"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(member).values({ id, organizationId: organisatieId, userId, role: rol, createdAt: new Date() });
  return id;
}

async function lidId(userId: string, organisatieId: string): Promise<string | undefined> {
  const [rij] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organisatieId)));
  return rij?.id;
}

async function rolVan(userId: string, organisatieId: string): Promise<string | undefined> {
  const [rij] = await db
    .select({ rol: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organisatieId)));
  return rij?.rol;
}

/** Een eigenaar met een eigen organisatie, plus een lid in die organisatie. */
async function organisatieMetLid(): Promise<{ eigenaar: Gebruiker; lid: Gebruiker; org: string; lidId: string }> {
  const eigenaar = await gebruiker("Bedrijf", "eigenaar");
  const org = await organisatieVan(eigenaar.id);
  const email = nieuwAdres("lid");
  const id = await registreer(email);
  const lidmaatschap = await wordLid(id, org, "member");
  return { eigenaar, lid: { id, email, cookie: await inloggen(email) }, org, lidId: lidmaatschap };
}

/**
 * Een uitnodiging rechtstreeks in de tabel, met de geheime token zoals de mail die zou bevatten
 * (met dezelfde vervaldatum als de uitnodiging).
 */
async function uitnodiging(
  organisatieId: string,
  inviterId: string,
  email: string,
  opties: { rol?: string; verlooptOp?: Date; status?: string } = {},
): Promise<{ id: string; token: string }> {
  const id = crypto.randomUUID();
  const verlooptOp = opties.verlooptOp ?? new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await db.insert(invitation).values({
    id,
    organizationId: organisatieId,
    email,
    role: opties.rol ?? "member",
    status: opties.status ?? "pending",
    expiresAt: verlooptOp,
    inviterId,
  });
  return { id, token: await maakUitnodigingstoken(db, id, verlooptOp) };
}

/** De link uit de laatste uitnodigingsmail aan dit adres. */
function uitnodigingslink(adres: string): URL {
  const mail = mails.findLast((m) => m.aan === adres);
  return new URL(mail!.tekst.match(/https?:\/\/\S*\/uitnodiging\/\S+/)![0]);
}

async function stuur(methode: string, pad: string, cookie?: string, json?: unknown): Promise<Response> {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  let body: string | undefined;
  if (json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(json);
  }
  return fetch(`${basis}${pad}`, { method: methode, headers, ...(body !== undefined ? { body } : {}) });
}

async function json<T = Record<string, unknown>>(antwoord: Promise<Response> | Response): Promise<T> {
  return (await (await antwoord).json()) as T;
}

/** De foutcode uit een h3-foutantwoord. */
async function foutcode(antwoord: Response): Promise<string | undefined> {
  const body = (await antwoord.json()) as { data?: { code?: string } };
  return body.data?.code;
}

/** Een geweigerde aanroep van Better Auth: status en code. */
async function weigering(belofte: Promise<unknown>): Promise<{ status: number; code: string | undefined }> {
  try {
    await belofte;
  } catch (fout) {
    const f = fout as { statusCode?: number; body?: { code?: string } };
    return { status: f.statusCode ?? 0, code: f.body?.code };
  }
  throw new Error("De aanroep werd niet geweigerd");
}

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
  zetVerzender(verzamelaar);
  // Abonnementen uit, ongeacht de omgeving van de ontwikkelaar (STRIPE_GEHEIME_SLEUTEL).
  zetAbonnementen({ config: { ingeschakeld: false }, stripe: null });
  db = await maakTestDb();
  auth = maakAuth(db);
  zetDb(db);
  zetAuth(auth);

  const app = createApp();
  const router = createRouter();
  for (const route of beveiligdeRoutebestanden().map(routeUit)) {
    const module = (await import(route.bestand)) as { default: EventHandler };
    router.use(route.pad, module.default, route.methode);
  }
  // De catch-all van Better Auth, zoals Nitro hem serveert: voor de toegangstests van buitenaf.
  const authRoute = (await import(`${API}/${AUTH_ROUTE}`)) as { default: EventHandler };
  router.use("/api/auth/**", authRoute.default);
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

beforeEach(() => {
  registratieLimiet.wis();
  uitnodigingLimiet.wis();
});

afterAll(async () => {
  await new Promise((klaar) => server?.close(klaar));
  zetAbonnementen(undefined);
  vi.unstubAllEnvs();
});

// --- GET /api/mij en de actieve organisatie --------------------------------------------------

describe("GET /api/mij", () => {
  test("de gebruiker, zijn organisaties met Nederlandse rollen en de actieve organisatie", async () => {
    const { eigenaar, lid, org } = await organisatieMetLid();
    const ander = await gebruiker("Ander bedrijf");
    const tweede = await organisatieVan(ander.id);
    await wordLid(eigenaar.id, tweede, "member");

    const mij = await json(stuur("GET", "/api/mij", eigenaar.cookie));
    expect(mij).toEqual({
      gebruiker: { id: eigenaar.id, naam: eigenaar.email.split("@")[0], email: eigenaar.email, proefGebruikt: true },
      organisaties: expect.arrayContaining([
        { id: org, naam: "Bedrijf", rol: "eigenaar", toegang: UIT },
        { id: tweede, naam: "Ander bedrijf", rol: "lid", toegang: UIT },
      ]),
      actieveOrganisatieId: org,
      abonnementenIngeschakeld: false,
    });
    expect((mij.organisaties as unknown[]).length).toBe(2);

    const vanLid = await json(stuur("GET", "/api/mij", lid.cookie));
    expect(vanLid).toMatchObject({ organisaties: [{ id: org, naam: "Bedrijf", rol: "lid" }], actieveOrganisatieId: org });
  });

  test("abonnementenIngeschakeld volgt de configuratie, ook voor wie geen actieve organisatie heeft", async () => {
    const zonder = await gebruiker();
    expect(await json(stuur("GET", "/api/mij", zonder.cookie))).toMatchObject({ abonnementenIngeschakeld: false });
    zetAbonnementen({
      config: {
        ingeschakeld: true,
        sleutel: "sk_test_nep",
        webhookGeheim: null,
        prijzen: { maand: "price_maand", jaar: "price_jaar" },
        boekhoudingInbox: null,
        apiBasis: null,
      },
      stripe: null,
    });
    try {
      expect(await json(stuur("GET", "/api/mij", zonder.cookie))).toMatchObject({
        abonnementenIngeschakeld: true,
        organisaties: [],
        actieveOrganisatieId: null,
      });
    } finally {
      zetAbonnementen({ config: { ingeschakeld: false }, stripe: null });
    }
  });

  test("zonder organisatie: een lege lijst en geen actieve organisatie", async () => {
    const zonder = await gebruiker();
    const antwoord = await stuur("GET", "/api/mij", zonder.cookie);
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toMatchObject({ organisaties: [], actieveOrganisatieId: null });
  });

  test("een actieve organisatie waarvan je geen lid meer bent, wordt vervangen", async () => {
    const { eigenaar, lid, org } = await organisatieMetLid();
    const eigen = await gebruiker("Eigen zaak");
    const eigenOrg = await organisatieVan(eigen.id);
    await wordLid(lid.id, eigenOrg, "member");
    await json(stuur("GET", "/api/mij", lid.cookie)); // org is actief
    await db.delete(member).where(and(eq(member.userId, lid.id), eq(member.organizationId, org)));

    const mij = await json(stuur("GET", "/api/mij", lid.cookie));
    expect(mij).toMatchObject({ organisaties: [{ id: eigenOrg }], actieveOrganisatieId: eigenOrg });
    expect(eigenaar.id).not.toBe(lid.id);
  });

  test("zonder sessie: 401", async () => {
    expect((await stuur("GET", "/api/mij")).status).toBe(401);
  });
});

describe("POST /api/organisaties/actief", () => {
  test("wisselen naar een organisatie waarvan je lid bent; de lijsten volgen", async () => {
    const a = await gebruiker("A", "wissel");
    const orgA = await organisatieVan(a.id);
    const b = await gebruiker("B");
    const orgB = await organisatieVan(b.id);
    await wordLid(a.id, orgB, "member");
    const vanB = await maakProject(db, orgB, { naam: "Van B", klantnaam: "", stroomtype: "3N400V" });

    const antwoord = await stuur("POST", "/api/organisaties/actief", a.cookie, { organisatieId: orgB });
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ actieveOrganisatieId: orgB });
    expect(await json(stuur("GET", "/api/mij", a.cookie))).toMatchObject({ actieveOrganisatieId: orgB });
    const lijst = await json<{ id: string }[]>(stuur("GET", "/api/projecten", a.cookie));
    expect(lijst.map((p) => p.id)).toContain(vanB.id);
    expect(orgA).not.toBe(orgB);
  });

  test("een organisatie waarvan je geen lid bent (of die niet bestaat): 404, de actieve blijft", async () => {
    const a = await gebruiker("A");
    const orgA = await organisatieVan(a.id);
    const b = await gebruiker("B");
    const orgB = await organisatieVan(b.id);
    for (const organisatieId of [orgB, "bestaat-niet"]) {
      const antwoord = await stuur("POST", "/api/organisaties/actief", a.cookie, { organisatieId });
      expect(antwoord.status).toBe(404);
    }
    expect(await json(stuur("GET", "/api/mij", a.cookie))).toMatchObject({ actieveOrganisatieId: orgA });
  });

  test("een ongeldige body: 400", async () => {
    const a = await gebruiker("A");
    expect((await stuur("POST", "/api/organisaties/actief", a.cookie, {})).status).toBe(400);
  });
});

// --- Hernoemen -------------------------------------------------------------------------------

describe("PUT /api/organisaties/naam", () => {
  test("een eigenaar hernoemt; de naam wordt getrimd; 80 tekens mag", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const antwoord = await stuur("PUT", "/api/organisaties/naam", eigenaar.cookie, { naam: "  Elektro Peeters  " });
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ id: org, naam: "Elektro Peeters" });
    const lang = "x".repeat(80);
    expect((await stuur("PUT", "/api/organisaties/naam", eigenaar.cookie, { naam: lang })).status).toBe(200);
    const [rij] = await db.select({ naam: organization.name }).from(organization).where(eq(organization.id, org));
    expect(rij!.naam).toBe(lang);
  });

  test("leeg, alleen spaties of 81 tekens: 400; een lid: 403", async () => {
    const { eigenaar, lid, org } = await organisatieMetLid();
    for (const naam of ["", "   ", "x".repeat(81)]) {
      expect((await stuur("PUT", "/api/organisaties/naam", eigenaar.cookie, { naam })).status, naam).toBe(400);
    }
    expect((await stuur("PUT", "/api/organisaties/naam", lid.cookie, { naam: "Lid" })).status).toBe(403);
    const [rij] = await db.select({ naam: organization.name }).from(organization).where(eq(organization.id, org));
    expect(rij!.naam).toBe("Bedrijf");
  });

  test("via Better Auth: dezelfde regels voor de naam, en een lid mag niet", async () => {
    const { eigenaar, lid, org } = await organisatieMetLid();
    const te = await weigering(
      auth.api.updateOrganization({
        body: { organizationId: org, data: { name: "x".repeat(81) } },
        headers: authHeaders(eigenaar.cookie),
      }),
    );
    const leeg = await weigering(
      auth.api.updateOrganization({ body: { organizationId: org, data: { name: "  " } }, headers: authHeaders(eigenaar.cookie) }),
    );
    const doorLid = await weigering(
      auth.api.updateOrganization({ body: { organizationId: org, data: { name: "Lid" } }, headers: authHeaders(lid.cookie) }),
    );
    expect([te.status, leeg.status, doorLid.status]).toEqual([400, 400, 403]);
    await auth.api.updateOrganization({
      body: { organizationId: org, data: { name: "  Getrimd  " } },
      headers: authHeaders(eigenaar.cookie),
    });
    const [rij] = await db.select({ naam: organization.name }).from(organization).where(eq(organization.id, org));
    expect(rij!.naam).toBe("Getrimd");
  });

  test("een nieuwe organisatie via Better Auth volgt dezelfde naamregel", async () => {
    const zonder = await gebruiker();
    const fout = await weigering(
      auth.api.createOrganization({
        body: { name: "x".repeat(81), slug: `te-lang-${crypto.randomUUID()}` },
        headers: authHeaders(zonder.cookie),
      }),
    );
    expect(fout.status).toBe(400);
  });
});

// --- Leden -----------------------------------------------------------------------------------

describe("leden", () => {
  test("de ledenlijst met Nederlandse rollen, ook voor een lid", async () => {
    const { eigenaar, lid, org, lidId: idVanLid } = await organisatieMetLid();
    const lijst = await json<unknown[]>(stuur("GET", "/api/organisaties/leden", lid.cookie));
    expect(lijst).toEqual([
      {
        id: await lidId(eigenaar.id, org),
        gebruikerId: eigenaar.id,
        naam: eigenaar.email.split("@")[0],
        email: eigenaar.email,
        rol: "eigenaar",
        sinds: expect.any(String),
      },
      {
        id: idVanLid,
        gebruikerId: lid.id,
        naam: lid.email.split("@")[0],
        email: lid.email,
        rol: "lid",
        sinds: expect.any(String),
      },
    ]);
  });

  test("een eigenaar wijzigt een rol; een lid dat rollen wijzigt, krijgt 403", async () => {
    const { eigenaar, lid, org, lidId: idVanLid } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    const doorLid = await stuur("PUT", `/api/organisaties/leden/${eigenaarLid}`, lid.cookie, { rol: "lid" });
    const zelf = await stuur("PUT", `/api/organisaties/leden/${idVanLid}`, lid.cookie, { rol: "eigenaar" });
    expect([doorLid.status, zelf.status]).toEqual([403, 403]);
    expect(await rolVan(eigenaar.id, org)).toBe("owner");
    expect(await rolVan(lid.id, org)).toBe("member");

    const promotie = await stuur("PUT", `/api/organisaties/leden/${idVanLid}`, eigenaar.cookie, { rol: "eigenaar" });
    expect(promotie.status).toBe(200);
    expect(await promotie.json()).toMatchObject({ id: idVanLid, gebruikerId: lid.id, rol: "eigenaar" });
    expect(await rolVan(lid.id, org)).toBe("owner");
  });

  test("alleen eigenaar en lid bestaan als rol: admin of owner geeft 400", async () => {
    const { eigenaar, lidId: idVanLid } = await organisatieMetLid();
    for (const rol of ["admin", "owner", ""]) {
      const antwoord = await stuur("PUT", `/api/organisaties/leden/${idVanLid}`, eigenaar.cookie, { rol });
      expect(antwoord.status, rol).toBe(400);
    }
  });

  test("een lid van een andere organisatie, of een onbekend id: 404", async () => {
    const { lidId: idVanLid } = await organisatieMetLid();
    const ander = await gebruiker("Ander");
    const rol = await stuur("PUT", `/api/organisaties/leden/${idVanLid}`, ander.cookie, { rol: "eigenaar" });
    const weg = await stuur("DELETE", `/api/organisaties/leden/${idVanLid}`, ander.cookie);
    const onbekend = await stuur("DELETE", "/api/organisaties/leden/bestaat-niet", ander.cookie);
    expect([rol.status, weg.status, onbekend.status]).toEqual([404, 404, 404]);
  });

  test("een lid via Better Auth: de rol of het lidmaatschap van een ander lid wijzigen: 403", async () => {
    const { lid, org } = await organisatieMetLid();
    // Het doel is een gewoon lid, geen (laatste) eigenaar: alleen het recht van de aanroeper telt.
    const anderEmail = nieuwAdres("ander");
    const anderId = await registreer(anderEmail);
    const anderLid = await wordLid(anderId, org, "member");
    const voor = await db.select().from(member).where(eq(member.id, anderLid));
    const rol = await weigering(
      auth.api.updateMemberRole({
        body: { memberId: anderLid, role: "owner", organizationId: org },
        headers: authHeaders(lid.cookie),
      }),
    );
    const weg = await weigering(
      auth.api.removeMember({ body: { memberIdOrEmail: anderLid, organizationId: org }, headers: authHeaders(lid.cookie) }),
    );
    const viaEmail = await weigering(
      auth.api.removeMember({ body: { memberIdOrEmail: anderEmail, organizationId: org }, headers: authHeaders(lid.cookie) }),
    );
    expect([rol, weg, viaEmail]).toEqual([
      { status: 403, code: "ALLEEN_EIGENAAR" },
      { status: 403, code: "ALLEEN_EIGENAAR" },
      { status: 403, code: "ALLEEN_EIGENAAR" },
    ]);
    expect(await db.select().from(member).where(eq(member.id, anderLid))).toEqual(voor);
  });

  test("een lid via Better Auth: de uitnodigingen lezen (lijst of het geheel van de organisatie): 403", async () => {
    const { eigenaar, lid, org } = await organisatieMetLid();
    await uitnodiging(org, eigenaar.id, nieuwAdres("geheim"));
    // Eerst een verzoek, zodat org de actieve organisatie van de sessie van het lid is.
    expect(await json(stuur("GET", "/api/mij", lid.cookie))).toMatchObject({ actieveOrganisatieId: org });
    const lijst = await weigering(
      auth.api.listInvitations({ query: { organizationId: org }, headers: authHeaders(lid.cookie) }),
    );
    const lijstActief = await weigering(auth.api.listInvitations({ headers: authHeaders(lid.cookie) }));
    const geheel = await weigering(
      auth.api.getFullOrganization({ query: { organizationId: org }, headers: authHeaders(lid.cookie) }),
    );
    const geheelActief = await weigering(auth.api.getFullOrganization({ headers: authHeaders(lid.cookie) }));
    for (const fout of [lijst, lijstActief, geheel, geheelActief]) {
      expect(fout).toEqual({ status: 403, code: "ALLEEN_EIGENAAR" });
    }
    // Een eigenaar ziet ze wel.
    const vanEigenaar = await auth.api.listInvitations({
      query: { organizationId: org },
      headers: authHeaders(eigenaar.cookie),
    });
    expect(vanEigenaar).toHaveLength(1);
    const geheelEigenaar = await auth.api.getFullOrganization({
      query: { organizationId: org },
      headers: authHeaders(eigenaar.cookie),
    });
    expect(geheelEigenaar?.invitations).toHaveLength(1);
  });

  test("een verwijderd lid verliest meteen de toegang: het volgende projectverzoek geeft 404", async () => {
    const { eigenaar, lid, org, lidId: idVanLid } = await organisatieMetLid();
    const project = await maakProject(db, org, { naam: "Woning", klantnaam: "", stroomtype: "3N400V" });
    expect((await stuur("GET", `/api/projecten/${project.id}`, lid.cookie)).status).toBe(200);

    const weg = await stuur("DELETE", `/api/organisaties/leden/${idVanLid}`, eigenaar.cookie);
    expect(weg.status).toBe(204);
    expect(await lidId(lid.id, org)).toBeUndefined();
    expect((await stuur("GET", `/api/projecten/${project.id}`, lid.cookie)).status).toBe(404);
    expect((await stuur("GET", "/api/projecten", lid.cookie)).status).toBe(404);
  });

  test("een lid verlaat de organisatie zelf", async () => {
    const { lid, org } = await organisatieMetLid();
    const antwoord = await stuur("POST", "/api/organisaties/verlaten", lid.cookie);
    expect(antwoord.status).toBe(204);
    expect(await lidId(lid.id, org)).toBeUndefined();
    expect(await json(stuur("GET", "/api/mij", lid.cookie))).toMatchObject({ organisaties: [], actieveOrganisatieId: null });
  });
});

// --- De laatste eigenaar ---------------------------------------------------------------------

describe("de laatste eigenaar", () => {
  test("zichzelf degraderen, verwijderd worden of vertrekken: 409 LAATSTE_EIGENAAR", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    const degradeer = await stuur("PUT", `/api/organisaties/leden/${eigenaarLid}`, eigenaar.cookie, { rol: "lid" });
    const verwijder = await stuur("DELETE", `/api/organisaties/leden/${eigenaarLid}`, eigenaar.cookie);
    const vertrek = await stuur("POST", "/api/organisaties/verlaten", eigenaar.cookie);
    expect([degradeer.status, verwijder.status, vertrek.status]).toEqual([409, 409, 409]);
    expect([await foutcode(degradeer), await foutcode(verwijder), await foutcode(vertrek)]).toEqual([
      "LAATSTE_EIGENAAR",
      "LAATSTE_EIGENAAR",
      "LAATSTE_EIGENAAR",
    ]);
    expect(await rolVan(eigenaar.id, org)).toBe("owner");
  });

  test("via Better Auth: dezelfde drie acties geven 409 LAATSTE_EIGENAAR", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    const h = authHeaders(eigenaar.cookie);
    const degradeer = await weigering(
      auth.api.updateMemberRole({ body: { memberId: eigenaarLid, role: "member", organizationId: org }, headers: h }),
    );
    const verwijder = await weigering(
      auth.api.removeMember({ body: { memberIdOrEmail: eigenaarLid, organizationId: org }, headers: h }),
    );
    const viaEmail = await weigering(
      auth.api.removeMember({ body: { memberIdOrEmail: eigenaar.email, organizationId: org }, headers: h }),
    );
    const vertrek = await weigering(auth.api.leaveOrganization({ body: { organizationId: org }, headers: h }));
    for (const fout of [degradeer, verwijder, viaEmail, vertrek]) {
      expect(fout).toEqual({ status: 409, code: "LAATSTE_EIGENAAR" });
    }
    expect(await rolVan(eigenaar.id, org)).toBe("owner");
  });

  test("met twee eigenaars lukken degraderen, verwijderen en vertrekken wel", async () => {
    const { eigenaar, lid, org, lidId: idVanLid } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    await db.update(member).set({ role: "owner" }).where(eq(member.id, idVanLid));

    const degradeer = await stuur("PUT", `/api/organisaties/leden/${eigenaarLid}`, eigenaar.cookie, { rol: "lid" });
    expect(degradeer.status).toBe(200);
    expect(await rolVan(eigenaar.id, org)).toBe("member");
    // Nu is het tweede lid de enige eigenaar.
    expect((await stuur("POST", "/api/organisaties/verlaten", lid.cookie)).status).toBe(409);

    await db.update(member).set({ role: "owner" }).where(eq(member.id, eigenaarLid));
    expect((await stuur("DELETE", `/api/organisaties/leden/${idVanLid}`, eigenaar.cookie)).status).toBe(204);
    await wordLid(lid.id, org, "owner");
    expect((await stuur("POST", "/api/organisaties/verlaten", eigenaar.cookie)).status).toBe(204);
    expect(await lidId(eigenaar.id, org)).toBeUndefined();
  });

  test("met twee eigenaars via Better Auth: degraderen, verwijderen en vertrekken lukken", async () => {
    const { eigenaar, lid, org, lidId: idVanLid } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    await db.update(member).set({ role: "owner" }).where(eq(member.id, idVanLid));
    const h = authHeaders(eigenaar.cookie);

    await auth.api.updateMemberRole({ body: { memberId: idVanLid, role: "member", organizationId: org }, headers: h });
    expect(await rolVan(lid.id, org)).toBe("member");
    await db.update(member).set({ role: "owner" }).where(eq(member.id, idVanLid));
    await auth.api.removeMember({ body: { memberIdOrEmail: idVanLid, organizationId: org }, headers: h });
    expect(await lidId(lid.id, org)).toBeUndefined();
    await wordLid(lid.id, org, "owner");
    await auth.api.leaveOrganization({ body: { organizationId: org }, headers: h });
    expect(await lidId(eigenaar.id, org)).toBeUndefined();
    expect(eigenaarLid).toBeTruthy();
  });
});

// --- Uitnodigingen beheren -------------------------------------------------------------------

describe("uitnodigingen beheren", () => {
  test("een eigenaar nodigt uit, ziet de uitnodiging in de lijst en trekt ze in", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const gast = nieuwAdres("gast");
    const antwoord = await stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, { email: gast, rol: "lid" });
    expect(antwoord.status).toBe(201);
    const nieuw = await json<{ id: string }>(antwoord);
    expect(nieuw).toMatchObject({ email: gast, rol: "lid", verlooptOp: expect.any(String) });
    await new Promise((klaar) => setTimeout(klaar, 0));
    // De link bevat de geheime token, niet het id; de database kent alleen de hash.
    const link = uitnodigingslink(gast);
    const token = link.pathname.split("/").at(-1)!;
    expect(link.pathname).toBe(`/uitnodiging/${token}`);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const mail = mails.findLast((m) => m.aan === gast)!;
    expect(mail.tekst).not.toContain(nieuw.id);
    expect(mail.html).not.toContain(nieuw.id);
    expect(JSON.stringify(await db.select().from(verification))).not.toContain(token);
    expect(await json(stuur("GET", `/api/uitnodigingen/${token}`))).toMatchObject({ id: nieuw.id, email: gast });

    const lijst = await json<{ id: string; rol: string }[]>(stuur("GET", "/api/organisaties/uitnodigingen", eigenaar.cookie));
    expect(lijst).toEqual([{ id: nieuw.id, email: gast, rol: "lid", verlooptOp: expect.any(String) }]);

    const weg = await stuur("DELETE", `/api/organisaties/uitnodigingen/${nieuw.id}`, eigenaar.cookie);
    expect(weg.status).toBe(204);
    const [rij] = await db.select({ status: invitation.status }).from(invitation).where(eq(invitation.id, nieuw.id));
    expect(rij!.status).toBe("canceled");
    // De token uit de mail is gewist, niet alleen ongeldig.
    expect(await db.select().from(verification).where(eq(verification.value, nieuw.id))).toEqual([]);
    expect((await stuur("GET", `/api/uitnodigingen/${token}`)).status).toBe(410);
    expect(await json(stuur("GET", "/api/organisaties/uitnodigingen", eigenaar.cookie))).toEqual([]);
    // Een tweede keer intrekken: niet meer open.
    expect((await stuur("DELETE", `/api/organisaties/uitnodigingen/${nieuw.id}`, eigenaar.cookie)).status).toBe(410);
    expect(org).toBeTruthy();
  });

  test("een eigenaar kan als eigenaar uitnodigen; een onbekende rol of een ongeldig adres: 400", async () => {
    const { eigenaar } = await organisatieMetLid();
    const eigen = await stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, {
      email: nieuwAdres(),
      rol: "eigenaar",
    });
    expect(eigen.status).toBe(201);
    expect(await eigen.json()).toMatchObject({ rol: "eigenaar" });
    for (const body of [{ email: nieuwAdres(), rol: "admin" }, { email: "geen-adres", rol: "lid" }, {}]) {
      expect((await stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, body)).status).toBe(400);
    }
  });

  test("een bestaand lid of een al uitgenodigd adres: 409", async () => {
    const { eigenaar, lid } = await organisatieMetLid();
    const alLid = await stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, { email: lid.email, rol: "lid" });
    const gast = nieuwAdres();
    await stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, { email: gast, rol: "lid" });
    const opnieuw = await stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, { email: gast, rol: "lid" });
    expect([alLid.status, opnieuw.status]).toEqual([409, 409]);
    expect([await foutcode(alLid), await foutcode(opnieuw)]).toEqual(["AL_LID", "AL_UITGENODIGD"]);
  });

  test("een lid: uitnodigen, de lijst en intrekken geven 403", async () => {
    const { eigenaar, lid, org } = await organisatieMetLid();
    const { id } = await uitnodiging(org, eigenaar.id, nieuwAdres());
    const maak = await stuur("POST", "/api/organisaties/uitnodigingen", lid.cookie, { email: nieuwAdres(), rol: "lid" });
    const lijst = await stuur("GET", "/api/organisaties/uitnodigingen", lid.cookie);
    const trek = await stuur("DELETE", `/api/organisaties/uitnodigingen/${id}`, lid.cookie);
    expect([maak.status, lijst.status, trek.status]).toEqual([403, 403, 403]);
  });

  test("een lid via Better Auth: uitnodigen en intrekken worden geweigerd", async () => {
    const { eigenaar, lid, org } = await organisatieMetLid();
    const { id } = await uitnodiging(org, eigenaar.id, nieuwAdres());
    const maak = await weigering(
      auth.api.createInvitation({
        body: { email: nieuwAdres(), role: "member", organizationId: org },
        headers: authHeaders(lid.cookie),
      }),
    );
    const trek = await weigering(auth.api.cancelInvitation({ body: { invitationId: id }, headers: authHeaders(lid.cookie) }));
    expect([maak, trek]).toEqual([
      { status: 403, code: "ALLEEN_EIGENAAR" },
      { status: 403, code: "ALLEEN_EIGENAAR" },
    ]);
    const [rij] = await db.select({ status: invitation.status }).from(invitation).where(eq(invitation.id, id));
    expect(rij!.status).toBe("pending");
  });

  test("hoogstens 20 uitnodigingen per uur per gebruiker: daarna 429 TE_VEEL_UITNODIGINGEN", async () => {
    const { eigenaar } = await organisatieMetLid();
    const statussen: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const antwoord = await stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, {
        email: nieuwAdres("gast"),
        rol: "lid",
      });
      statussen.push(antwoord.status);
    }
    expect(statussen).toEqual(Array(20).fill(201));

    const gast = nieuwAdres("gast");
    const teVeel = await stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, { email: gast, rol: "lid" });
    expect(teVeel.status).toBe(429);
    expect(Number(teVeel.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await foutcode(teVeel)).toBe("TE_VEEL_UITNODIGINGEN");
    expect(await db.select().from(invitation).where(eq(invitation.email, gast))).toEqual([]);
    await new Promise((klaar) => setTimeout(klaar, 0));
    expect(mails.filter((m) => m.aan === gast)).toEqual([]);

    // De limiet is per gebruiker: een andere eigenaar nodigt nog gewoon uit.
    const ander = await gebruiker("Ander bedrijf");
    const vanAnder = await stuur("POST", "/api/organisaties/uitnodigingen", ander.cookie, { email: gast, rol: "lid" });
    expect(vanAnder.status).toBe(201);
  });

  test("een uitnodiging van een andere organisatie intrekken: 404", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const { id } = await uitnodiging(org, eigenaar.id, nieuwAdres());
    const ander = await gebruiker("Ander");
    expect((await stuur("DELETE", `/api/organisaties/uitnodigingen/${id}`, ander.cookie)).status).toBe(404);
  });
});

// --- Een uitnodiging bekijken en aanvaarden --------------------------------------------------

describe("uitnodiging aanvaarden", () => {
  test("de uitnodiging is zonder sessie te bekijken met de token: organisatie, rol en adres", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const gast = nieuwAdres();
    const { id, token } = await uitnodiging(org, eigenaar.id, gast, { rol: "owner" });
    const antwoord = await stuur("GET", `/api/uitnodigingen/${token}`);
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({
      id,
      email: gast,
      rol: "eigenaar",
      organisatie: { naam: "Bedrijf" },
      verlooptOp: expect.any(String),
    });
    // Het id, een onbekende of een misvormde token: allemaal 410, zonder onderscheid.
    for (const sleutel of [id, "A".repeat(43), "bestaat-niet"]) {
      expect((await stuur("GET", `/api/uitnodigingen/${sleutel}`)).status, sleutel).toBe(410);
    }
  });

  test("een nieuwe mail voor dezelfde uitnodiging vervangt de vorige token", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const { id, token: oud } = await uitnodiging(org, eigenaar.id, nieuwAdres());
    const nieuw = await maakUitnodigingstoken(db, id, new Date(Date.now() + 3600_000));
    expect((await stuur("GET", `/api/uitnodigingen/${oud}`)).status).toBe(410);
    expect((await stuur("GET", `/api/uitnodigingen/${nieuw}`)).status).toBe(200);
  });

  test("met de token en het juiste, bevestigde adres: lid en actief; een tweede keer: 410", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const gast = await gebruiker(undefined, "gast");
    const { token } = await uitnodiging(org, eigenaar.id, gast.email);
    const antwoord = await stuur("POST", `/api/uitnodigingen/${token}/aanvaard`, gast.cookie);
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ organisatieId: org });
    expect(await rolVan(gast.id, org)).toBe("member");
    expect(await json(stuur("GET", "/api/mij", gast.cookie))).toMatchObject({ actieveOrganisatieId: org });
    const [bewaard] = await db.select({ laatste: user.laatsteOrganisatieId }).from(user).where(eq(user.id, gast.id));
    expect(bewaard!.laatste).toBe(org);

    const opnieuw = await stuur("POST", `/api/uitnodigingen/${token}/aanvaard`, gast.cookie);
    expect(opnieuw.status).toBe(410);
    expect((await stuur("GET", `/api/uitnodigingen/${token}`)).status).toBe(410);
  });

  test("aanvaarden met het id in plaats van de token: 410", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const gast = await gebruiker(undefined, "met-id");
    const { id } = await uitnodiging(org, eigenaar.id, gast.email);
    expect((await stuur("POST", `/api/uitnodigingen/${id}/aanvaard`, gast.cookie)).status).toBe(410);
    expect(await lidId(gast.id, org)).toBeUndefined();
  });

  test("een uitnodiging voor a@x, aanvaard door b@x: 403, ook via Better Auth", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const b = await gebruiker(undefined, "b");
    const { id, token } = await uitnodiging(org, eigenaar.id, nieuwAdres("a"));
    expect((await stuur("POST", `/api/uitnodigingen/${token}/aanvaard`, b.cookie)).status).toBe(403);
    const viaAuth = await weigering(auth.api.acceptInvitation({ body: { invitationId: id }, headers: authHeaders(b.cookie) }));
    expect(viaAuth.status).toBe(403);
    expect(await lidId(b.id, org)).toBeUndefined();
    const [rij] = await db.select({ status: invitation.status }).from(invitation).where(eq(invitation.id, id));
    expect(rij!.status).toBe("pending");
  });

  test("een onbevestigd adres: 403, ook via Better Auth", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const gast = await gebruiker(undefined, "onbevestigd");
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, gast.id));
    const { id, token } = await uitnodiging(org, eigenaar.id, gast.email);
    expect((await stuur("POST", `/api/uitnodigingen/${token}/aanvaard`, gast.cookie)).status).toBe(403);
    const viaAuth = await weigering(auth.api.acceptInvitation({ body: { invitationId: id }, headers: authHeaders(gast.cookie) }));
    expect(viaAuth.status).toBe(403);
    expect(await lidId(gast.id, org)).toBeUndefined();
  });

  test("een verlopen of ingetrokken uitnodiging: 410, en Better Auth weigert ze ook (400)", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const gast = await gebruiker(undefined, "laat");
    const verlopen = await uitnodiging(org, eigenaar.id, gast.email, { verlooptOp: new Date(Date.now() - 1000) });
    const ingetrokken = await uitnodiging(org, eigenaar.id, gast.email, { status: "canceled" });
    for (const { id, token } of [verlopen, ingetrokken]) {
      expect((await stuur("POST", `/api/uitnodigingen/${token}/aanvaard`, gast.cookie)).status, id).toBe(410);
      expect((await stuur("GET", `/api/uitnodigingen/${token}`)).status, id).toBe(410);
      const viaAuth = await weigering(auth.api.acceptInvitation({ body: { invitationId: id }, headers: authHeaders(gast.cookie) }));
      expect(viaAuth.status).toBe(400);
    }
    expect(await lidId(gast.id, org)).toBeUndefined();
  });

  test("een uitnodiging verloopt na 7 dagen", async () => {
    const { eigenaar } = await organisatieMetLid();
    const voor = Date.now();
    const nieuw = await json<{ verlooptOp: string }>(
      stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, { email: nieuwAdres(), rol: "lid" }),
    );
    const zeven = 7 * 24 * 3600 * 1000;
    expect(new Date(nieuw.verlooptOp).getTime()).toBeGreaterThanOrEqual(voor + zeven - 5000);
    expect(new Date(nieuw.verlooptOp).getTime()).toBeLessThanOrEqual(Date.now() + zeven + 5000);
  });
});

// --- Registreren via een uitnodiging ---------------------------------------------------------

describe("registreren via een uitnodiging", () => {
  const BODY = { naam: "Gast", wachtwoord: WACHTWOORD };

  test("met de token uit de mail: geen eigen organisatie, meteen lid, bevestigd, aanvaard en ingelogd", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const gast = nieuwAdres("collega");
    // Via de echte route, zodat de token uit de verstuurde mail komt.
    await stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, { email: gast, rol: "lid" });
    await new Promise((klaar) => setTimeout(klaar, 0));
    const token = uitnodigingslink(gast).pathname.split("/").at(-1)!;
    const [uitgenodigd] = await db.select({ id: invitation.id }).from(invitation).where(eq(invitation.email, gast));

    const antwoord = await stuur("POST", `/api/uitnodigingen/${token}/registreer`, undefined, {
      naam: "  Collega  ",
      wachtwoord: WACHTWOORD,
    });
    expect(antwoord.status).toBe(201);
    const cookie = cookiesUit(antwoord.headers);
    expect(cookie).toContain("better-auth.session_token=");

    const [nieuw] = await db.select().from(user).where(eq(user.email, gast));
    expect(nieuw).toMatchObject({
      name: "Collega",
      emailVerified: true,
      wachtendeBedrijfsnaam: null,
      laatsteOrganisatieId: org,
    });
    const lidmaatschappen = await db.select().from(member).where(eq(member.userId, nieuw!.id));
    expect(lidmaatschappen.map((l) => [l.organizationId, l.role])).toEqual([[org, "member"]]);
    const [rij] = await db
      .select({ status: invitation.status })
      .from(invitation)
      .where(eq(invitation.id, uitgenodigd!.id));
    expect(rij!.status).toBe("accepted");

    expect(await antwoord.json()).toMatchObject({ organisatieId: org });
    const mij = await json(stuur("GET", "/api/mij", cookie));
    expect(mij).toMatchObject({
      gebruiker: { id: nieuw!.id, naam: "Collega", email: gast },
      organisaties: [{ id: org, rol: "lid" }],
      actieveOrganisatieId: org,
    });
    // Ook gewoon inloggen met het wachtwoord werkt, zonder nieuwe organisatie.
    await inloggen(gast);
    expect(await db.select().from(member).where(eq(member.userId, nieuw!.id))).toHaveLength(1);
    expect(await db.select().from(account).where(eq(account.userId, nieuw!.id))).toHaveLength(1);
  });

  test("met het id van de uitnodiging in plaats van de token: geweigerd (410), geen account", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const gast = nieuwAdres("kaper");
    const { id } = await uitnodiging(org, eigenaar.id, gast, { rol: "owner" });
    expect((await stuur("POST", `/api/uitnodigingen/${id}/registreer`, undefined, BODY)).status).toBe(410);
    expect(await db.select().from(user).where(eq(user.email, gast))).toHaveLength(0);
    const [rij] = await db.select({ status: invitation.status }).from(invitation).where(eq(invitation.id, id));
    expect(rij!.status).toBe("pending");
  });

  test("een verkeerde of verlopen token: 410, zonder onderscheid", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const { token } = await uitnodiging(org, eigenaar.id, nieuwAdres());
    const verkeerd = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const id = crypto.randomUUID();
    await db.insert(invitation).values({
      id,
      organizationId: org,
      email: nieuwAdres(),
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 3600_000),
      inviterId: eigenaar.id,
    });
    // De uitnodiging is nog open, maar de token is verlopen.
    const verlopenToken = await maakUitnodigingstoken(db, id, new Date(Date.now() - 1000));
    const antwoorden: Response[] = [];
    for (const t of [verkeerd, verlopenToken, "A".repeat(43), "kort"]) {
      antwoorden.push(await stuur("POST", `/api/uitnodigingen/${t}/registreer`, undefined, BODY));
    }
    const bodies = await Promise.all(antwoorden.map((a) => a.json()));
    expect(antwoorden.map((a) => a.status)).toEqual([410, 410, 410, 410]);
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  test("de rol uit de uitnodiging wordt overgenomen", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const gast = nieuwAdres();
    const { token } = await uitnodiging(org, eigenaar.id, gast, { rol: "owner" });
    expect((await stuur("POST", `/api/uitnodigingen/${token}/registreer`, undefined, BODY)).status).toBe(201);
    const [nieuw] = await db.select({ id: user.id }).from(user).where(eq(user.email, gast));
    expect(await rolVan(nieuw!.id, org)).toBe("owner");
  });

  test("een tweede keer, verlopen of ingetrokken: 410", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const { token } = await uitnodiging(org, eigenaar.id, nieuwAdres());
    expect((await stuur("POST", `/api/uitnodigingen/${token}/registreer`, undefined, BODY)).status).toBe(201);
    expect((await stuur("POST", `/api/uitnodigingen/${token}/registreer`, undefined, BODY)).status).toBe(410);

    const verlopenAdres = nieuwAdres();
    const verlopen = await uitnodiging(org, eigenaar.id, verlopenAdres, { verlooptOp: new Date(Date.now() - 1000) });
    const ingetrokken = await uitnodiging(org, eigenaar.id, nieuwAdres(), { status: "canceled" });
    expect((await stuur("POST", `/api/uitnodigingen/${verlopen.token}/registreer`, undefined, BODY)).status).toBe(410);
    expect((await stuur("POST", `/api/uitnodigingen/${ingetrokken.token}/registreer`, undefined, BODY)).status).toBe(
      410,
    );
    expect(await db.select().from(user).where(eq(user.email, verlopenAdres))).toHaveLength(0);
  });

  test("een bestaand account met dat adres: 409 ACCOUNT_BESTAAT, en de uitnodiging blijft open", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const bestaand = await gebruiker(undefined, "bestaand");
    const { id, token } = await uitnodiging(org, eigenaar.id, bestaand.email.toUpperCase());
    const antwoord = await stuur("POST", `/api/uitnodigingen/${token}/registreer`, undefined, {
      naam: "Kaper",
      wachtwoord: "een-ander-wachtwoord",
    });
    expect(antwoord.status).toBe(409);
    expect(await foutcode(antwoord)).toBe("ACCOUNT_BESTAAT");
    expect(antwoord.headers.getSetCookie()).toEqual([]);
    const [rij] = await db.select({ status: invitation.status }).from(invitation).where(eq(invitation.id, id));
    expect(rij!.status).toBe("pending");
    expect(await lidId(bestaand.id, org)).toBeUndefined();
    // Het bestaande wachtwoord werkt nog.
    await inloggen(bestaand.email);
  });

  test("een ongeldige body: 400, zonder iets te wijzigen", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const gast = nieuwAdres();
    const { id, token } = await uitnodiging(org, eigenaar.id, gast);
    for (const body of [{ naam: "Gast", wachtwoord: "123456789" }, { naam: "  ", wachtwoord: WACHTWOORD }, {}]) {
      expect((await stuur("POST", `/api/uitnodigingen/${token}/registreer`, undefined, body)).status).toBe(400);
    }
    expect(await db.select().from(user).where(eq(user.email, gast))).toHaveLength(0);
    const [rij] = await db.select({ status: invitation.status }).from(invitation).where(eq(invitation.id, id));
    expect(rij!.status).toBe("pending");
  });

  test("rate limiting: na 5 pogingen per minuut volgt 429", async () => {
    const statussen: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const antwoord = await stuur("POST", "/api/uitnodigingen/bestaat-niet/registreer", undefined, BODY);
      statussen.push(antwoord.status);
      if (antwoord.status === 429) expect(Number(antwoord.headers.get("retry-after"))).toBeGreaterThan(0);
    }
    expect(statussen).toEqual([410, 410, 410, 410, 410, 429]);
  });

  test("de limiet geldt per venster: na een minuut mag het weer", () => {
    let nu = 0;
    const limiet = maakLimiet({ max: 2, vensterMs: 60_000, nu: () => nu });
    expect([limiet.probeer("ip").toegelaten, limiet.probeer("ip").toegelaten, limiet.probeer("ip").toegelaten]).toEqual([
      true,
      true,
      false,
    ]);
    expect(limiet.probeer("ander").toegelaten).toBe(true);
    nu = 60_001;
    expect(limiet.probeer("ip").toegelaten).toBe(true);
  });
});

// --- Better Auth-organisatieroutes van buitenaf (ruling R7) --------------------------------------

/** Alle organisatie-endpoints van Better Auth 1.7.7 behalve /organization/create. */
const DICHTE_ORGANISATIEPADEN = [
  "accept-invitation",
  "add-team-member",
  "cancel-invitation",
  "check-slug",
  "create-role",
  "create-team",
  "delete",
  "delete-role",
  "get-active-member",
  "get-active-member-role",
  "get-full-organization",
  "get-invitation",
  "get-organization",
  "get-role",
  "has-permission",
  "invite-member",
  "leave",
  "list",
  "list-invitations",
  "list-members",
  "list-roles",
  "list-team-members",
  "list-teams",
  "list-user-invitations",
  "list-user-teams",
  "reject-invitation",
  "remove-member",
  "remove-team",
  "remove-team-member",
  "set-active",
  "set-active-team",
  "update",
  "update-member-role",
  "update-role",
  "update-team",
].map((pad) => `/organization/${pad}`);

/** Een verzoek van buitenaf op /api/auth, zoals de browser het stuurt (met Origin). */
async function viaAuthHttp(methode: string, pad: string, cookie?: string, json_?: unknown): Promise<Response> {
  const headers = new Headers({ origin: "http://127.0.0.1:3000" });
  if (cookie) headers.set("cookie", cookie);
  let body: string | undefined;
  if (json_ !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(json_);
  }
  return fetch(`${basis}/api/auth${pad}`, { method: methode, headers, ...(body !== undefined ? { body } : {}) });
}

describe("Better Auth-organisatieroutes van buitenaf", () => {
  test("elk organisatie-endpoint behalve create geeft 404, met GET en POST", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    for (const pad of DICHTE_ORGANISATIEPADEN) {
      const get = await viaAuthHttp("GET", `${pad}?organizationId=${org}`, eigenaar.cookie);
      const post = await viaAuthHttp("POST", pad, eigenaar.cookie, { organizationId: org });
      await get.arrayBuffer();
      await post.arrayBuffer();
      expect([get.status, post.status], pad).toEqual([404, 404]);
    }
  });

  test("de omweg met id en slug van twee organisaties, varianten van het pad en een onbekend pad: 404", async () => {
    const { eigenaar, lid, org } = await organisatieMetLid();
    await uitnodiging(org, eigenaar.id, nieuwAdres("verborgen"));
    // Het lid is eigenaar van een eigen organisatie O.
    const eigenOrg = await auth.api.createOrganization({
      body: { name: "Eigen", slug: `eigen-${crypto.randomUUID()}` },
      headers: authHeaders(lid.cookie),
    });
    const paden = [
      `/organization/list-invitations?organizationId=${org}&organizationSlug=${eigenOrg!.slug}`,
      "/organization/foo",
      "/organization",
      "/organization/",
      "/organization/create/",
      "/Organization/create",
      "/organization/list-invitations/",
      "/%6Frganization/list-invitations",
      "/organization%2Flist-invitations",
      "/ORGANIZATION/LIST-INVITATIONS",
    ];
    for (const pad of paden) {
      const antwoord = await viaAuthHttp("GET", pad, lid.cookie);
      const tekst = await antwoord.text();
      expect(antwoord.status, pad).toBe(404);
      expect(tekst, pad).not.toContain("verborgen");
    }
  });

  test("/organization/create werkt van buitenaf, met de naamregel; andere auth-routes blijven open", async () => {
    const zonder = await gebruiker();
    const slug = `nieuw-${crypto.randomUUID()}`;
    const antwoord = await viaAuthHttp("POST", "/organization/create", zonder.cookie, { name: "Nieuw bedrijf", slug });
    expect(antwoord.status).toBe(200);
    const [rij] = await db.select().from(organization).where(eq(organization.slug, slug));
    expect(rij!.name).toBe("Nieuw bedrijf");
    expect(await rolVan(zonder.id, rij!.id)).toBe("owner");

    const teLang = await viaAuthHttp("POST", "/organization/create", zonder.cookie, {
      name: "x".repeat(81),
      slug: `lang-${crypto.randomUUID()}`,
    });
    expect(teLang.status).toBe(400);
    const sessie = await viaAuthHttp("GET", "/get-session", zonder.cookie);
    expect(sessie.status).toBe(200);
    expect(await sessie.json()).toMatchObject({ user: { id: zonder.id } });
  });

  test("de eigen routes doen hetzelfde werk wel: lijst, uitnodigen, wisselen", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    expect((await stuur("GET", "/api/organisaties/leden", eigenaar.cookie)).status).toBe(200);
    expect(
      (await stuur("POST", "/api/organisaties/uitnodigingen", eigenaar.cookie, { email: nieuwAdres(), rol: "lid" })).status,
    ).toBe(201);
    expect((await stuur("GET", "/api/organisaties/uitnodigingen", eigenaar.cookie)).status).toBe(200);
    expect((await stuur("POST", "/api/organisaties/actief", eigenaar.cookie, { organisatieId: org })).status).toBe(200);
  });

  test("ook server-side: id van de ene en slug van een andere organisatie omzeilen de eigenaarsregel niet", async () => {
    const { eigenaar, lid, org } = await organisatieMetLid();
    await uitnodiging(org, eigenaar.id, nieuwAdres("verborgen"));
    const eigenOrg = await auth.api.createOrganization({
      body: { name: "Eigen", slug: `eigen-${crypto.randomUUID()}` },
      headers: authHeaders(lid.cookie),
    });
    const fout = await weigering(
      auth.api.listInvitations({
        query: { organizationId: org, organizationSlug: eigenOrg!.slug } as { organizationId: string },
        headers: authHeaders(lid.cookie),
      }),
    );
    expect(fout).toEqual({ status: 403, code: "ALLEEN_EIGENAAR" });
  });
});

// --- Wachtwoordherstel -------------------------------------------------------------------------

describe("wachtwoordherstel", () => {
  test("na een wachtwoordherstel gelden de bestaande sessies niet meer", async () => {
    const wie = await gebruiker(undefined, "herstel");
    expect((await stuur("GET", "/api/mij", wie.cookie)).status).toBe(200);
    await auth.api.requestPasswordReset({
      body: { email: wie.email, redirectTo: "/wachtwoord-herstellen" },
      headers: authHeaders(),
    });
    await new Promise((klaar) => setTimeout(klaar, 0));
    const mail = mails.findLast((m) => m.aan === wie.email);
    const token = new URL(mail!.tekst.match(/https?:\/\/\S+/)![0]).pathname.split("/").at(-1)!;
    await auth.api.resetPassword({ body: { newPassword: "nieuw-wachtwoord-2", token }, headers: authHeaders() });

    expect((await stuur("GET", "/api/mij", wie.cookie)).status).toBe(401);
    expect(await db.select().from(session).where(eq(session.userId, wie.id))).toHaveLength(0);
  });
});

// --- De laatste eigenaar in de database --------------------------------------------------------

/** De fout van een databaseopdracht, of undefined als ze lukte. */
async function foutVan(opdracht: Promise<unknown>): Promise<unknown> {
  return opdracht.then(
    () => undefined,
    (f: unknown) => f,
  );
}

/** Het bericht van de databasefout (Drizzle verpakt de fout van Postgres in `cause`). */
function databaseBericht(f: unknown): string | undefined {
  const fout = f as { message?: string; cause?: { message?: string } } | undefined;
  return fout?.cause?.message ?? fout?.message;
}

describe("databasetrigger voor de laatste eigenaar", () => {
  test("de laatste eigenaar rechtstreeks verwijderen of degraderen faalt met LAATSTE_EIGENAAR", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    const weg = await foutVan(db.delete(member).where(eq(member.id, eigenaarLid)));
    const degradeer = await foutVan(db.update(member).set({ role: "member" }).where(eq(member.id, eigenaarLid)));
    expect([databaseBericht(weg), databaseBericht(degradeer)]).toEqual(["LAATSTE_EIGENAAR", "LAATSTE_EIGENAAR"]);
    expect(await rolVan(eigenaar.id, org)).toBe("owner");
  });

  test("met een tweede eigenaar mag het; een lid of een andere kolom raakt de trigger niet", async () => {
    const { eigenaar, lid, org, lidId: idVanLid } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    await db.update(member).set({ createdAt: new Date() }).where(eq(member.id, eigenaarLid));
    await db.update(member).set({ role: "owner" }).where(eq(member.id, idVanLid));
    await db.update(member).set({ role: "member" }).where(eq(member.id, eigenaarLid));
    await db.delete(member).where(eq(member.id, eigenaarLid));
    expect(await rolVan(lid.id, org)).toBe("owner");
    expect(await lidId(eigenaar.id, org)).toBeUndefined();
    // Een lid dat geen eigenaar is, mag altijd weg.
    const extra = await wordLid(eigenaar.id, org, "member");
    await db.delete(member).where(eq(member.id, extra));
    expect(await lidId(eigenaar.id, org)).toBeUndefined();
  });

  test("beide eigenaars in één transactie weghalen: de tweede faalt en alles rolt terug", async () => {
    const { eigenaar, org, lidId: idVanLid } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    await db.update(member).set({ role: "owner" }).where(eq(member.id, idVanLid));
    const fout = await foutVan(
      db.transaction(async (tx) => {
        await tx.update(member).set({ role: "member" }).where(eq(member.id, eigenaarLid));
        await tx.delete(member).where(eq(member.id, idVanLid));
      }),
    );
    expect(databaseBericht(fout)).toBe("LAATSTE_EIGENAAR");
    const rollen = await db.select({ rol: member.role }).from(member).where(eq(member.organizationId, org));
    expect(rollen.map((r) => r.rol)).toEqual(["owner", "owner"]);
  });

  test("een lijstrol owner,member naar member voor de laatste eigenaar: geweigerd", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    await db.update(member).set({ role: "owner,member" }).where(eq(member.id, eigenaarLid));
    const fout = await foutVan(db.update(member).set({ role: "member" }).where(eq(member.id, eigenaarLid)));
    expect(databaseBericht(fout)).toBe("LAATSTE_EIGENAAR");
    expect(await rolVan(eigenaar.id, org)).toBe("owner,member");
  });

  test("de laatste eigenaar naar een andere organisatie verplaatsen: geweigerd", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const ander = await gebruiker("Ander");
    const andereOrg = await organisatieVan(ander.id);
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    const fout = await foutVan(db.update(member).set({ organizationId: andereOrg }).where(eq(member.id, eigenaarLid)));
    expect(databaseBericht(fout)).toBe("LAATSTE_EIGENAAR");
    expect(await rolVan(eigenaar.id, org)).toBe("owner");
  });

  test("de trigger vangt een race die de controles mist: via auth.api in onze route wordt het 409", async () => {
    const { eigenaar, org, lidId: idVanLid } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    await db.update(member).set({ role: "owner" }).where(eq(member.id, idVanLid));
    // Een gelijktijdig verzoek nagebootst: net vóór Better Auth het tweede lid verwijdert, degradeert
    // "iemand anders" de eerste eigenaar. Alle controles vooraf zagen nog twee eigenaars.
    // De ids zijn door de test gemaakte uuids.
    await db.execute(
      sql.raw(`CREATE FUNCTION test_race() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id = '${idVanLid}' THEN UPDATE "member" SET role = 'member' WHERE id = '${eigenaarLid}'; END IF;
  RETURN OLD;
END $$`),
    );
    await db.execute(
      sql.raw(`CREATE TRIGGER a_test_race BEFORE DELETE ON "member" FOR EACH ROW EXECUTE FUNCTION test_race()`),
    );
    try {
      const antwoord = await stuur("DELETE", `/api/organisaties/leden/${idVanLid}`, eigenaar.cookie);
      expect(antwoord.status).toBe(409);
      expect(await foutcode(antwoord)).toBe("LAATSTE_EIGENAAR");
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER a_test_race ON "member"`));
      await db.execute(sql.raw(`DROP FUNCTION test_race()`));
    }
    const rollen = await db.select({ rol: member.role }).from(member).where(eq(member.organizationId, org));
    expect(rollen.map((r) => r.rol)).toEqual(["owner", "owner"]);
  });

  test("de fout van de trigger wordt in onze routes 409 LAATSTE_EIGENAAR", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    const eigenaarLid = (await lidId(eigenaar.id, org))!;
    const fout = await foutVan(db.delete(member).where(eq(member.id, eigenaarLid)));
    expect(vertaalAuthFout(fout)).toMatchObject({ statusCode: 409, data: { code: "LAATSTE_EIGENAAR" } });
  });

  test("verdwijnt de gebruiker zelf (cascade), dan houdt de trigger niets tegen", async () => {
    const { eigenaar, org } = await organisatieMetLid();
    await db.delete(user).where(eq(user.id, eigenaar.id));
    expect(await lidId(eigenaar.id, org)).toBeUndefined();
  });
});

// --- Sessies -----------------------------------------------------------------------------------

describe("sessie na het wisselen", () => {
  test("de gekozen organisatie staat in de sessie", async () => {
    const a = await gebruiker("A");
    const b = await gebruiker("B");
    const orgB = await organisatieVan(b.id);
    await wordLid(a.id, orgB, "member");
    await stuur("POST", "/api/organisaties/actief", a.cookie, { organisatieId: orgB });
    const sessies = await db.select({ actief: session.activeOrganizationId }).from(session).where(eq(session.userId, a.id));
    expect(sessies.map((s) => s.actief)).toContain(orgB);
  });
});
