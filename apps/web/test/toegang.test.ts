// Toegang per organisatie op elke API-route. De routebestanden draaien in een echte h3-app op
// 127.0.0.1 (een willekeurige poort), met Better Auth en de database op PGlite. Elke route wordt
// via HTTP aangesproken met echte sessiecookies: zonder sessie, als lid van een andere
// organisatie, zonder organisatie, als lid en als eigenaar.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import {
  createApp,
  createRouter,
  defineEventHandler,
  getQuery,
  getRouterParam,
  toNodeListener,
  type EventHandler,
} from "h3";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { type Auth, maakAuth, zetAuth } from "../server/auth";
import { bewaarBedrijf, bewaarLogo, haalBedrijf } from "../server/bedrijf/repo";
import { maakLokaleOpslag, zetOpslag, type BestandOpslag } from "../server/bestanden/opslag";
import { bewaarBestand, haalBestand } from "../server/bestanden/repo";
import { type Db, zetDb } from "../server/db";
import { bedrijfsinstellingen, bestanden, invitation, member, projecten, session, user } from "../server/db/schema";
import { maakExport } from "../server/exports/repo";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { registratieLimiet } from "../server/organisaties/leden";
import { maakUitnodigingstoken } from "../server/organisaties/uitnodigingstoken";
import { haalProject, maakProject, verwijderProject } from "../server/projecten/repo";
import { kiesActieveOrganisatie, vereisLid, vereisProjecttoegang, vereisSessie } from "../server/utils/toegang";
import type { ExportInvoer } from "../shared/exports";
import { maakTestDb } from "./db";
import { apiPad, beveiligdeRoutebestanden, PUBLIEKE_ROUTES, routeUit } from "./routes";

// Gotenberg draait niet in Vitest: de PDF-dienst geeft een minimale geldige PDF terug.
vi.mock("../server/pdf/gotenberg", async (origineel) => ({
  ...(await origineel<typeof import("../server/pdf/gotenberg")>()),
  maakPdf: vi.fn(async () => new TextEncoder().encode("%PDF-1.7\n%%EOF\n")),
}));

const WACHTWOORD = "lang-genoeg-1";

let db: Db;
let auth: Auth;
let opslag: BestandOpslag;
let map: string;
let server: Server;
let basis: string;

const mails: Mail[] = [];
const verzamelaar: Verzender = {
  async verstuur(mail) {
    mails.push(mail);
  },
};

// --- Routes uit de bestandsnamen -------------------------------------------------------------

// Alles onder server/api behalve auth/[...all].ts (de catch-all van Better Auth).
const ROUTES = beveiligdeRoutebestanden().map(routeUit);

// --- Hulp ------------------------------------------------------------------------------------

function png(breedte: number, hoogte: number): Uint8Array {
  const data = new Uint8Array(33);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(data.buffer);
  view.setUint32(8, 13);
  data.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, breedte);
  view.setUint32(20, hoogte);
  return data;
}

function pngFormulier(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [naam, waarde] of Object.entries(extra)) form.append(naam, waarde);
  form.append("bestand", new Blob([png(10, 10) as BlobPart], { type: "image/png" }), "plan.png");
  return form;
}

const EXPORT_INVOER: ExportInvoer = {
  onderdelen: { eendraadschema: true, situatieschema: false, kringenlijst: false, bijlage: false },
  papier: "A4",
  versieLabel: "V1",
};

function authHeaders(): Headers {
  return new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1" });
}

type Gebruiker = { id: string; cookie: string };

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

/** Een nieuwe sessie (zonder actieve organisatie) en haar cookie. */
async function inloggen(email: string): Promise<string> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: WACHTWOORD },
    headers: authHeaders(),
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function gebruiker(email: string, bedrijf?: string): Promise<Gebruiker> {
  const id = await registreer(email, bedrijf);
  return { id, cookie: await inloggen(email) };
}

async function wordLid(userId: string, organisatieId: string, rol: "owner" | "member", sinds = new Date()) {
  await db.insert(member).values({ id: crypto.randomUUID(), organizationId: organisatieId, userId, role: rol, createdAt: sinds });
}

async function organisatieVan(userId: string): Promise<string> {
  const [rij] = await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, userId));
  return rij!.id;
}

type Verzoek = {
  methode: string;
  pad: string;
  json?: unknown;
  formulier?: FormData;
  ifMatch?: number;
};

async function stuur(verzoek: Verzoek, cookie?: string): Promise<Response> {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (verzoek.ifMatch !== undefined) headers.set("if-match", String(verzoek.ifMatch));
  let body: BodyInit | undefined;
  if (verzoek.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(verzoek.json);
  } else if (verzoek.formulier) {
    body = verzoek.formulier;
  }
  return fetch(`${basis}${verzoek.pad}`, { method: verzoek.methode, headers, ...(body !== undefined ? { body } : {}) });
}

