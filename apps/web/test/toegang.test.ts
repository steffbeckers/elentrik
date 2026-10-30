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
import { type AbonnementConfig, zetAbonnementen } from "../server/abonnementen/config";
import { bewaarBedrijf, bewaarLogo, haalBedrijf } from "../server/bedrijf/repo";
import { maakLokaleOpslag, zetOpslag, type BestandOpslag } from "../server/bestanden/opslag";
import { bewaarBestand, haalBestand } from "../server/bestanden/repo";
import { type Db, zetDb } from "../server/db";
import { abonnementen, bedrijfsinstellingen, bestanden, invitation, member, projecten, session, user } from "../server/db/schema";
import { maakExport } from "../server/exports/repo";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { registratieLimiet } from "../server/organisaties/leden";
import { maakUitnodigingstoken } from "../server/organisaties/uitnodigingstoken";
import { haalProject, maakProject, verwijderProject } from "../server/projecten/repo";
import { kiesActieveOrganisatie, vereisLid, vereisProjecttoegang, vereisSessie } from "../server/utils/toegang";
import { VERWACHTE_GEBRUIKER_HEADER } from "../shared/gebruiker";
import { ACTIEVE_ORGANISATIE_HEADER } from "../shared/organisatie";
import type { ExportInvoer } from "../shared/exports";
import { maakTestDb } from "./db";
import { maakNepStripe } from "./nep-stripe";
import { apiPad, beveiligdeRoutebestanden, PUBLIEKE_ROUTES, routeUit } from "./routes";

// Gotenberg draait niet in Vitest: de PDF-dienst geeft een minimale geldige PDF terug.
vi.mock("../server/pdf/gotenberg", async (origineel) => ({
  ...(await origineel<typeof import("../server/pdf/gotenberg")>()),
  maakPdf: vi.fn(async () => new TextEncoder().encode("%PDF-1.7\n%%EOF\n")),
}));

const WACHTWOORD = "lang-genoeg-1";

// Abonnementen aan, met de nep-poort: de testorganisaties zitten binnen hun proef, dus de
// bestaande rijen van de tabel blijven gelijk.
const INGESCHAKELD: AbonnementConfig = {
  ingeschakeld: true,
  sleutel: "sk_test_nep",
  webhookGeheim: "whsec_toegang_test",
  prijzen: { maand: "price_maand", jaar: "price_jaar" },
  boekhoudingInbox: null,
  apiBasis: null,
};
const nepStripe = maakNepStripe();

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
  headers?: Record<string, string>;
};

