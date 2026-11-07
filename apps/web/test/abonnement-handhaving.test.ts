// De handhaving per project (402 PROJECT_LIMIET en PROJECT_ALLEEN_LEZEN, de stempel), de toegang
// per organisatie in /api/mij en de synchronisatie van een Stripe-klant. De routebestanden draaien in een echte h3-app op 127.0.0.1
// met Better Auth en de database op PGlite (zoals test/toegang.test.ts); Stripe is de nep-poort.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NIEUWE_KRING_AUTOMAAT, telVoorLimiet, voegToe, type InstallatieDocument } from "@elentrik/model";
import { eq } from "drizzle-orm";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { type Auth, maakAuth, zetAuth } from "../server/auth";
import { type AbonnementConfig, zetAbonnementen } from "../server/abonnementen/config";
import { haalAbonnementRij, toegangVoor } from "../server/abonnementen/repo";
import { startCorrectie } from "../server/admin/correcties";
import { bewaarAdminProject } from "../server/admin/projecten";
import type { StripeAbonnement } from "../server/abonnementen/stripe";
import { synchroniseerKlant } from "../server/abonnementen/synchronisatie";
import { maakLokaleOpslag, zetOpslag } from "../server/bestanden/opslag";
import { type Db, zetDb } from "../server/db";
import { abonnementen, member, organization, projecten, user } from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { haalProject, maakProject } from "../server/projecten/repo";
import type { AbonnementStatus } from "../shared/abonnement";
import type { ExportInvoer } from "../shared/exports";
import { maakNepStripe } from "./nep-stripe";
import { maakTestDb, maakTestOrganisatie } from "./db";
import { beveiligdeRoutebestanden, routeUit } from "./routes";

// Gotenberg draait niet in Vitest: de PDF-dienst geeft een minimale geldige PDF terug.
vi.mock("../server/pdf/gotenberg", async (origineel) => ({
  ...(await origineel<typeof import("../server/pdf/gotenberg")>()),
  maakPdf: vi.fn(async () => new TextEncoder().encode("%PDF-1.7\n%%EOF\n")),
}));

const WACHTWOORD = "lang-genoeg-1";
const DAG_MS = 24 * 3600 * 1000;

const INGESCHAKELD: AbonnementConfig = {
  ingeschakeld: true,
  sleutel: "sk_test_nep",
  webhookGeheim: null,
  prijzen: { maand: "price_maand", jaar: "price_jaar", project: null },
  limieten: { kringen: 5, situatieschemas: 1 },
  boekhoudingInbox: null,
  apiBasis: null,
};

let db: Db;
let auth: Auth;
let map: string;
let server: Server;
let basis: string;

const mails: Mail[] = [];
const verzamelaar: Verzender = {
  async verstuur(mail) {
    mails.push(mail);
  },
};

// --- Hulp ------------------------------------------------------------------------------------

function png(): Uint8Array {
  const data = new Uint8Array(33);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(data.buffer);
  view.setUint32(8, 13);
  data.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 10);
  view.setUint32(20, 10);
  return data;
}