// --- Opzet -----------------------------------------------------------------------------------

let eigenaarA: Gebruiker;
let lidA: Gebruiker;
let eigenaarB: Gebruiker;
let zonderOrganisatie: Gebruiker;
let orgA: string;
let orgB: string;

async function projectIn(organisatieId: string, naam = "Woning"): Promise<string> {
  return (await maakProject(db, organisatieId, { naam, klantnaam: "", stroomtype: "3N400V" })).id;
}

async function planIn(organisatieId: string): Promise<string> {
  const projectId = await projectIn(organisatieId);
  return (await bewaarBestand(db, opslag, { organisatieId, projectId, soort: "plan-raster", data: png(10, 10) })).id;
}

/** Een extra lid van een organisatie, rechtstreeks in de tabellen; geeft het lidmaatschaps-id. */
async function extraLid(organisatieId: string): Promise<string> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, name: "Extra", email: `extra-${userId}@voorbeeld.be`, emailVerified: true });
  const id = crypto.randomUUID();
  await db.insert(member).values({ id, organizationId: organisatieId, userId, role: "member", createdAt: new Date() });
  return id;
}

/** Een openstaande uitnodiging van een organisatie voor een nieuw adres. */
async function uitnodigingIn(organisatieId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(invitation).values({
    id,
    organizationId: organisatieId,
    email: `gast-${id}@voorbeeld.be`,
    role: "member",
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    inviterId: eigenaarA.id,
  });
  return id;
}

/** De geheime token van een verse uitnodiging (zoals in de mail). */
async function uitnodigingstokenIn(organisatieId: string): Promise<string> {
  const id = await uitnodigingIn(organisatieId);
  return maakUitnodigingstoken(db, id, new Date(Date.now() + 7 * 24 * 3600 * 1000));
}

async function exportIn(organisatieId: string): Promise<string> {
  const projectId = await projectIn(organisatieId);
  const info = await maakExport(db, opslag, organisatieId, projectId, 1, EXPORT_INVOER, {
    maakPdf: async () => new TextEncoder().encode("%PDF-1.7\n%%EOF\n"),
  });
  return info.bestandId;
}

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
  zetVerzender(verzamelaar);
  db = await maakTestDb();
  auth = maakAuth(db);
  zetDb(db);
  zetAuth(auth);
  map = await mkdtemp(join(tmpdir(), "elentrik-toegang-"));
  opslag = maakLokaleOpslag(map);
  zetOpslag(opslag);

  const app = createApp();
  const router = createRouter();
  for (const route of ROUTES) {
    const module = (await import(route.bestand)) as { default: EventHandler };
    router.use(route.pad, module.default, route.methode);
  }
  // Testroutes rond de contextfuncties zelf.
  router.get("/test/sessie", defineEventHandler((event) => vereisSessie(event)));
  router.get(
    "/test/lid",
    defineEventHandler((event) => {
      const query = getQuery(event);
      return vereisLid(event, {
        ...(typeof query.organisatieId === "string" ? { organisatieId: query.organisatieId } : {}),
        ...(query.rol === "eigenaar" || query.rol === "lid" ? { rol: query.rol } : {}),
      });
    }),
  );
  router.get(
    "/test/project/:id",
    defineEventHandler((event) => vereisProjecttoegang(event, getRouterParam(event, "id")!)),
  );
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  eigenaarA = await gebruiker("eigenaar-a@voorbeeld.be", "Bedrijf A");
  eigenaarB = await gebruiker("eigenaar-b@voorbeeld.be", "Bedrijf B");
  orgA = await organisatieVan(eigenaarA.id);
  orgB = await organisatieVan(eigenaarB.id);
  const lidId = await registreer("lid-a@voorbeeld.be");
  await wordLid(lidId, orgA, "member");
  lidA = { id: lidId, cookie: await inloggen("lid-a@voorbeeld.be") };
  zonderOrganisatie = await gebruiker("zonder@voorbeeld.be");
}, 120_000);