async function stuur(verzoek: Verzoek, cookie?: string): Promise<Response> {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (verzoek.ifMatch !== undefined) headers.set("if-match", String(verzoek.ifMatch));
  for (const [naam, waarde] of Object.entries(verzoek.headers ?? {})) headers.set(naam, waarde);
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
  zetAbonnementen({ config: INGESCHAKELD, stripe: nepStripe });
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
  zetAbonnementen(undefined);
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

/** Elke testorganisatie krijgt een Stripe-klant (als ze er nog geen heeft); geeft die van A. */
async function zorgVoorKlanten(): Promise<string> {
  for (const [org, klant] of [[orgA, "cus_toegang_a"], [orgB, "cus_toegang_b"]] as const) {
    await db.insert(abonnementen).values({ organisatieId: org, stripeKlantId: klant }).onConflictDoNothing();
  }
  const [rij] = await db.select({ klantId: abonnementen.stripeKlantId }).from(abonnementen).where(eq(abonnementen.organisatieId, orgA));
  return rij!.klantId;
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
  "POST /api/projecten/uit-document": {
    // B maakt een project in B uit zijn eigen document (zie "een nieuw project uit een document").
    verzoek: async () => {
      const { document } = (await haalProject(db, orgA, await projectIn(orgA)))!;
      return { methode: "POST", pad: "/api/projecten/uit-document", json: { naam: "Uit document", document } };
    },
    andereOrganisatie: 201,
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
  "PUT /api/mij/taal": {
    // Alleen een sessie, geen organisatie: ook zonder organisatie lukt het. Elke actor zet zijn eigen taal.
    verzoek: async () => ({ methode: "PUT", pad: "/api/mij/taal", json: { taal: "nl" } }),
    zonderOrganisatie: 200,
    andereOrganisatie: 200,
    lid: 200,
    eigenaar: 200,
  },
  "GET /api/abonnement": {
    // Het overzicht van de actieve organisatie: B ziet zijn eigen overzicht, nooit dat van A.
    verzoek: async () => ({ methode: "GET", pad: "/api/abonnement" }),
    andereOrganisatie: 200,
    lid: 200,
    eigenaar: 200,
  },
  "POST /api/abonnement/checkout": {
    // Alleen een eigenaar, voor de actieve organisatie: B start een Checkout voor B.
    verzoek: async () => ({ methode: "POST", pad: "/api/abonnement/checkout", json: { formule: "maand" } }),
    andereOrganisatie: 200,
    lid: 403,
    eigenaar: 200,
  },
  "POST /api/abonnement/portaal": {
    verzoek: async () => {
      await zorgVoorKlanten();
      return { methode: "POST", pad: "/api/abonnement/portaal" };
    },
    andereOrganisatie: 200,
    lid: 403,
    eigenaar: 200,
  },
  "POST /api/abonnement/synchroniseer": {
    // Een sessie van A's klant: A synchroniseert (200), B krijgt 404 omdat de sessie niet van B is.
    verzoek: async () => {
      const klantA = await zorgVoorKlanten();
      nepStripe.checkouts.set("cs_toegang_a", { id: "cs_toegang_a", klantId: klantA, abonnementId: null });
      return { methode: "POST", pad: "/api/abonnement/synchroniseer", json: { sessie: "cs_toegang_a" } };
    },
    andereOrganisatie: 404,
    lid: 403,
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
  "GET /api/gezondheid": {
    // Publiek: de health-check van Docker en van de monitoring heeft geen sessie.
    publiek: true,
    verzoek: async () => ({ methode: "GET", pad: "/api/gezondheid" }),
    zonderSessie: 200,
    zonderOrganisatie: 200,
    andereOrganisatie: 200,
    lid: 200,
    eigenaar: 200,
  },
  "POST /api/stripe/webhook": {
    // Publiek: Stripe heeft geen sessie. Zonder handtekening geeft elke actor 400 (de handtekening
    // is de enige toegangscontrole); de inhoud staat in test/abonnement-webhook.test.ts.
    publiek: true,
    verzoek: async () => ({ methode: "POST", pad: "/api/stripe/webhook", json: { id: "evt_toegang" } }),
    zonderSessie: 400,
    zonderOrganisatie: 400,
    andereOrganisatie: 400,
    lid: 400,
    eigenaar: 400,
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

  test("een nieuw project uit een document: de plannen van een verwijderd project van dezelfde organisatie gaan mee, die van een andere niet", async () => {
    const bron = await projectIn(orgA, "Wordt verwijderd");
    const eigenPlan = (await bewaarBestand(db, opslag, { organisatieId: orgA, projectId: bron, soort: "plan-raster", data: png(10, 10) })).id;
    const vreemdPlan = await planIn(orgB);
    await verwijderProject(db, orgA, bron);
    const { document } = (await haalProject(db, orgA, await projectIn(orgA)))!;
    const metPlan = {
      ...document,
      situatie: {
        ...document.situatie,
        paginas: [
          { id: "p1", titel: "Eigen", plaatsingen: [], achtergrond: { origineelBestandId: eigenPlan, rasterBestandId: eigenPlan, breedte_px: 10, hoogte_px: 10 } },
          { id: "p2", titel: "Vreemd", plaatsingen: [], achtergrond: { origineelBestandId: vreemdPlan, rasterBestandId: vreemdPlan, breedte_px: 10, hoogte_px: 10 } },
        ],
      },
    };

    const antwoord = await stuur(
      { methode: "POST", pad: "/api/projecten/uit-document", json: { naam: "Nieuw", document: metPlan } },
      lidA.cookie,
    );
    expect(antwoord.status).toBe(201);
    const nieuw = (await antwoord.json()) as { id: string; versie: number; documentId: string; bestandIds: Record<string, string> };
    expect(nieuw.versie).toBe(1);
    expect(Object.keys(nieuw.bestandIds)).toEqual([eigenPlan]);

    const project = (await haalProject(db, orgA, nieuw.id))!;
    const [p1, p2] = project.document.situatie.paginas;
    expect(p1!.achtergrond!.origineelBestandId).toBe(nieuw.bestandIds[eigenPlan]);
    expect(p2!.achtergrond!.origineelBestandId).toBe(vreemdPlan);
    // Het nieuwe bestand is voor een lid van A te downloaden; het van B bleef van B.
    const bestand = await stuur({ methode: "GET", pad: `/api/bestanden/${nieuw.bestandIds[eigenPlan]}` }, lidA.cookie);
    expect(bestand.status).toBe(200);
    await bestand.arrayBuffer();
    // Het verwijderde bronproject is nog altijd onzichtbaar.
    expect((await stuur({ methode: "GET", pad: `/api/projecten/${bron}` }, lidA.cookie)).status).toBe(404);
  });

  test("een nieuw project uit een document: een ongeldige body is 400, een ongeldig document 422", async () => {
    const pad = "/api/projecten/uit-document";
    for (const json of [{}, { naam: "", document: {} }, { naam: "x".repeat(301), document: {} }, { naam: "X", document: "x" }]) {
      expect((await stuur({ methode: "POST", pad, json }, lidA.cookie)).status).toBe(400);
    }
    expect((await stuur({ methode: "POST", pad, json: { naam: "X", document: { onzin: true } } }, lidA.cookie)).status).toBe(422);
  });

  test("een nieuw project uit een document voor een andere gebruiker dan de sessie: 401, zonder iets aan te maken", async () => {
    const { document } = (await haalProject(db, orgA, await projectIn(orgA)))!;
    const voor = (await db.select({ id: projecten.id }).from(projecten)).length;
    const antwoord = await stuur(
      {
        methode: "POST",
        pad: "/api/projecten/uit-document",
        json: { naam: "X", document },
        headers: { [VERWACHTE_GEBRUIKER_HEADER]: eigenaarA.id },
      },
      lidA.cookie,
    );
    expect(antwoord.status).toBe(401);
    expect((await db.select({ id: projecten.id }).from(projecten)).length).toBe(voor);
  });

  test("dupliceren met extra bestandsid's: een ongeldige body is 400, een geldige geeft de toewijzing terug", async () => {
    const id = await projectIn(orgA);
    const pad = `/api/projecten/${id}/dupliceer`;
    for (const json of [{ bestandIds: "x" }, { bestandIds: [1] }, { bestandIds: Array.from({ length: 201 }, () => "a") }]) {
      expect((await stuur({ methode: "POST", pad, json }, lidA.cookie)).status).toBe(400);
    }
    const antwoord = await stuur({ methode: "POST", pad, json: { bestandIds: [crypto.randomUUID()] } }, lidA.cookie);
    expect(antwoord.status).toBe(201);
    expect(await antwoord.json()).toMatchObject({ bestandIds: {} });
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

  test("bewaren voor een andere gebruiker dan die van de sessie: 401 ANDERE_GEBRUIKER, niets gewijzigd", async () => {
    const id = await projectIn(orgA);
    const { document } = (await haalProject(db, orgA, id))!;
    const verzoek = (gebruiker?: string) =>
      fetch(`${basis}/api/projecten/${id}`, {
        method: "PUT",
        headers: {
          cookie: lidA.cookie,
          "if-match": "1",
          "content-type": "application/json",
          ...(gebruiker !== undefined ? { [VERWACHTE_GEBRUIKER_HEADER]: gebruiker } : {}),
        },
        body: JSON.stringify({ naam: "Van een ander", document }),
      });

    // Het werk van eigenaar A, terwijl lid A nu ingelogd is.
    const ander = await verzoek(eigenaarA.id);
    expect(ander.status).toBe(401);
    expect(((await ander.json()) as { data?: { code?: string } }).data?.code).toBe("ANDERE_GEBRUIKER");
    expect((await haalProject(db, orgA, id))!.versie).toBe(1);

    // Ook voor een project van een andere organisatie: 401, het bestaan lekt niet.
    const vreemd = await projectIn(orgB);
    const vreemdAntwoord = await fetch(`${basis}/api/projecten/${vreemd}`, {
      method: "PUT",
      headers: { cookie: lidA.cookie, "if-match": "1", [VERWACHTE_GEBRUIKER_HEADER]: eigenaarA.id },
    });
    expect(vreemdAntwoord.status).toBe(401);

    // Dupliceren (bewaren als kopie) evenmin.
    const kopie = await fetch(`${basis}/api/projecten/${id}/dupliceer`, {
      method: "POST",
      headers: { cookie: lidA.cookie, [VERWACHTE_GEBRUIKER_HEADER]: eigenaarA.id },
    });
    expect(kopie.status).toBe(401);

    // De juiste gebruiker, of geen header: bewaren lukt.
    expect((await verzoek(lidA.id)).status).toBe(200);
    expect((await haalProject(db, orgA, id))!.versie).toBe(2);
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

  test("plan en export van een verwijderd project geven dezelfde 404 als een onbekend id, ook voor een lid", async () => {
    const projectId = await projectIn(orgA);
    const plan = (await bewaarBestand(db, opslag, { organisatieId: orgA, projectId, soort: "plan-raster", data: png(10, 10) })).id;
    const exportInfo = await maakExport(db, opslag, orgA, projectId, 1, EXPORT_INVOER, {
      maakPdf: async () => new TextEncoder().encode("%PDF-1.7\n%%EOF\n"),
    });
    for (const id of [plan, exportInfo.bestandId]) {
      const voor = await stuur({ methode: "GET", pad: `/api/bestanden/${id}` }, lidA.cookie);
      await voor.arrayBuffer();
      expect(voor.status, id).toBe(200);
    }
    await verwijderProject(db, orgA, projectId);
    const onbekend = await stuur({ methode: "GET", pad: `/api/bestanden/${crypto.randomUUID()}` }, lidA.cookie);
    const verwacht = { status: onbekend.status, body: await onbekend.text() };
    expect(verwacht.status).toBe(404);
    for (const id of [plan, exportInfo.bestandId]) {
      for (const cookie of [lidA.cookie, eigenaarA.cookie]) {
        const antwoord = await stuur({ methode: "GET", pad: `/api/bestanden/${id}` }, cookie);
        expect({ status: antwoord.status, body: await antwoord.text() }, id).toEqual(verwacht);
      }
    }
  });

  test("een upload zonder content-length geeft 411 LENGTE_VEREIST, voor een plan en voor het logo", async () => {
    const projectId = await projectIn(orgA);
    const grens = "----elentrik-zonder-lengte";
    const inhoud = Buffer.concat([
      Buffer.from(
        `--${grens}\r\nContent-Disposition: form-data; name="soort"\r\n\r\nplan-raster\r\n--${grens}\r\n` +
          `Content-Disposition: form-data; name="bestand"; filename="plan.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      Buffer.from(png(10, 10)),
      Buffer.from(`\r\n--${grens}--\r\n`),
    ]);
    for (const pad of [`/api/projecten/${projectId}/bestanden`, "/api/bedrijfsgegevens/logo"]) {
      // Een stroom als body gaat met `Transfer-Encoding: chunked`, dus zonder content-length.
      const stroom = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(inhoud));
          controller.close();
        },
      });
      const antwoord = await fetch(`${basis}${pad}`, {
        method: "POST",
        headers: { cookie: eigenaarA.cookie, "content-type": `multipart/form-data; boundary=${grens}` },
        body: stroom,
        duplex: "half",
      } as RequestInit);
      const json = (await antwoord.json()) as { data?: { code?: string } };
      expect([antwoord.status, json.data?.code], pad).toEqual([411, "LENGTE_VEREIST"]);
    }
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

  test("zonder actieve organisatie en zonder eerdere keuze wordt het oudste lidmaatschap actief en in de sessie bewaard", async () => {
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

// --- De laatst gekozen organisatie (spec 2.4) ------------------------------------------------

async function actieveOrganisatie(cookie: string): Promise<string | null> {
  const sessie = (await (await stuur({ methode: "GET", pad: "/test/sessie" }, cookie)).json()) as {
    actieveOrganisatieId: string | null;
  };
  return sessie.actieveOrganisatieId;
}

describe("de laatst gekozen organisatie", () => {
  test("na een wissel naar Y en opnieuw inloggen is Y actief, niet het oudste lidmaatschap", async () => {
    const id = await registreer("laatst-gekozen@voorbeeld.be");
    await wordLid(id, orgB, "member", new Date("2026-01-01T00:00:00Z"));
    await wordLid(id, orgA, "member", new Date("2026-06-01T00:00:00Z"));
    const eerste = await inloggen("laatst-gekozen@voorbeeld.be");
    expect(await actieveOrganisatie(eerste)).toBe(orgB);
    const wissel = await stuur(
      { methode: "POST", pad: "/api/organisaties/actief", json: { organisatieId: orgA } },
      eerste,
    );
    expect(wissel.status).toBe(200);

    const tweede = await inloggen("laatst-gekozen@voorbeeld.be");
    expect(await actieveOrganisatie(tweede)).toBe(orgA);
  });

  test("na een wissel naar Y, uitloggen en weer inloggen in dezelfde browser is Y actief", async () => {
    const id = await registreer("uitloggen-gekozen@voorbeeld.be");
    await wordLid(id, orgB, "member", new Date("2026-01-01T00:00:00Z"));
    await wordLid(id, orgA, "member", new Date("2026-06-01T00:00:00Z"));
    const eerste = await inloggen("uitloggen-gekozen@voorbeeld.be");
    await stuur({ methode: "POST", pad: "/api/organisaties/actief", json: { organisatieId: orgA } }, eerste);
    const [rij] = await db.select({ laatste: user.laatsteOrganisatieId }).from(user).where(eq(user.id, id));
    expect(rij!.laatste).toBe(orgA);

    // Uitloggen verwijdert de sessie: geen enkele sessie onthoudt A nog.
    await auth.api.signOut({ headers: new Headers({ cookie: eerste }) });
    const sessies = await db.select({ actief: session.activeOrganizationId }).from(session).where(eq(session.userId, id));
    expect(sessies.map((s) => s.actief)).not.toContain(orgA);

    const tweede = await inloggen("uitloggen-gekozen@voorbeeld.be");
    expect(await actieveOrganisatie(tweede)).toBe(orgA);
  });

  test("uitgelogd en intussen geen lid meer van Y: het oudste lidmaatschap", async () => {
    const id = await registreer("uitloggen-weg@voorbeeld.be");
    await wordLid(id, orgB, "member", new Date("2026-01-01T00:00:00Z"));
    await wordLid(id, orgA, "member", new Date("2026-06-01T00:00:00Z"));
    const eerste = await inloggen("uitloggen-weg@voorbeeld.be");
    await stuur({ methode: "POST", pad: "/api/organisaties/actief", json: { organisatieId: orgA } }, eerste);
    await auth.api.signOut({ headers: new Headers({ cookie: eerste }) });
    await db.delete(member).where(and(eq(member.userId, id), eq(member.organizationId, orgA)));

    const tweede = await inloggen("uitloggen-weg@voorbeeld.be");
    expect(await actieveOrganisatie(tweede)).toBe(orgB);
  });

  test("zonder bewaarde keuze bij de gebruiker telt de laatst bijgewerkte andere sessie", async () => {
    const id = await registreer("andere-sessie@voorbeeld.be");
    await wordLid(id, orgB, "member", new Date("2026-01-01T00:00:00Z"));
    await wordLid(id, orgA, "member", new Date("2026-06-01T00:00:00Z"));
    const eerste = await inloggen("andere-sessie@voorbeeld.be");
    await stuur({ methode: "POST", pad: "/api/organisaties/actief", json: { organisatieId: orgA } }, eerste);
    await db.update(user).set({ laatsteOrganisatieId: null }).where(eq(user.id, id));

    const tweede = await inloggen("andere-sessie@voorbeeld.be");
    expect(await actieveOrganisatie(tweede)).toBe(orgA);
  });

  test("de eerste organisatie uit de registratie wordt de laatst gekozen organisatie", async () => {
    const [rij] = await db.select({ laatste: user.laatsteOrganisatieId }).from(user).where(eq(user.id, eigenaarA.id));
    expect(rij!.laatste).toBe(orgA);
  });

  test("is de gebruiker geen lid meer van de laatst gekozen organisatie, dan het oudste lidmaatschap", async () => {
    const id = await registreer("niet-meer-gekozen@voorbeeld.be");
    await wordLid(id, orgB, "member", new Date("2026-01-01T00:00:00Z"));
    await wordLid(id, orgA, "member", new Date("2026-06-01T00:00:00Z"));
    const eerste = await inloggen("niet-meer-gekozen@voorbeeld.be");
    await stuur({ methode: "POST", pad: "/api/organisaties/actief", json: { organisatieId: orgA } }, eerste);
    await db.delete(member).where(and(eq(member.userId, id), eq(member.organizationId, orgA)));

    const tweede = await inloggen("niet-meer-gekozen@voorbeeld.be");
    expect(await actieveOrganisatie(tweede)).toBe(orgB);
  });
});

// --- Een verouderd tabblad (x-elentrik-organisatie) ------------------------------------------

describe("schrijven op de actieve organisatie vanuit een verouderd tabblad", () => {
  // T is eigenaar van Een en Twee; zijn sessie wisselde (in een ander tabblad) naar Twee, maar
  // het oude tabblad denkt nog dat Een actief is.
  let t: Gebruiker;
  let een: string;
  let twee: string;
  const voor = (organisatieId: string) => ({ [ACTIEVE_ORGANISATIE_HEADER]: organisatieId });

  async function foutcode(antwoord: Response): Promise<string | undefined> {
    return ((await antwoord.json()) as { data?: { code?: string } }).data?.code;
  }

  async function projectenIn(organisatieId: string): Promise<number> {
    return (await db.select({ id: projecten.id }).from(projecten).where(eq(projecten.organisatieId, organisatieId)))
      .length;
  }

  beforeAll(async () => {
    t = await gebruiker("tabbladen@voorbeeld.be", "Tab Een");
    een = await organisatieVan(t.id);
    const ander = await gebruiker("tabbladen-twee@voorbeeld.be", "Tab Twee");
    twee = await organisatieVan(ander.id);
    await wordLid(t.id, twee, "owner");
    const wissel = await stuur(
      { methode: "POST", pad: "/api/organisaties/actief", json: { organisatieId: twee } },
      t.cookie,
    );
    expect(wissel.status).toBe(200);
    await bewaarBedrijf(db, een, { naam: "Gegevens Een" });
    await bewaarBedrijf(db, twee, { naam: "Gegevens Twee" });
  });

  test("bedrijfsgegevens bewaren: 409 ANDERE_ORGANISATIE en niets gewijzigd", async () => {
    const antwoord = await stuur(
      { methode: "PUT", pad: "/api/bedrijfsgegevens", json: { naam: "Bedoeld voor Een" }, headers: voor(een) },
      t.cookie,
    );
    expect(antwoord.status).toBe(409);
    expect(await foutcode(antwoord)).toBe("ANDERE_ORGANISATIE");
    expect((await haalBedrijf(db, een)).naam).toBe("Gegevens Een");
    expect((await haalBedrijf(db, twee)).naam).toBe("Gegevens Twee");
  });

  test("een nieuw project: 409 ANDERE_ORGANISATIE en geen project", async () => {
    const [voorEen, voorTwee] = [await projectenIn(een), await projectenIn(twee)];
    const antwoord = await stuur(
      {
        methode: "POST",
        pad: "/api/projecten",
        json: { naam: "Bedoeld voor Een", klantnaam: "", stroomtype: "2x230V" },
        headers: voor(een),
      },
      t.cookie,
    );
    expect(antwoord.status).toBe(409);
    expect(await foutcode(antwoord)).toBe("ANDERE_ORGANISATIE");
    expect([await projectenIn(een), await projectenIn(twee)]).toEqual([voorEen, voorTwee]);
  });

  test("de organisatie verlaten: 409 ANDERE_ORGANISATIE en nog altijd lid van beide", async () => {
    const antwoord = await stuur({ methode: "POST", pad: "/api/organisaties/verlaten", headers: voor(een) }, t.cookie);
    expect(antwoord.status).toBe(409);
    expect(await foutcode(antwoord)).toBe("ANDERE_ORGANISATIE");
    const lidmaatschappen = await db.select({ org: member.organizationId }).from(member).where(eq(member.userId, t.id));
    expect(lidmaatschappen.map((l) => l.org).sort()).toEqual([een, twee].sort());
  });

  test("logo, naam, uitnodigen, intrekken, rol wijzigen en verwijderen: 409, en niets gewijzigd", async () => {
    const uitnodiging = await uitnodigingIn(een);
    const lid = await extraLid(een);
    const gast = "gast-verouderd@voorbeeld.be";
    const verzoeken: Verzoek[] = [
      { methode: "POST", pad: "/api/bedrijfsgegevens/logo", formulier: pngFormulier() },
      { methode: "PUT", pad: "/api/organisaties/naam", json: { naam: "Gekaapt" } },
      { methode: "POST", pad: "/api/organisaties/uitnodigingen", json: { email: gast, rol: "lid" } },
      { methode: "DELETE", pad: `/api/organisaties/uitnodigingen/${uitnodiging}` },
      { methode: "PUT", pad: `/api/organisaties/leden/${lid}`, json: { rol: "eigenaar" } },
      { methode: "DELETE", pad: `/api/organisaties/leden/${lid}` },
    ];
    for (const verzoek of verzoeken) {
      const antwoord = await stuur({ ...verzoek, headers: voor(een) }, t.cookie);
      expect([antwoord.status, await foutcode(antwoord)], `${verzoek.methode} ${verzoek.pad}`).toEqual([
        409,
        "ANDERE_ORGANISATIE",
      ]);
    }
    expect((await haalBedrijf(db, een)).logoBestandId).toBeUndefined();
    expect((await haalBedrijf(db, twee)).logoBestandId).toBeUndefined();
    const mij = (await (await stuur({ methode: "GET", pad: "/api/mij" }, t.cookie)).json()) as {
      organisaties: { naam: string }[];
    };
    expect(mij.organisaties.map((o) => o.naam).sort()).toEqual(["Tab Een", "Tab Twee"]);
    expect(await db.select().from(invitation).where(eq(invitation.email, gast))).toEqual([]);
    const [open] = await db.select({ status: invitation.status }).from(invitation).where(eq(invitation.id, uitnodiging));
    expect(open!.status).toBe("pending");
    const [extra] = await db.select({ rol: member.role }).from(member).where(eq(member.id, lid));
    expect(extra!.rol).toBe("member");
  });

  test("met de actieve organisatie in de header, of zonder header: bewaren lukt", async () => {
    const juist = await stuur(
      { methode: "PUT", pad: "/api/bedrijfsgegevens", json: { naam: "Twee bewaard" }, headers: voor(twee) },
      t.cookie,
    );
    expect(juist.status).toBe(200);
    expect((await haalBedrijf(db, twee)).naam).toBe("Twee bewaard");
    const zonder = await stuur({ methode: "PUT", pad: "/api/bedrijfsgegevens", json: { naam: "Twee zonder" } }, t.cookie);
    expect(zonder.status).toBe(200);
    expect((await haalBedrijf(db, twee)).naam).toBe("Twee zonder");
    expect((await haalBedrijf(db, een)).naam).toBe("Gegevens Een");
  });

  test("projectroutes gaan op lidmaatschap en negeren de header", async () => {
    const id = await projectIn(een);
    const { document } = (await haalProject(db, een, id))!;
    const antwoord = await stuur(
      { methode: "PUT", pad: `/api/projecten/${id}`, ifMatch: 1, json: { naam: "In Een", document }, headers: voor(een) },
      t.cookie,
    );
    expect(antwoord.status).toBe(200);
    expect((await haalProject(db, een, id))!.versie).toBe(2);
  });
});

// --- CSRF: verzoeken van een andere site -----------------------------------------------------

describe("verzoeken van een andere site", () => {
  async function aantalProjecten(): Promise<number> {
    return (await db.select({ id: projecten.id }).from(projecten).where(eq(projecten.organisatieId, orgA))).length;
  }

  const nieuwProject = { naam: "Via een andere site", klantnaam: "", stroomtype: "2x230V" };

  test("een POST, PUT of DELETE van een andere site: 403, en er verandert niets", async () => {
    const voor = await aantalProjecten();
    const gevallen: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "cross-site", origin: "http://127.0.0.1:3000" },
      { origin: "http://kwaad.example" },
      { origin: "http://127.0.0.1:3100" },
      { origin: "null" },
      // Een andere lokale app op een andere poort is voor de browser dezelfde site.
      { "sec-fetch-site": "same-site", origin: "http://127.0.0.1:3100" },
      { "sec-fetch-site": "same-origin", origin: "http://kwaad.example" },
    ];
    for (const headers of gevallen) {
      const antwoord = await stuur(
        { methode: "POST", pad: "/api/projecten", json: nieuwProject, headers },
        eigenaarA.cookie,
      );
      expect(antwoord.status, JSON.stringify(headers)).toBe(403);
    }
    expect(await aantalProjecten()).toBe(voor);

    await bewaarBedrijf(db, orgA, { naam: "Niet van buiten" });
    const put = await stuur(
      {
        methode: "PUT",
        pad: "/api/bedrijfsgegevens",
        json: { naam: "Van buiten" },
        headers: { "sec-fetch-site": "cross-site" },
      },
      eigenaarA.cookie,
    );
    expect(put.status).toBe(403);
    expect((await haalBedrijf(db, orgA)).naam).toBe("Niet van buiten");

    const id = await projectIn(orgA);
    const weg = await stuur(
      { methode: "DELETE", pad: `/api/projecten/${id}`, headers: { "sec-fetch-site": "cross-site" } },
      eigenaarA.cookie,
    );
    expect(weg.status).toBe(403);
    expect(await haalProject(db, orgA, id)).not.toBeNull();
  });

  test("ook een publieke route weigert een POST van een andere site", async () => {
    const antwoord = await stuur({
      methode: "POST",
      pad: `/api/uitnodigingen/${await uitnodigingstokenIn(orgA)}/registreer`,
      json: { naam: "Buiten", wachtwoord: "lang-genoeg-123" },
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(antwoord.status).toBe(403);
  });

  test("dezelfde oorsprong, dezelfde site, de eigen origin (ook als localhost) of geen van beide: toegelaten", async () => {
    const voor = await aantalProjecten();
    const gevallen: Record<string, string>[] = [
      { "sec-fetch-site": "same-origin", origin: "http://127.0.0.1:3000" },
      { "sec-fetch-site": "same-origin", origin: "http://localhost:3000" },
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "none" },
      { origin: "http://127.0.0.1:3000" },
      { origin: "http://localhost:3000" },
      {},
    ];
    for (const headers of gevallen) {
      const antwoord = await stuur(
        { methode: "POST", pad: "/api/projecten", json: nieuwProject, headers },
        eigenaarA.cookie,
      );
      expect(antwoord.status, JSON.stringify(headers)).toBe(201);
    }
    expect(await aantalProjecten()).toBe(voor + gevallen.length);
  });

  test("lezen (GET) van een andere site blijft toegelaten", async () => {
    const antwoord = await stuur(
      {
        methode: "GET",
        pad: "/api/projecten",
        headers: { "sec-fetch-site": "cross-site", origin: "http://kwaad.example" },
      },
      eigenaarA.cookie,
    );
    expect(antwoord.status).toBe(200);
  });
});

// Isolatie: een onbekend id en het id van een object van een andere organisatie moeten voor elk
// soort object exact dezelfde fout geven (status, statusMessage, message en data.code), anders
// verraadt het verschil dat het object bestaat. Zie server/fouten.ts.
describe("niet gevonden is voor elk soort object identiek", () => {
  type Foutantwoord = { status: number; statusMessage: string; message: unknown; data: unknown };

  async function foutVan(verzoek: Verzoek, cookie: string): Promise<Foutantwoord> {
    const antwoord = await stuur(verzoek, cookie);
    const lichaam = (await antwoord.json()) as { statusMessage?: string; message?: unknown; data?: unknown };
    return { status: antwoord.status, statusMessage: lichaam.statusMessage ?? "", message: lichaam.message, data: lichaam.data };
  }

  const NIEUWE_BESTANDSFORMULIER = () => pngFormulier({ soort: "plan-raster" });

  type Soort = { naam: string; bestaand: () => Promise<string>; maak: (id: string) => Verzoek };

  const SOORTEN: Soort[] = [
    {
      naam: "bestand (GET)",
      bestaand: async () => (await bewaarLogo(db, opslag, orgA, png(10, 10))).id,
      maak: (id) => ({ methode: "GET", pad: `/api/bestanden/${id}` }),
    },
    { naam: "project (GET)", bestaand: () => projectIn(orgA), maak: (id) => ({ methode: "GET", pad: `/api/projecten/${id}` }) },
    {
      naam: "project (PUT)",
      bestaand: () => projectIn(orgA),
      maak: (id) => ({ methode: "PUT", pad: `/api/projecten/${id}`, ifMatch: 1, json: { naam: "X", document: {} } }),
    },
    { naam: "project (DELETE)", bestaand: () => projectIn(orgA), maak: (id) => ({ methode: "DELETE", pad: `/api/projecten/${id}` }) },
    {
      naam: "project dupliceren",
      bestaand: () => projectIn(orgA),
      maak: (id) => ({ methode: "POST", pad: `/api/projecten/${id}/dupliceer` }),
    },
    {
      naam: "planbestand uploaden",
      bestaand: () => projectIn(orgA),
      maak: (id) => ({ methode: "POST", pad: `/api/projecten/${id}/bestanden`, formulier: NIEUWE_BESTANDSFORMULIER() }),
    },
    {
      naam: "exports (GET)",
      bestaand: () => projectIn(orgA),
      maak: (id) => ({ methode: "GET", pad: `/api/projecten/${id}/exports` }),
    },
    {
      naam: "export maken (POST)",
      bestaand: () => projectIn(orgA),
      maak: (id) => ({ methode: "POST", pad: `/api/projecten/${id}/exports`, ifMatch: 1, json: EXPORT_INVOER }),
    },
    {
      naam: "lid (rol wijzigen)",
      bestaand: () => extraLid(orgA),
      maak: (id) => ({ methode: "PUT", pad: `/api/organisaties/leden/${id}`, json: { rol: "lid" } }),
    },
    {
      naam: "lid (verwijderen)",
      bestaand: () => extraLid(orgA),
      maak: (id) => ({ methode: "DELETE", pad: `/api/organisaties/leden/${id}` }),
    },
    {
      naam: "uitnodiging (intrekken)",
      bestaand: () => uitnodigingIn(orgA),
      maak: (id) => ({ methode: "DELETE", pad: `/api/organisaties/uitnodigingen/${id}` }),
    },
    {
      naam: "Checkout-sessie (synchroniseer)",
      bestaand: async () => "cs_van_a",
      maak: (id) => ({ methode: "POST", pad: "/api/abonnement/synchroniseer", json: { sessie: id } }),
    },
  ];

  test.each(SOORTEN)("$naam: onbekend, misvormd en van een andere organisatie zijn identiek", async ({ bestaand, maak }) => {
    const vreemd = await foutVan(maak(await bestaand()), eigenaarB.cookie);
    const onbekend = await foutVan(maak(crypto.randomUUID()), eigenaarB.cookie);
    expect(vreemd.status).toBe(404);
    expect(vreemd.data).toEqual({ code: "NIET_GEVONDEN" });
    expect(vreemd.statusMessage).toBe("Niet gevonden");
    expect(onbekend).toEqual(vreemd);
    // Een misvormd id (geen uuid) verschilt evenmin van een onbekend id.
    const misvormd = await foutVan(maak("geen-uuid"), eigenaarB.cookie);
    expect(misvormd).toEqual(vreemd);
  });

  test("bestand: het bestand van een andere organisatie en een bestand zonder organisatie of inhoud zijn identiek", async () => {
    const zonderOrg = crypto.randomUUID();
    await db.insert(bestanden).values({
      id: zonderOrg,
      organisatieId: null,
      soort: "logo",
      mime: "image/png",
      grootte: 33,
      sleutel: `bedrijf/${zonderOrg}`,
    });
    const zonderInhoud = crypto.randomUUID();
    await db.insert(bestanden).values({
      id: zonderInhoud,
      organisatieId: orgB,
      soort: "logo",
      mime: "image/png",
      grootte: 33,
      sleutel: `org/${orgB}/${zonderInhoud}`,
    });
    const vreemd = await foutVan({ methode: "GET", pad: `/api/bestanden/${(await bewaarLogo(db, opslag, orgA, png(10, 10))).id}` }, eigenaarB.cookie);
    for (const id of [zonderOrg, zonderInhoud]) {
      expect(await foutVan({ methode: "GET", pad: `/api/bestanden/${id}` }, eigenaarB.cookie)).toEqual(vreemd);
    }
  });
});