function pngFormulier(): FormData {
  const form = new FormData();
  form.append("soort", "plan-raster");
  form.append("bestand", new Blob([png() as BlobPart], { type: "image/png" }), "plan.png");
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

/** Registreert en bevestigt een gebruiker met een bedrijf, logt in en geeft zijn cookie en organisatie. */
async function nieuweGebruiker(email: string, bedrijf: string) {
  await auth.api.signUpEmail({
    body: { name: email.split("@")[0]!, email, password: WACHTWOORD, wachtendeBedrijfsnaam: bedrijf },
    headers: authHeaders(),
  });
  await new Promise((klaar) => setTimeout(klaar, 0));
  const mail = mails.find((m) => m.aan === email);
  const token = new URL(mail!.tekst.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  await auth.api.verifyEmail({ query: { token }, headers: authHeaders() });
  const { headers } = await auth.api.signInEmail({
    body: { email, password: WACHTWOORD },
    headers: authHeaders(),
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const [rij] = await db
    .select({ id: user.id, organisatieId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  return { id: rij!.id, organisatieId: rij!.organisatieId, cookie };
}

type Verzoek = { methode: string; pad: string; json?: unknown; formulier?: FormData; ifMatch?: number };

async function stuur(verzoek: Verzoek, cookie: string): Promise<Response> {
  const headers = new Headers({ cookie });
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

async function zetProefEinde(organisatieId: string, einde: Date) {
  await db.update(organization).set({ proefEinde: einde }).where(eq(organization.id, organisatieId));
}

async function projectIn(organisatieId: string): Promise<string> {
  return (await maakProject(db, organisatieId, { naam: "Woning", klantnaam: "", stroomtype: "3N400V" })).id;
}

// --- Opzet -----------------------------------------------------------------------------------

let eigenaar: Awaited<ReturnType<typeof nieuweGebruiker>>;

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
  zetVerzender(verzamelaar);
  db = await maakTestDb();
  auth = maakAuth(db);
  zetDb(db);
  zetAuth(auth);
  map = await mkdtemp(join(tmpdir(), "elentrik-handhaving-"));
  zetOpslag(maakLokaleOpslag(map));

  const app = createApp();
  const router = createRouter();
  for (const route of beveiligdeRoutebestanden().map(routeUit)) {
    const module = (await import(route.bestand)) as { default: EventHandler };
    router.use(route.pad, module.default, route.methode);
  }
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  eigenaar = await nieuweGebruiker("eigenaar@voorbeeld.be", "Bedrijf");
}, 120_000);

afterEach(() => {
  zetAbonnementen(undefined);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await new Promise((klaar) => server?.close(klaar));
  await rm(map, { recursive: true, force: true });
  zetAbonnementen(undefined);
  vi.unstubAllEnvs();
});

function schakelIn() {
  zetAbonnementen({ config: INGESCHAKELD, stripe: maakNepStripe() });
}

// --- 402 op de schrijfroutes -----------------------------------------------------------------

describe("alleen-lezen zonder schrijfrecht", () => {
  async function schrijfVerzoeken(): Promise<Record<string, Verzoek>> {
    const id = await projectIn(eigenaar.organisatieId);
    const { document } = (await haalProject(db, eigenaar.organisatieId, id))!;
    return {
      "POST /api/projecten": {
        methode: "POST",
        pad: "/api/projecten",
        json: { naam: "Nieuw", klantnaam: "", stroomtype: "3N400V" },
      },
      "PUT /api/projecten/:id": { methode: "PUT", pad: `/api/projecten/${id}`, ifMatch: 1, json: { document } },
      "POST /api/projecten/:id/dupliceer": { methode: "POST", pad: `/api/projecten/${id}/dupliceer` },
      "POST /api/projecten/uit-document": {
        methode: "POST",
        pad: "/api/projecten/uit-document",
        json: { naam: "Uit document", document },
      },
      "POST /api/projecten/:id/bestanden": {
        methode: "POST",
        pad: `/api/projecten/${id}/bestanden`,
        formulier: pngFormulier(),
      },
    };
  }

  async function tel(): Promise<{ projecten: number; versies: number[] }> {
    const rijen = await db.select({ versie: projecten.versie }).from(projecten);
    return { projecten: rijen.length, versies: rijen.map((r) => r.versie).sort() };
  }

  test("dezelfde organisatie mag nog lezen, exporteren, verwijderen en beheren", async () => {
    schakelIn();
    await zetProefEinde(eigenaar.organisatieId, new Date(Date.now() - DAG_MS));
    const id = await projectIn(eigenaar.organisatieId);
    const verwijderId = await projectIn(eigenaar.organisatieId);

    const toegelaten: [string, Verzoek, number][] = [
      ["GET /api/projecten", { methode: "GET", pad: "/api/projecten" }, 200],
      ["GET /api/projecten/:id", { methode: "GET", pad: `/api/projecten/${id}` }, 200],
      [
        "POST /api/projecten/:id/exports",
        { methode: "POST", pad: `/api/projecten/${id}/exports`, ifMatch: 1, json: EXPORT_INVOER },
        201,
      ],
      ["DELETE /api/projecten/:id", { methode: "DELETE", pad: `/api/projecten/${verwijderId}` }, 204],
      ["PUT /api/bedrijfsgegevens", { methode: "PUT", pad: "/api/bedrijfsgegevens", json: { naam: "Elektro" } }, 200],
      ["PUT /api/organisaties/naam", { methode: "PUT", pad: "/api/organisaties/naam", json: { naam: "Hernoemd" } }, 200],
      [
        "POST /api/organisaties/uitnodigingen",
        {
          methode: "POST",
          pad: "/api/organisaties/uitnodigingen",
          json: { email: "gast@voorbeeld.be", rol: "lid" },
        },
        201,
      ],
    ];
    for (const [naam, verzoek, status] of toegelaten) {
      expect((await stuur(verzoek, eigenaar.cookie)).status, naam).toBe(status);
    }
  });

  test("een vrijgestelde organisatie krijgt geen 402", async () => {
    schakelIn();
    await zetProefEinde(eigenaar.organisatieId, new Date(Date.now() - DAG_MS));
    await db.update(organization).set({ vrijgesteld: true }).where(eq(organization.id, eigenaar.organisatieId));
    try {
      for (const [naam, verzoek] of Object.entries(await schrijfVerzoeken())) {
        expect((await stuur(verzoek, eigenaar.cookie)).status, naam).not.toBe(402);
      }
    } finally {
      await db.update(organization).set({ vrijgesteld: false }).where(eq(organization.id, eigenaar.organisatieId));
    }
  });

  test("met abonnementen uit krijgt niemand een 402", async () => {
    zetAbonnementen({ config: { ingeschakeld: false, limieten: { kringen: 5, situatieschemas: 1 } }, stripe: null });
    await zetProefEinde(eigenaar.organisatieId, new Date(Date.now() - DAG_MS));
    for (const [naam, verzoek] of Object.entries(await schrijfVerzoeken())) {
      expect((await stuur(verzoek, eigenaar.cookie)).status, naam).not.toBe(402);
    }
  });

  test("een lopende proef geeft schrijfrecht", async () => {
    schakelIn();
    await zetProefEinde(eigenaar.organisatieId, new Date(Date.now() + 5 * DAG_MS));
    const antwoord = await stuur((await schrijfVerzoeken())["POST /api/projecten"]!, eigenaar.cookie);
    expect(antwoord.status).toBe(201);
  });
});

// --- Handhaving per project: limiet, alleen-lezen en stempel ---------------------------------

describe("handhaving per project", () => {
  const actor = { id: "support", naam: "Support", sessieId: "sessie" };

  /** Zet het niveau van de organisatie van de eigenaar; `abonnement` via een actief abonnement. */
  async function zetNiveau(niveau: "gratis" | "abonnement" | "onderwijs") {
    await db.delete(abonnementen).where(eq(abonnementen.organisatieId, eigenaar.organisatieId));
    await db
      .update(organization)
      .set({ proefEinde: new Date(Date.now() - DAG_MS), vrijgesteld: false, onderwijs: niveau === "onderwijs" })
      .where(eq(organization.id, eigenaar.organisatieId));
    if (niveau === "abonnement") {
      await db.insert(abonnementen).values({
        organisatieId: eigenaar.organisatieId,
        stripeKlantId: "cus_handhaving",
        stripeAbonnementId: "sub_handhaving",
        status: "active",
        formule: "maand",
      });
    }
  }

  afterEach(async () => {
    await zetNiveau("gratis");
  });

  /** Het document met `n` automaten (kringen) extra in het verdeelbord. */
  function metKringen(document: InstallatieDocument, n: number): InstallatieDocument {
    const bord = Object.values(document.nodes).find((node) => node.type === "verdeelbord")!.id;
    let doc = document;
    for (let i = 0; i < n; i++) doc = voegToe(doc, bord, NIEUWE_KRING_AUTOMAAT).doc;
    return doc;
  }

  /** Een project van de eigenaar met `kringen` kringen, rechtstreeks in de database (versie 1). */
  async function projectMet(kringen: number): Promise<{ id: string; document: InstallatieDocument }> {
    const id = await projectIn(eigenaar.organisatieId);
    const document = metKringen((await haalProject(db, eigenaar.organisatieId, id))!.document, kringen);
    await db.update(projecten).set({ document }).where(eq(projecten.id, id));
    return { id, document };
  }

  async function rij(id: string) {
    const [r] = await db.select().from(projecten).where(eq(projecten.id, id));
    return r!;
  }

  function bewaar(id: string, versie: number, document: InstallatieDocument): Promise<Response> {
    return stuur({ methode: "PUT", pad: `/api/projecten/${id}`, ifMatch: versie, json: { document } }, eigenaar.cookie);
  }

  test("gratis: zesde kring via PUT geeft 402 PROJECT_LIMIET en niets verandert", async () => {
    schakelIn();
    await zetNiveau("gratis");
    const { id, document } = await projectMet(5);

    const antwoord = await bewaar(id, 1, metKringen(document, 1));

    expect(antwoord.status).toBe(402);
    expect(((await antwoord.json()) as { data: unknown }).data).toEqual({
      code: "PROJECT_LIMIET",
      telling: { kringen: 6, situatieschemas: 0 },
      limieten: { kringen: 5, situatieschemas: 1 },
    });
    const na = await rij(id);
    expect(na.versie).toBe(1);
    expect(telVoorLimiet(na.document as InstallatieDocument).kringen).toBe(5);
    expect(na.abonnementStempelOp).toBeNull();

    // Binnen de limiet lukt het wel.
    expect((await bewaar(id, 1, document)).status).toBe(200);
  });

  test("gratis project boven de limiet mag bewaren als het aantal kringen daalt", async () => {
    schakelIn();
    await zetNiveau("gratis");
    const id = await projectIn(eigenaar.organisatieId);
    const leeg = (await haalProject(db, eigenaar.organisatieId, id))!.document;
    await db.update(projecten).set({ document: metKringen(leeg, 8) }).where(eq(projecten.id, id));

    expect((await bewaar(id, 1, metKringen(leeg, 7))).status).toBe(200);
    expect((await bewaar(id, 2, metKringen(leeg, 7))).status).toBe(200);
    expect((await bewaar(id, 3, metKringen(leeg, 8))).status).toBe(402);
    expect(telVoorLimiet((await rij(id)).document as InstallatieDocument).kringen).toBe(7);
  });

  test("gratis: nieuw project via uit-document met 6 kringen geeft 402", async () => {
    schakelIn();
    await zetNiveau("gratis");
    const { document } = await projectMet(0);
    const voor = (await db.select().from(projecten)).length;

    const antwoord = await stuur(
      { methode: "POST", pad: "/api/projecten/uit-document", json: { naam: "Te groot", document: metKringen(document, 6) } },
      eigenaar.cookie,
    );

    expect(antwoord.status).toBe(402);
    expect(((await antwoord.json()) as { data: { code: string } }).data.code).toBe("PROJECT_LIMIET");
    expect((await db.select().from(projecten)).length).toBe(voor);

    const binnen = await stuur(
      { methode: "POST", pad: "/api/projecten/uit-document", json: { naam: "Past", document: metKringen(document, 5) } },
      eigenaar.cookie,
    );
    expect(binnen.status).toBe(201);
    const nieuw = await rij(((await binnen.json()) as { id: string }).id);
    expect(nieuw.gekochtOp).toBeNull();
    expect(nieuw.abonnementStempelOp).toBeNull();
  });

  test("dupliceren van een gekocht project geeft een project zonder gekocht_op en zonder stempel (zonder abonnement)", async () => {
    schakelIn();
    await zetNiveau("gratis");
    const { id } = await projectMet(3);
    const gekocht = new Date(Date.now() - 2 * DAG_MS);
    await db.update(projecten).set({ gekochtOp: gekocht, abonnementStempelOp: gekocht }).where(eq(projecten.id, id));

    const antwoord = await stuur({ methode: "POST", pad: `/api/projecten/${id}/dupliceer` }, eigenaar.cookie);

    expect(antwoord.status).toBe(201);
    const kopie = await rij(((await antwoord.json()) as { id: string }).id);
    expect(kopie.gekochtOp).toBeNull();
    expect(kopie.abonnementStempelOp).toBeNull();
    expect((await rij(id)).gekochtOp?.toISOString()).toBe(gekocht.toISOString());
  });

  test("bewaren tijdens abonnement zet abonnement_stempel_op één keer", async () => {
    schakelIn();
    await zetNiveau("abonnement");
    const { id, document } = await projectMet(7);

    expect((await bewaar(id, 1, document)).status).toBe(200);
    const eerste = (await rij(id)).abonnementStempelOp;
    expect(eerste).not.toBeNull();

    await new Promise((klaar) => setTimeout(klaar, 10));
    expect((await bewaar(id, 2, metKringen(document, 1))).status).toBe(200);
    expect((await rij(id)).abonnementStempelOp?.toISOString()).toBe(eerste!.toISOString());

    // Een nieuw project en een kopie onder niveau abonnement krijgen ook een stempel.
    const nieuw = await stuur(
      { methode: "POST", pad: "/api/projecten", json: { naam: "Nieuw", klantnaam: "", stroomtype: "3N400V" } },
      eigenaar.cookie,
    );
    expect(nieuw.status).toBe(201);
    expect((await rij(((await nieuw.json()) as { id: string }).id)).abonnementStempelOp).not.toBeNull();
    const kopie = await stuur({ methode: "POST", pad: `/api/projecten/${id}/dupliceer` }, eigenaar.cookie);
    expect(kopie.status).toBe(201);
    const kopieRij = await rij(((await kopie.json()) as { id: string }).id);
    expect(kopieRij.abonnementStempelOp).not.toBeNull();
    expect(kopieRij.gekochtOp).toBeNull();
  });

  test("gestempeld project na einde abonnement: PUT 402 PROJECT_ALLEEN_LEZEN, export 201", async () => {
    schakelIn();
    await zetNiveau("abonnement");
    const { id, document } = await projectMet(2);
    expect((await bewaar(id, 1, document)).status).toBe(200);
    expect((await rij(id)).abonnementStempelOp).not.toBeNull();

    await db.update(abonnementen).set({ status: "canceled" }).where(eq(abonnementen.organisatieId, eigenaar.organisatieId));

    const antwoord = await bewaar(id, 2, document);
    expect(antwoord.status).toBe(402);
    expect(((await antwoord.json()) as { data: { code: string } }).data.code).toBe("PROJECT_ALLEEN_LEZEN");
    expect((await rij(id)).versie).toBe(2);
    const upload = await stuur({ methode: "POST", pad: `/api/projecten/${id}/bestanden`, formulier: pngFormulier() }, eigenaar.cookie);
    expect(upload.status).toBe(402);
    expect(((await upload.json()) as { data: { code: string } }).data.code).toBe("PROJECT_ALLEEN_LEZEN");

    const exporteer = await stuur(
      { methode: "POST", pad: `/api/projecten/${id}/exports`, ifMatch: 2, json: EXPORT_INVOER },
      eigenaar.cookie,
    );
    expect(exporteer.status).toBe(201);
  });

  test("onderwijs: 8 kringen bewaren lukt en stempelt niet", async () => {
    schakelIn();
    await zetNiveau("onderwijs");
    const { id, document } = await projectMet(0);

    expect((await bewaar(id, 1, metKringen(document, 8))).status).toBe(200);
    const na = await rij(id);
    expect(telVoorLimiet(na.document as InstallatieDocument).kringen).toBe(8);
    expect(na.abonnementStempelOp).toBeNull();
  });

  test("beheercorrectie bewaart boven de limiet zonder stempel", async () => {
    schakelIn();
    await zetNiveau("abonnement");
    const { id, document } = await projectMet(0);
    const corrigeer = async (versie: number, kringen: number) => {
      const correctie = await startCorrectie(db, actor, id, { mutatieId: crypto.randomUUID(), reden: "Support correctie" });
      return bewaarAdminProject(db, actor, id, versie, {
        mutatieId: crypto.randomUUID(),
        correctieId: correctie.id,
        document: metKringen(document, kringen),
      });
    };

    // Onder niveau abonnement: geen stempel.
    expect(await corrigeer(1, 8)).toEqual({ versie: 2 });
    expect((await rij(id)).abonnementStempelOp).toBeNull();

    // Onder niveau gratis: boven de limiet en stijgend mag de beheerder toch bewaren.
    await zetNiveau("gratis");
    expect(await corrigeer(2, 9)).toEqual({ versie: 3 });
    const na = await rij(id);
    expect(telVoorLimiet(na.document as InstallatieDocument).kringen).toBe(9);
    expect(na.abonnementStempelOp).toBeNull();
    expect(na.gekochtOp).toBeNull();
  });

  test("abonnementen uit: geen limiet en geen stempel", async () => {
    zetAbonnementen({ config: { ingeschakeld: false, limieten: { kringen: 5, situatieschemas: 1 } }, stripe: null });
    await zetNiveau("gratis");
    const { id, document } = await projectMet(0);

    expect((await bewaar(id, 1, metKringen(document, 8))).status).toBe(200);
    expect((await rij(id)).abonnementStempelOp).toBeNull();

    const uitDocument = await stuur(
      { methode: "POST", pad: "/api/projecten/uit-document", json: { naam: "Groot", document: metKringen(document, 9) } },
      eigenaar.cookie,
    );
    expect(uitDocument.status).toBe(201);
    expect((await rij(((await uitDocument.json()) as { id: string }).id)).abonnementStempelOp).toBeNull();

    const kopie = await stuur({ methode: "POST", pad: `/api/projecten/${id}/dupliceer` }, eigenaar.cookie);
    expect(kopie.status).toBe(201);
    expect((await rij(((await kopie.json()) as { id: string }).id)).abonnementStempelOp).toBeNull();
  });
});

// --- /api/mij --------------------------------------------------------------------------------

describe("GET /api/mij", () => {
  type MijAntwoord = {
    gebruiker: { proefGebruikt: boolean };
    organisaties: { id: string; toegang: { niveau: string; reden: string; proefEinde: string | null; achterstalligTot: string | null } }[];
  };

  test("geeft per organisatie de toegang; proefGebruikt wordt niet meer gezet", async () => {
    schakelIn();
    const einde = new Date(Date.now() - DAG_MS);
    await zetProefEinde(eigenaar.organisatieId, einde);
    const antwoord = await stuur({ methode: "GET", pad: "/api/mij" }, eigenaar.cookie);
    expect(antwoord.status).toBe(200);
    const body = (await antwoord.json()) as MijAntwoord;
    expect(body.organisaties.find((o) => o.id === eigenaar.organisatieId)?.toegang).toEqual({
      niveau: "gratis",
      reden: "gratis",
      proefEinde: einde.toISOString(),
      achterstalligTot: null,
    });
    expect(body.gebruiker.proefGebruikt).toBe(false);
  });

  test("een past_due-organisatie krijgt achterstalligTot: achterstalligSinds + 14 dagen", async () => {
    schakelIn();
    const sinds = new Date(Date.now() - 3 * DAG_MS);
    await db.insert(abonnementen).values({
      organisatieId: eigenaar.organisatieId,
      stripeKlantId: "cus_mij_achter",
      status: "past_due",
      achterstalligSinds: sinds,
    });
    const body = (await (await stuur({ methode: "GET", pad: "/api/mij" }, eigenaar.cookie)).json()) as MijAntwoord;
    await db.delete(abonnementen).where(eq(abonnementen.organisatieId, eigenaar.organisatieId));
    expect(body.organisaties.find((o) => o.id === eigenaar.organisatieId)?.toegang).toMatchObject({
      niveau: "abonnement",
      reden: "betaling-mislukt",
      achterstalligTot: new Date(sinds.getTime() + 14 * DAG_MS).toISOString(),
    });
  });

  test("met abonnementen uit staat elke organisatie op niveau uit", async () => {
    zetAbonnementen({ config: { ingeschakeld: false, limieten: { kringen: 5, situatieschemas: 1 } }, stripe: null });
    const body = (await (await stuur({ methode: "GET", pad: "/api/mij" }, eigenaar.cookie)).json()) as MijAntwoord;
    expect(body.organisaties[0]?.toegang).toEqual({
      niveau: "uit",
      reden: "uit",
      proefEinde: null,
      achterstalligTot: null,
    });
  });

  test("bevat nergens een Stripe-id", async () => {
    schakelIn();
    await db.insert(abonnementen).values({
      organisatieId: eigenaar.organisatieId,
      stripeKlantId: "cus_geheim",
      stripeAbonnementId: "sub_geheim",
      status: "active",
      formule: "maand",
    });
    try {
      const antwoord = await stuur({ methode: "GET", pad: "/api/mij" }, eigenaar.cookie);
      const tekst = await antwoord.text();
      expect(tekst).not.toContain("cus_");
      expect(tekst).not.toContain("sub_");
      const body = JSON.parse(tekst) as MijAntwoord;
      expect(body.organisaties[0]?.toegang.reden).toBe("actief");
    } finally {
      await db.delete(abonnementen).where(eq(abonnementen.organisatieId, eigenaar.organisatieId));
    }
  });
});

// --- toegangVoor -----------------------------------------------------------------------------

describe("toegangVoor", () => {
  test("een onbekende status in de database telt als geen abonnement", async () => {
    const organisatieId = await maakTestOrganisatie(db);
    await zetProefEinde(organisatieId, new Date(Date.now() - DAG_MS));
    await db.insert(abonnementen).values({ organisatieId, stripeKlantId: "cus_rommel", status: "rommel" });
    const toegang = await toegangVoor(db, organisatieId, INGESCHAKELD);
    expect(toegang).toMatchObject({ niveau: "gratis", reden: "gratis" });
    expect((await haalAbonnementRij(db, organisatieId))?.stripeKlantId).toBe("cus_rommel");
  });

  test("achterstalligTot: alleen bij past_due met achterstalligSinds, dan sinds + 14 dagen", async () => {
    const nu = new Date("2026-10-23T12:00:00Z");
    const sinds = new Date("2026-10-20T08:00:00Z");
    const organisatieId = await maakTestOrganisatie(db);
    await zetProefEinde(organisatieId, new Date(nu.getTime() - DAG_MS));
    expect((await toegangVoor(db, organisatieId, INGESCHAKELD, nu)).achterstalligTot).toBeNull();

    await db.insert(abonnementen).values({
      organisatieId,
      stripeKlantId: "cus_tot",
      status: "past_due",
      achterstalligSinds: sinds,
    });
    expect(await toegangVoor(db, organisatieId, INGESCHAKELD, nu)).toMatchObject({
      niveau: "abonnement",
      reden: "betaling-mislukt",
      achterstalligTot: new Date(sinds.getTime() + 14 * DAG_MS).toISOString(),
    });

    for (const status of ["unpaid", "active", "canceled"]) {
      await db.update(abonnementen).set({ status }).where(eq(abonnementen.organisatieId, organisatieId));
      expect((await toegangVoor(db, organisatieId, INGESCHAKELD, nu)).achterstalligTot).toBeNull();
    }
    expect((await toegangVoor(db, "bestaat-niet", INGESCHAKELD, nu)).achterstalligTot).toBeNull();
  });

  test("een onbekende organisatie krijgt nooit meer dan de gratis versie", async () => {
    expect(await toegangVoor(db, "bestaat-niet", INGESCHAKELD)).toMatchObject({ niveau: "gratis", reden: "gratis" });
  });
});

// --- synchroniseerKlant ----------------------------------------------------------------------

describe("synchroniseerKlant", () => {
  const PRIJZEN = INGESCHAKELD.ingeschakeld ? INGESCHAKELD.prijzen : { maand: "", jaar: "" };

  function sub(id: string, status: AbonnementStatus, dagenGeleden: number, extra: Partial<StripeAbonnement> = {}) {
    return {
      id,
      klantId: "cus_sync",
      status,
      prijsId: PRIJZEN.maand,
      periodeEinde: new Date("2026-12-01T00:00:00Z"),
      opgezegdOpPeriodeEinde: false,
      aangemaakt: new Date(Date.now() - dagenGeleden * DAG_MS),
      ...extra,
    } satisfies StripeAbonnement;
  }

  async function klant(klantId = "cus_sync"): Promise<string> {
    const organisatieId = await maakTestOrganisatie(db);
    await db.insert(abonnementen).values({ organisatieId, stripeKlantId: klantId });
    return organisatieId;
  }

  test("de rij volgt het levendigste abonnement, ook als een canceled het nieuwste is", async () => {
    const stripe = maakNepStripe();
    const organisatieId = await klant("cus_volgorde");
    const periodeEinde = new Date("2027-01-01T00:00:00Z");
    stripe.abonnementen.set("cus_volgorde", [
      sub("sub_oud", "active", 30, { klantId: "cus_volgorde", prijsId: PRIJZEN.jaar, periodeEinde, opgezegdOpPeriodeEinde: true }),
      sub("sub_nieuw", "canceled", 1, { klantId: "cus_volgorde" }),
    ]);
    const nu = new Date("2026-10-23T10:00:00Z");

    expect(await synchroniseerKlant(db, stripe, PRIJZEN, "cus_volgorde", nu)).toBe("bijgewerkt");

    const rij = await haalAbonnementRij(db, organisatieId);
    expect(rij).toMatchObject({
      stripeAbonnementId: "sub_oud",
      status: "active",
      formule: "jaar",
      opgezegdOpPeriodeEinde: true,
      achterstalligSinds: null,
    });
    expect(rij?.periodeEinde?.toISOString()).toBe(periodeEinde.toISOString());
    expect(rij?.bijgewerkt.toISOString()).toBe(nu.toISOString());
  });

  test("achterstalligSinds komt bij de eerste past_due, blijft bij een tweede sync en verdwijnt bij active", async () => {
    const stripe = maakNepStripe();
    const organisatieId = await klant("cus_achter");
    const lijst = [sub("sub_a", "past_due", 5, { klantId: "cus_achter" })];
    stripe.abonnementen.set("cus_achter", lijst);
    const eerste = new Date("2026-10-01T10:00:00Z");
    const tweede = new Date("2026-10-05T10:00:00Z");

    await synchroniseerKlant(db, stripe, PRIJZEN, "cus_achter", eerste);
    expect((await haalAbonnementRij(db, organisatieId))?.achterstalligSinds?.toISOString()).toBe(eerste.toISOString());

    await synchroniseerKlant(db, stripe, PRIJZEN, "cus_achter", tweede);
    expect((await haalAbonnementRij(db, organisatieId))?.achterstalligSinds?.toISOString()).toBe(eerste.toISOString());

    lijst[0]!.status = "active";
    await synchroniseerKlant(db, stripe, PRIJZEN, "cus_achter", new Date("2026-10-06T10:00:00Z"));
    const rij = await haalAbonnementRij(db, organisatieId);
    expect(rij?.status).toBe("active");
    expect(rij?.achterstalligSinds).toBeNull();
  });

  test("een onbekende klant geeft onbekend en schrijft niets", async () => {
    const stripe = maakNepStripe();
    const voor = await db.select().from(abonnementen);
    expect(await synchroniseerKlant(db, stripe, PRIJZEN, "cus_bestaat_niet")).toBe("onbekend");
    expect(await db.select().from(abonnementen)).toEqual(voor);
    expect(stripe.aanroepen).toEqual([]);
  });

  test("een klant zonder abonnementen wist de gevolgde gegevens", async () => {
    const stripe = maakNepStripe();
    const organisatieId = await klant("cus_leeg");
    await db
      .update(abonnementen)
      .set({ status: "active", stripeAbonnementId: "sub_weg", formule: "maand" })
      .where(eq(abonnementen.organisatieId, organisatieId));
    expect(await synchroniseerKlant(db, stripe, PRIJZEN, "cus_leeg")).toBe("bijgewerkt");
    expect(await haalAbonnementRij(db, organisatieId)).toMatchObject({
      status: null,
      stripeAbonnementId: null,
      formule: null,
      periodeEinde: null,
      opgezegdOpPeriodeEinde: false,
    });
  });

  test("overlappende synchronisaties van één klant lopen na elkaar: de laatste Stripe-stand wint", async () => {
    const organisatieId = await klant("cus_overlap");
    // A leest vroeg (verouderd: past_due) maar krijgt zijn antwoord pas laat; B leest daarna en ziet active.
    const verouderd = maakNepStripe();
    verouderd.abonnementen.set("cus_overlap", [sub("sub_o", "past_due", 5, { klantId: "cus_overlap" })]);
    const vers = maakNepStripe();
    vers.abonnementen.set("cus_overlap", [sub("sub_o", "active", 5, { klantId: "cus_overlap" })]);
    let open!: () => void;
    const poort = new Promise<void>((klaar) => (open = klaar));
    const lees = verouderd.abonnementenVanKlant.bind(verouderd);
    verouderd.abonnementenVanKlant = async (klantId) => {
      const antwoord = await lees(klantId);
      await poort;
      return antwoord;
    };

    const a = synchroniseerKlant(db, verouderd, PRIJZEN, "cus_overlap", new Date("2026-10-01T10:00:00Z"));
    await new Promise((klaar) => setTimeout(klaar, 20));
    const b = synchroniseerKlant(db, vers, PRIJZEN, "cus_overlap", new Date("2026-10-01T10:00:05Z"));
    await new Promise((klaar) => setTimeout(klaar, 50));
    open();
    await Promise.all([a, b]);

    expect(await haalAbonnementRij(db, organisatieId)).toMatchObject({ status: "active", achterstalligSinds: null });
  });

  test("binnen een bestaande transactie (zoals bij startCheckout) werkt het als savepoint", async () => {
    const stripe = maakNepStripe();
    const organisatieId = await klant("cus_tx");
    stripe.abonnementen.set("cus_tx", [sub("sub_t", "active", 1, { klantId: "cus_tx" })]);
    await db.transaction(async (tx) => {
      expect(await synchroniseerKlant(tx as unknown as Db, stripe, PRIJZEN, "cus_tx")).toBe("bijgewerkt");
    });
    expect(await haalAbonnementRij(db, organisatieId)).toMatchObject({ status: "active", stripeAbonnementId: "sub_t" });
  });

  test("een dubbel abonnement waarschuwt met alleen de organisatie", async () => {
    const waarschuw = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stripe = maakNepStripe();
    const organisatieId = await klant("cus_dubbel");
    stripe.abonnementen.set("cus_dubbel", [
      sub("sub_1", "active", 10, { klantId: "cus_dubbel" }),
      sub("sub_2", "trialing", 2, { klantId: "cus_dubbel" }),
    ]);
    await synchroniseerKlant(db, stripe, PRIJZEN, "cus_dubbel");
    expect(waarschuw).toHaveBeenCalledTimes(1);
    expect(waarschuw).toHaveBeenCalledWith("dubbel abonnement", { organisatieId });
  });
});