afterAll(async () => {
  await new Promise((klaar) => server?.close(klaar));
  await rm(map, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

// --- De routetabel ---------------------------------------------------------------------------

type Actor = "zonderSessie" | "andereOrganisatie" | "zonderOrganisatie" | "lid" | "eigenaar";

type Rij = {
  /** Een vers verzoek op de gegevens van organisatie A. */
  verzoek: () => Promise<Verzoek>;
  /**
   * De verwachte status per actor. Zonder sessie is 401 en zonder organisatie 404, tenzij de rij
   * het anders zegt: een publieke route (`publiek: true`, ook in PUBLIEKE_ROUTES) of een route die
   * geen organisatie nodig heeft.
   */
  andereOrganisatie: number;
  lid: number;
  eigenaar: number;
  zonderSessie?: number;
  zonderOrganisatie?: number;
  publiek?: true;
  /** Herstelt de gegevens na het verzoek van elke actor (bv. een lid dat vertrok). */
  na?: () => Promise<void>;
};

async function projectVerzoek(methode: string, achter = "", extra: Partial<Verzoek> = {}): Promise<Verzoek> {
  return { methode, pad: `/api/projecten/${await projectIn(orgA)}${achter}`, ...extra };
}

const TABEL: Record<string, Rij> = {
  // De rijen voor de lijsten en de bedrijfsgegevens werken op de actieve organisatie: B krijgt
  // daar zijn eigen gegevens (2xx), nooit die van A. Dat bewijzen de afschermingstests verderop:
  // "projecten per organisatie" en "bedrijfsgegevens per organisatie".
  "GET /api/projecten": {
    verzoek: async () => ({ methode: "GET", pad: "/api/projecten" }),
    // Een lid van B krijgt de lijst van B, niet die van A (zie "projecten per organisatie").
    andereOrganisatie: 200,
    lid: 200,
    eigenaar: 200,
  },
  "POST /api/projecten": {
    // B maakt een project in B (zie "een nieuw project krijgt de actieve organisatie").
    verzoek: async () => ({
      methode: "POST",
      pad: "/api/projecten",
      json: { naam: "Nieuw", klantnaam: "", stroomtype: "3N400V" },
    }),
    andereOrganisatie: 201,
    lid: 201,
    eigenaar: 201,
  },
  "GET /api/projecten/:id": {
    verzoek: () => projectVerzoek("GET"),
    andereOrganisatie: 404,
    lid: 200,
    eigenaar: 200,
  },
  "PUT /api/projecten/:id": {
    verzoek: async () => {
      const id = await projectIn(orgA);
      const { document } = (await haalProject(db, orgA, id))!;
      return { methode: "PUT", pad: `/api/projecten/${id}`, ifMatch: 1, json: { document } };
    },
    andereOrganisatie: 404,
    lid: 200,
    eigenaar: 200,
  },
  "DELETE /api/projecten/:id": {
    verzoek: () => projectVerzoek("DELETE"),
    andereOrganisatie: 404,
    lid: 204,
    eigenaar: 204,
  },
  "POST /api/projecten/:id/bestanden": {
    verzoek: () => projectVerzoek("POST", "/bestanden", { formulier: pngFormulier({ soort: "plan-raster" }) }),
    andereOrganisatie: 404,
    lid: 201,
    eigenaar: 201,
  },
  "POST /api/projecten/:id/dupliceer": {
    verzoek: () => projectVerzoek("POST", "/dupliceer"),
    andereOrganisatie: 404,
    lid: 201,
    eigenaar: 201,
  },
  "GET /api/projecten/:id/exports": {
    verzoek: () => projectVerzoek("GET", "/exports"),
    andereOrganisatie: 404,
    lid: 200,
    eigenaar: 200,
  },
  "POST /api/projecten/:id/exports": {
    verzoek: () => projectVerzoek("POST", "/exports", { ifMatch: 1, json: EXPORT_INVOER }),
    andereOrganisatie: 404,
    lid: 201,
    eigenaar: 201,
  },
  "GET /api/bedrijfsgegevens": {
    verzoek: async () => ({ methode: "GET", pad: "/api/bedrijfsgegevens" }),
    // Altijd de bedrijfsgegevens van de eigen actieve organisatie (zie "bedrijfsgegevens per organisatie").
    andereOrganisatie: 200,
    lid: 200,
    eigenaar: 200,
  },
  "PUT /api/bedrijfsgegevens": {
    // B schrijft zijn eigen rij (zie "bedrijfsgegevens per organisatie").
    verzoek: async () => ({ methode: "PUT", pad: "/api/bedrijfsgegevens", json: { naam: "Elektro" } }),
    andereOrganisatie: 200,
    lid: 403,
    eigenaar: 200,
  },
  "POST /api/bedrijfsgegevens/logo": {
    // B laadt het logo van B op (zie "bestanden per organisatie").
    verzoek: async () => ({ methode: "POST", pad: "/api/bedrijfsgegevens/logo", formulier: pngFormulier() }),
    andereOrganisatie: 201,
    lid: 403,
    eigenaar: 201,
  },
  "GET /api/bestanden/:id": {
    verzoek: async () => ({ methode: "GET", pad: `/api/bestanden/${await planIn(orgA)}` }),
    andereOrganisatie: 404,
    lid: 200,
    eigenaar: 200,
  },
  // --- Organisaties en leden (Task 5); de details staan in test/organisaties.test.ts. ---
  "GET /api/mij": {
    // Ook zonder organisatie: een lege lijst, zodat de client weet waarheen.
    verzoek: async () => ({ methode: "GET", pad: "/api/mij" }),
    zonderOrganisatie: 200,
    andereOrganisatie: 200,
    lid: 200,
    eigenaar: 200,
  },
  "POST /api/organisaties/actief": {
    verzoek: async () => ({ methode: "POST", pad: "/api/organisaties/actief", json: { organisatieId: orgA } }),
    andereOrganisatie: 404,
    lid: 200,
    eigenaar: 200,
  },
  "PUT /api/organisaties/naam": {
    // Werkt op de actieve organisatie: B hernoemt B.
    verzoek: async () => ({ methode: "PUT", pad: "/api/organisaties/naam", json: { naam: "Hernoemd" } }),
    andereOrganisatie: 200,
    lid: 403,
    eigenaar: 200,
  },
  "POST /api/organisaties/verlaten": {
    // A en B hebben elk een enige eigenaar: 409. Het lid vertrekt echt en wordt daarna hersteld.
    verzoek: async () => ({ methode: "POST", pad: "/api/organisaties/verlaten" }),
    andereOrganisatie: 409,
    lid: 204,
    eigenaar: 409,
    na: async () => {
      for (const [wie, org, rol] of [
        [lidA, orgA, "member"],
        [eigenaarA, orgA, "owner"],
        [eigenaarB, orgB, "owner"],
      ] as const) {
        const [nog] = await db
          .select({ id: member.id })
          .from(member)
          .where(and(eq(member.userId, wie.id), eq(member.organizationId, org)));
        if (!nog) await wordLid(wie.id, org, rol);
      }
    },
  },
  "GET /api/organisaties/leden": {
    // Werkt op de actieve organisatie: B ziet de leden van B.
    verzoek: async () => ({ methode: "GET", pad: "/api/organisaties/leden" }),
    andereOrganisatie: 200,
    lid: 200,
    eigenaar: 200,
  },
  "PUT /api/organisaties/leden/:id": {
    verzoek: async () => ({
      methode: "PUT",
      pad: `/api/organisaties/leden/${await extraLid(orgA)}`,
      // Een lid blijft lid: een tweede eigenaar zou de rij "verlaten" voor de eigenaar laten slagen.
      json: { rol: "lid" },
    }),
    andereOrganisatie: 404,
    lid: 403,
    eigenaar: 200,
  },
  "DELETE /api/organisaties/leden/:id": {
    verzoek: async () => ({ methode: "DELETE", pad: `/api/organisaties/leden/${await extraLid(orgA)}` }),
    andereOrganisatie: 404,
    lid: 403,
    eigenaar: 204,
  },
  "GET /api/organisaties/uitnodigingen": {
    // Werkt op de actieve organisatie: B ziet de uitnodigingen van B.
    verzoek: async () => ({ methode: "GET", pad: "/api/organisaties/uitnodigingen" }),
    andereOrganisatie: 200,
    lid: 403,
    eigenaar: 200,
  },
  "POST /api/organisaties/uitnodigingen": {
    // Werkt op de actieve organisatie: B nodigt uit in B.
    verzoek: async () => ({
      methode: "POST",
      pad: "/api/organisaties/uitnodigingen",
      json: { email: `nieuw-${crypto.randomUUID()}@voorbeeld.be`, rol: "lid" },
    }),
    andereOrganisatie: 201,
    lid: 403,
    eigenaar: 201,
  },
  "DELETE /api/organisaties/uitnodigingen/:id": {
    verzoek: async () => ({ methode: "DELETE", pad: `/api/organisaties/uitnodigingen/${await uitnodigingIn(orgA)}` }),
    andereOrganisatie: 404,
    lid: 403,
    eigenaar: 204,
  },
  "GET /api/uitnodigingen/:token": {
    // Publiek: de link uit de mail opent de pagina voor er een account is.
    publiek: true,
    verzoek: async () => ({ methode: "GET", pad: `/api/uitnodigingen/${await uitnodigingstokenIn(orgA)}` }),
    zonderSessie: 200,
    zonderOrganisatie: 200,
    andereOrganisatie: 200,
    lid: 200,
    eigenaar: 200,
  },
  "POST /api/uitnodigingen/:token/aanvaard": {
    // Een uitnodiging voor een ander adres: elke ingelogde actor krijgt 403.
    verzoek: async () => ({ methode: "POST", pad: `/api/uitnodigingen/${await uitnodigingstokenIn(orgA)}/aanvaard` }),
    zonderOrganisatie: 403,
    andereOrganisatie: 403,
    lid: 403,
    eigenaar: 403,
  },
  "POST /api/uitnodigingen/:token/registreer": {
    // Publiek: elke actor registreert een nieuw account via een verse uitnodiging. De limiet per
    // IP wordt per verzoek gewist; de limiet zelf staat in test/organisaties.test.ts.
    publiek: true,
    verzoek: async () => {
      registratieLimiet.wis();
      return {
        methode: "POST",
        pad: `/api/uitnodigingen/${await uitnodigingstokenIn(orgA)}/registreer`,
        json: { naam: "Gast", wachtwoord: WACHTWOORD },
      };
    },
    zonderSessie: 201,
    zonderOrganisatie: 201,
    andereOrganisatie: 201,
    lid: 201,
    eigenaar: 201,
  },
};

describe("routetabel", () => {
  test("elke route heeft een rij in de tabel, en elke rij een route", () => {
    expect(ROUTES.map((r) => r.sleutel).sort()).toEqual(Object.keys(TABEL).sort());
  });

  test("de publieke rijen zijn precies de routes in PUBLIEKE_ROUTES", () => {
    const publiek = ROUTES.filter((r) => PUBLIEKE_ROUTES.includes(apiPad(r.bestand))).map((r) => r.sleutel);
    const rijen = Object.entries(TABEL)
      .filter(([, rij]) => rij.publiek)
      .map(([sleutel]) => sleutel);
    expect(publiek.sort()).toEqual(rijen.sort());
    expect(publiek).toHaveLength(PUBLIEKE_ROUTES.length);
    // Zonder sessie geeft alleen een publieke rij iets anders dan 401.
    for (const [sleutel, rij] of Object.entries(TABEL)) {
      if (!rij.publiek) expect(rij.zonderSessie ?? 401, sleutel).toBe(401);
    }
  });

  test.each(ROUTES.map((r) => r.sleutel))("%s", async (sleutel) => {
    const rij = TABEL[sleutel];
    if (!rij) throw new Error(`Geen rij in de tabel voor ${sleutel}`);
    const cookies: Record<Actor, string | undefined> = {
      zonderSessie: undefined,
      andereOrganisatie: eigenaarB.cookie,
      zonderOrganisatie: zonderOrganisatie.cookie,
      lid: lidA.cookie,
      eigenaar: eigenaarA.cookie,
    };
    const gekregen = {} as Record<Actor, number>;
    for (const actor of Object.keys(cookies) as Actor[]) {
      const antwoord = await stuur(await rij.verzoek(), cookies[actor]);
      await antwoord.arrayBuffer();
      gekregen[actor] = antwoord.status;
      await rij.na?.();
    }
    expect(gekregen).toEqual({
      zonderSessie: rij.zonderSessie ?? 401,
      andereOrganisatie: rij.andereOrganisatie,
      zonderOrganisatie: rij.zonderOrganisatie ?? 404,
      lid: rij.lid,
      eigenaar: rij.eigenaar,
    });
  });
});

// --- Afscherming tussen organisaties ---------------------------------------------------------

describe("projecten per organisatie", () => {
  test("de lijst toont alleen de projecten van de actieve organisatie", async () => {
    const vanA = await projectIn(orgA, "Alleen A");
    const vanB = await projectIn(orgB, "Alleen B");
    const lijstA = (await (await stuur({ methode: "GET", pad: "/api/projecten" }, eigenaarA.cookie)).json()) as {
      id: string;
    }[];
    const lijstB = (await (await stuur({ methode: "GET", pad: "/api/projecten" }, eigenaarB.cookie)).json()) as {
      id: string;
    }[];
    expect(lijstA.map((p) => p.id)).toContain(vanA);
    expect(lijstA.map((p) => p.id)).not.toContain(vanB);
    expect(lijstB.map((p) => p.id)).toContain(vanB);
    expect(lijstB.map((p) => p.id)).not.toContain(vanA);
  });

  test("een nieuw project krijgt de actieve organisatie, en GET geeft organisatieId", async () => {
    const antwoord = await stuur(
      { methode: "POST", pad: "/api/projecten", json: { naam: "Nieuw B", klantnaam: "", stroomtype: "2x230V" } },
      eigenaarB.cookie,
    );
    const { id } = (await antwoord.json()) as { id: string };
    const [rij] = await db.select({ org: projecten.organisatieId }).from(projecten).where(eq(projecten.id, id));
    expect(rij!.org).toBe(orgB);
    const project = (await (await stuur({ methode: "GET", pad: `/api/projecten/${id}` }, eigenaarB.cookie)).json()) as {
      organisatieId: string;
    };
    expect(project.organisatieId).toBe(orgB);
  });

  test("dupliceren blijft in de organisatie van het bronproject", async () => {
    const id = await projectIn(orgA);
    const antwoord = await stuur({ methode: "POST", pad: `/api/projecten/${id}/dupliceer` }, lidA.cookie);
    const { id: kopie } = (await antwoord.json()) as { id: string };
    const [rij] = await db.select({ org: projecten.organisatieId }).from(projecten).where(eq(projecten.id, kopie));
    expect(rij!.org).toBe(orgA);
  });

  test("een project zonder organisatie, of een verwijderd project, is voor niemand zichtbaar", async () => {
    const [wees] = await db
      .insert(projecten)
      .values({ naam: "Wees", document: {} })
      .returning({ id: projecten.id });
    const verwijderd = await projectIn(orgA);
    await verwijderProject(db, orgA, verwijderd);
    for (const id of [wees!.id, verwijderd]) {
      const antwoord = await stuur({ methode: "GET", pad: `/api/projecten/${id}` }, eigenaarA.cookie);
      expect(antwoord.status).toBe(404);
    }
  });

  test("een andere organisatie krijgt 404, ook met een geldige If-Match of een ongeldige body", async () => {
    const id = await projectIn(orgA);
    const put = await stuur({ methode: "PUT", pad: `/api/projecten/${id}`, ifMatch: 1, json: {} }, eigenaarB.cookie);
    const zonderIfMatch = await stuur({ methode: "PUT", pad: `/api/projecten/${id}`, json: {} }, eigenaarB.cookie);
    const exportZonder = await stuur({ methode: "POST", pad: `/api/projecten/${id}/exports` }, eigenaarB.cookie);
    expect([put.status, zonderIfMatch.status, exportZonder.status]).toEqual([404, 404, 404]);
    expect((await haalProject(db, orgA, id))!.versie).toBe(1);
  });

  test("de If-Match-controle van de export werkt nog: een oude versie geeft 409", async () => {
    const id = await projectIn(orgA);
    const antwoord = await stuur(
      { methode: "POST", pad: `/api/projecten/${id}/exports`, ifMatch: 7, json: EXPORT_INVOER },
      eigenaarA.cookie,
    );
    expect(antwoord.status).toBe(409);
  });
});

describe("bestanden per organisatie", () => {
  test("plan, export en logo van A: 200 voor A, 404 voor B; de export blijft een bijlage", async () => {
    const plan = await planIn(orgA);
    const exportBestand = await exportIn(orgA);
    const logo = (await bewaarLogo(db, opslag, orgA, png(10, 10))).id;
    for (const id of [plan, exportBestand, logo]) {
      const voorA = await stuur({ methode: "GET", pad: `/api/bestanden/${id}` }, lidA.cookie);
      await voorA.arrayBuffer();
      const voorB = await stuur({ methode: "GET", pad: `/api/bestanden/${id}` }, eigenaarB.cookie);
      await voorB.arrayBuffer();
      expect([voorA.status, voorB.status], id).toEqual([200, 404]);
    }
    const download = await stuur({ methode: "GET", pad: `/api/bestanden/${exportBestand}` }, eigenaarA.cookie);
    await download.arrayBuffer();
    expect(download.headers.get("content-disposition")).toMatch(/^attachment/);
  });

  test("een logo wordt bewaard met organisatie_id, zonder project, onder org/<organisatieId>/<bestandId>", async () => {
    const antwoord = await stuur(
      { methode: "POST", pad: "/api/bedrijfsgegevens/logo", formulier: pngFormulier() },
      eigenaarA.cookie,
    );
    const { id } = (await antwoord.json()) as { id: string };
    const [rij] = await db.select().from(bestanden).where(eq(bestanden.id, id));
    expect(rij).toMatchObject({ organisatieId: orgA, projectId: null, soort: "logo", sleutel: `org/${orgA}/${id}` });
    expect((await haalBedrijf(db, orgA)).logoBestandId).toBe(id);
    expect(await opslag.bestaat(`org/${orgA}/${id}`)).toBe(true);
  });

  test("een bestaand logo met de oude sleutel blijft bereikbaar voor zijn organisatie", async () => {
    const id = crypto.randomUUID();
    await opslag.schrijf(`bedrijf/${id}`, png(10, 10));
    await db.insert(bestanden).values({
      id,
      organisatieId: orgA,
      soort: "logo",
      mime: "image/png",
      grootte: 33,
      sleutel: `bedrijf/${id}`,
    });
    const voorA = await stuur({ methode: "GET", pad: `/api/bestanden/${id}` }, eigenaarA.cookie);
    const voorB = await stuur({ methode: "GET", pad: `/api/bestanden/${id}` }, eigenaarB.cookie);
    expect([voorA.status, voorB.status]).toEqual([200, 404]);
    expect((await haalBestand(db, id))!.sleutel).toBe(`bedrijf/${id}`);
  });

  test("een logo zonder organisatie is voor niemand bereikbaar", async () => {
    const id = crypto.randomUUID();
    await opslag.schrijf(`bedrijf/${id}`, png(10, 10));
    await db.insert(bestanden).values({ id, soort: "logo", mime: "image/png", grootte: 33, sleutel: `bedrijf/${id}` });
    const antwoord = await stuur({ methode: "GET", pad: `/api/bestanden/${id}` }, eigenaarA.cookie);
    expect(antwoord.status).toBe(404);
  });
});

describe("bedrijfsgegevens per organisatie", () => {
  test("elke organisatie leest en schrijft haar eigen rij; een lid leest die van zijn organisatie", async () => {
    await stuur({ methode: "PUT", pad: "/api/bedrijfsgegevens", json: { naam: "Elektro A" } }, eigenaarA.cookie);
    await stuur({ methode: "PUT", pad: "/api/bedrijfsgegevens", json: { naam: "Elektro B" } }, eigenaarB.cookie);
    const voorLid = (await (await stuur({ methode: "GET", pad: "/api/bedrijfsgegevens" }, lidA.cookie)).json()) as {
      naam: string;
    };
    const voorB = (await (await stuur({ methode: "GET", pad: "/api/bedrijfsgegevens" }, eigenaarB.cookie)).json()) as {
      naam: string;
    };
    expect([voorLid.naam, voorB.naam]).toEqual(["Elektro A", "Elektro B"]);
    const rijen = await db.select().from(bedrijfsinstellingen);
    expect(rijen.filter((r) => r.organisatieId === orgA)).toHaveLength(1);
    expect(rijen.filter((r) => r.organisatieId === orgB)).toHaveLength(1);
  });

  test("een lid dat schrijft, krijgt 403 en wijzigt niets", async () => {
    await bewaarBedrijf(db, orgA, { naam: "Vast" });
    const put = await stuur({ methode: "PUT", pad: "/api/bedrijfsgegevens", json: { naam: "Lid" } }, lidA.cookie);
    const logo = await stuur(
      { methode: "POST", pad: "/api/bedrijfsgegevens/logo", formulier: pngFormulier() },
      lidA.cookie,
    );
    expect([put.status, logo.status]).toEqual([403, 403]);
    expect((await haalBedrijf(db, orgA)).naam).toBe("Vast");
  });
});

// --- De contextfuncties ----------------------------------------------------------------------

describe("vereisSessie en vereisLid", () => {
  test("zonder sessie: 401", async () => {
    const antwoorden = await Promise.all(
      ["/test/sessie", "/test/lid", `/test/project/${crypto.randomUUID()}`].map((pad) =>
        stuur({ methode: "GET", pad }),
      ),
    );
    expect(antwoorden.map((a) => a.status)).toEqual([401, 401, 401]);
  });

  test("een ongeldige sessiecookie geeft 401", async () => {
    const antwoord = await stuur({ methode: "GET", pad: "/api/projecten" }, "better-auth.session_token=vals.vals");
    expect(antwoord.status).toBe(401);
  });

  test("vereisLid geeft de gebruiker, de actieve organisatie en de rol in API-namen", async () => {
    const eigenaar = await (await stuur({ methode: "GET", pad: "/test/lid" }, eigenaarA.cookie)).json();
    const lid = await (await stuur({ methode: "GET", pad: "/test/lid" }, lidA.cookie)).json();
    expect(eigenaar).toEqual({
      gebruiker: { id: eigenaarA.id, naam: "eigenaar-a", email: "eigenaar-a@voorbeeld.be" },
      organisatieId: orgA,
      rol: "eigenaar",
    });
    expect(lid).toMatchObject({ organisatieId: orgA, rol: "lid" });
  });

  test("een vereiste rol die ontbreekt: 403; een andere organisatie: 404", async () => {
    const rol = await stuur({ methode: "GET", pad: "/test/lid?rol=eigenaar" }, lidA.cookie);
    const ander = await stuur({ methode: "GET", pad: `/test/lid?organisatieId=${orgB}` }, eigenaarA.cookie);
    const onbekend = await stuur({ methode: "GET", pad: "/test/lid?organisatieId=bestaat-niet" }, eigenaarA.cookie);
    expect([rol.status, ander.status, onbekend.status]).toEqual([403, 404, 404]);
  });

  test("zonder actieve organisatie wordt het oudste lidmaatschap actief en in de sessie bewaard", async () => {
    const id = await registreer("twee@voorbeeld.be");
    await wordLid(id, orgB, "member", new Date("2026-01-01T00:00:00Z"));
    await wordLid(id, orgA, "member", new Date("2026-06-01T00:00:00Z"));
    const cookie = await inloggen("twee@voorbeeld.be");
    // Twee sessies: die van de bevestiging en die van de aanmelding, allebei zonder organisatie.
    const voor = await db.select().from(session).where(eq(session.userId, id));
    expect(voor.map((r) => r.activeOrganizationId)).toEqual([null, null]);

    const sessie = await (await stuur({ methode: "GET", pad: "/test/sessie" }, cookie)).json();
    expect(sessie).toMatchObject({ gebruiker: { id }, actieveOrganisatieId: orgB });
    // Alleen de sessie van dit verzoek krijgt de organisatie.
    const na = await db.select().from(session).where(eq(session.userId, id));
    expect(na.map((r) => r.activeOrganizationId).sort()).toEqual([orgB, null].sort());
  });

  test("een actieve organisatie die intussen gezet werd, wordt niet overschreven door de terugvaloptie", async () => {
    const id = await registreer("race@voorbeeld.be");
    await wordLid(id, orgB, "member", new Date("2026-01-01T00:00:00Z"));
    await wordLid(id, orgA, "member", new Date("2026-06-01T00:00:00Z"));
    await inloggen("race@voorbeeld.be");
    // vereisSessie las de sessie zonder organisatie; vóór de terugvaloptie schrijft, kiest de
    // gebruiker in een ander verzoek zelf A (niet het oudste lidmaatschap B).
    const [aanmelding] = await db
      .select()
      .from(session)
      .where(eq(session.userId, id))
      .orderBy(desc(session.createdAt))
      .limit(1);
    await db.update(session).set({ activeOrganizationId: orgA }).where(eq(session.id, aanmelding!.id));

    expect(await kiesActieveOrganisatie(aanmelding!.id, id)).toBe(orgA);
    const [na] = await db.select().from(session).where(eq(session.id, aanmelding!.id));
    expect(na!.activeOrganizationId).toBe(orgA);
  });

  test("de terugvaloptie zet het oudste lidmaatschap als de sessie nog leeg is, en geeft de waarde uit de database", async () => {
    const id = await registreer("terugval@voorbeeld.be");
    await wordLid(id, orgB, "member", new Date("2026-01-01T00:00:00Z"));
    await wordLid(id, orgA, "member", new Date("2026-06-01T00:00:00Z"));
    await inloggen("terugval@voorbeeld.be");
    const [aanmelding] = await db
      .select()
      .from(session)
      .where(eq(session.userId, id))
      .orderBy(desc(session.createdAt))
      .limit(1);
    expect(await kiesActieveOrganisatie(aanmelding!.id, id)).toBe(orgB);
    expect(await kiesActieveOrganisatie(aanmelding!.id, zonderOrganisatie.id)).toBeNull();
  });

  test("de lijst volgt de actieve organisatie; een project van een andere eigen organisatie blijft op id bereikbaar", async () => {
    const id = await registreer("wissel@voorbeeld.be");
    await wordLid(id, orgA, "member", new Date("2026-01-01T00:00:00Z"));
    await wordLid(id, orgB, "member", new Date("2026-06-01T00:00:00Z"));
    const cookie = await inloggen("wissel@voorbeeld.be");
    await db.update(session).set({ activeOrganizationId: orgB }).where(eq(session.userId, id));
    const vanA = await projectIn(orgA, "Op id");

    const lijst = (await (await stuur({ methode: "GET", pad: "/api/projecten" }, cookie)).json()) as { id: string }[];
    expect(lijst.map((p) => p.id)).not.toContain(vanA);
    const opId = await stuur({ methode: "GET", pad: `/api/projecten/${vanA}` }, cookie);
    expect(opId.status).toBe(200);
    expect(((await opId.json()) as { organisatieId: string }).organisatieId).toBe(orgA);
  });

  test("zonder lidmaatschap: geen actieve organisatie en 404 op de routes van een organisatie", async () => {
    const sessie = await (await stuur({ methode: "GET", pad: "/test/sessie" }, zonderOrganisatie.cookie)).json();
    expect(sessie).toMatchObject({ gebruiker: { id: zonderOrganisatie.id }, actieveOrganisatieId: null });
    const lijst = await stuur({ methode: "GET", pad: "/api/projecten" }, zonderOrganisatie.cookie);
    expect(lijst.status).toBe(404);
  });

  test("het lidmaatschap wordt bij elk verzoek opnieuw gecontroleerd", async () => {
    const id = await registreer("weg@voorbeeld.be");
    await wordLid(id, orgA, "member");
    const cookie = await inloggen("weg@voorbeeld.be");
    const project = await projectIn(orgA);
    expect((await stuur({ methode: "GET", pad: `/api/projecten/${project}` }, cookie)).status).toBe(200);
    expect((await stuur({ methode: "GET", pad: "/api/projecten" }, cookie)).status).toBe(200);

    await db.delete(member).where(and(eq(member.userId, id), eq(member.organizationId, orgA)));
    expect((await stuur({ methode: "GET", pad: `/api/projecten/${project}` }, cookie)).status).toBe(404);
    expect((await stuur({ methode: "GET", pad: "/api/projecten" }, cookie)).status).toBe(404);
  });

  test("vereisProjecttoegang: onbekend of van een andere organisatie geeft 404, anders de context met het project", async () => {
    const project = await projectIn(orgA);
    const onbekend = await stuur({ methode: "GET", pad: `/test/project/${crypto.randomUUID()}` }, eigenaarA.cookie);
    const ander = await stuur({ methode: "GET", pad: `/test/project/${project}` }, eigenaarB.cookie);
    const eigen = await stuur({ methode: "GET", pad: `/test/project/${project}` }, lidA.cookie);
    expect([onbekend.status, ander.status, eigen.status]).toEqual([404, 404, 200]);
    expect(await eigen.json()).toMatchObject({
      gebruiker: { id: lidA.id },
      organisatieId: orgA,
      rol: "lid",
      project: { id: project, organisatieId: orgA },
    });
  });
});
