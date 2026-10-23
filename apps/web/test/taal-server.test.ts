// De taal op de server (plan 8, Task 2): user.taal bij de registratie, PUT /api/mij/taal, de
// dossiertaal van een nieuw project en de taal van een export. De routebestanden draaien in een
// echte h3-app met Better Auth en PGlite, zoals in test/toegang.test.ts.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { referentieWoning } from "@elentrik/arei/testing";
import { eq } from "drizzle-orm";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { type Auth, maakAuth, zetAuth } from "../server/auth";
import { maakLokaleOpslag, zetOpslag } from "../server/bestanden/opslag";
import { type Db, zetDb } from "../server/db";
import { invitation, member, projecten, user } from "../server/db/schema";
import { type Mail, type Verzender, zetVerzender } from "../server/mail/verzend";
import { maakPdf } from "../server/pdf/gotenberg";
import { registratieLimiet } from "../server/organisaties/leden";
import { maakUitnodigingstoken } from "../server/organisaties/uitnodigingstoken";
import { bewaarProject, haalProject } from "../server/projecten/repo";
import { TAAL_HEADER } from "../shared/taal";
import { maakTestDb } from "./db";

// Gotenberg draait niet in Vitest: de PDF-dienst geeft een minimale geldige PDF terug en onthoudt
// de html die hij kreeg.
vi.mock("../server/pdf/gotenberg", async (origineel) => ({
  ...(await origineel<typeof import("../server/pdf/gotenberg")>()),
  maakPdf: vi.fn(async () => new TextEncoder().encode("%PDF-1.7\n%%EOF\n")),
}));

const WACHTWOORD = "lang-genoeg-1";

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

function authHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({ "user-agent": "vitest", "x-forwarded-for": "127.0.0.1", ...extra });
}

/** Registreert en bevestigt een gebruiker met bedrijf; geeft zijn id. */
async function registreer(email: string, taalHeader?: string): Promise<string> {
  await auth.api.signUpEmail({
    body: { name: email.split("@")[0]!, email, password: WACHTWOORD, wachtendeBedrijfsnaam: `Bedrijf ${email}` },
    headers: authHeaders(taalHeader !== undefined ? { [TAAL_HEADER]: taalHeader } : {}),
  });
  await new Promise((klaar) => setTimeout(klaar, 0));
  const mail = mails.find((m) => m.aan === email);
  const token = new URL(mail!.tekst.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  await auth.api.verifyEmail({ query: { token }, headers: authHeaders() });
  const [rij] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return rij!.id;
}

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

type Gebruiker = { id: string; email: string; cookie: string };

async function gebruiker(email: string, taalHeader?: string): Promise<Gebruiker> {
  const id = await registreer(email, taalHeader);
  return { id, email, cookie: await inloggen(email) };
}

async function stuur(
  methode: string,
  pad: string,
  cookie?: string,
  opties: { json?: unknown; ifMatch?: number } = {},
): Promise<Response> {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (opties.ifMatch !== undefined) headers.set("if-match", String(opties.ifMatch));
  if (opties.json !== undefined) headers.set("content-type", "application/json");
  return fetch(`${basis}${pad}`, {
    method: methode,
    headers,
    ...(opties.json !== undefined ? { body: JSON.stringify(opties.json) } : {}),
  });
}

async function taalInDb(id: string): Promise<string | undefined> {
  const [rij] = await db.select({ taal: user.taal }).from(user).where(eq(user.id, id));
  return rij?.taal;
}

const ROUTES = [
  ["GET", "/api/mij", "../server/api/mij.get"],
  ["PUT", "/api/mij/taal", "../server/api/mij/taal.put"],
  ["POST", "/api/uitnodigingen/:token/registreer", "../server/api/uitnodigingen/[token]/registreer.post"],
  ["POST", "/api/projecten", "../server/api/projecten/index.post"],
  ["POST", "/api/projecten/:id/exports", "../server/api/projecten/[id]/exports.post"],
] as const;

let frans: Gebruiker;
let nederlands: Gebruiker;

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "vitest-geheim-alleen-voor-tests-0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
  zetVerzender(verzamelaar);
  db = await maakTestDb();
  auth = maakAuth(db);
  zetDb(db);
  zetAuth(auth);
  map = await mkdtemp(join(tmpdir(), "elentrik-taal-"));
  zetOpslag(maakLokaleOpslag(map));

  const app = createApp();
  const router = createRouter();
  for (const [methode, pad, bestand] of ROUTES) {
    const module = (await import(join(import.meta.dirname, `${bestand}.ts`))) as { default: EventHandler };
    router.use(pad, module.default, methode.toLowerCase() as "get");
  }
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  frans = await gebruiker("frans@voorbeeld.be", "fr");
  nederlands = await gebruiker("nederlands@voorbeeld.be");
}, 120_000);

afterAll(async () => {
  await new Promise((klaar) => server?.close(klaar));
  await rm(map, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("user.taal bij de registratie", () => {
  test("de header x-elentrik-taal bepaalt de taal", () => {
    return taalInDb(frans.id).then((taal) => expect(taal).toBe("fr"));
  });

  test("zonder header is de taal nl", async () => {
    expect(await taalInDb(nederlands.id)).toBe("nl");
  });

  test("een ongeldige header geeft nl (en geen fout)", async () => {
    const id = await registreer("duits@voorbeeld.be", "de");
    expect(await taalInDb(id)).toBe("nl");
  });

  test("de waarde van de header is hoofdlettergevoelig: EN is geen geldige taal", async () => {
    const id = await registreer("hoofd@voorbeeld.be", "EN");
    expect(await taalInDb(id)).toBe("nl");
  });

  test("ook via een echt HTTP-verzoek (auth.handler) komt de taal uit de header", async () => {
    const antwoord = await auth.handler(
      new Request("http://127.0.0.1:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json", origin: "http://127.0.0.1:3000", [TAAL_HEADER]: "en" }),
        body: JSON.stringify({ name: "Http", email: "http@voorbeeld.be", password: WACHTWOORD }),
      }),
    );
    expect(antwoord.status).toBe(200);
    const [rij] = await db.select({ taal: user.taal }).from(user).where(eq(user.email, "http@voorbeeld.be"));
    expect(rij?.taal).toBe("en");
  });

  test("registreren via een uitnodiging neemt de taal uit de header over", async () => {
    registratieLimiet.wis();
    const [lid] = await db.select({ org: member.organizationId }).from(member).where(eq(member.userId, frans.id));
    const id = crypto.randomUUID();
    await db.insert(invitation).values({
      id,
      organizationId: lid!.org,
      email: "gast@voorbeeld.be",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 3600_000),
      inviterId: frans.id,
    });
    const token = await maakUitnodigingstoken(db, id, new Date(Date.now() + 3600_000));
    const antwoord = await fetch(`${basis}/api/uitnodigingen/${token}/registreer`, {
      method: "POST",
      headers: { "content-type": "application/json", [TAAL_HEADER]: "fr" },
      body: JSON.stringify({ naam: "Gast", wachtwoord: WACHTWOORD }),
    });
    expect(antwoord.status).toBe(201);
    const [rij] = await db.select({ taal: user.taal }).from(user).where(eq(user.email, "gast@voorbeeld.be"));
    expect(rij?.taal).toBe("fr");
  });

  test("een body met taal wordt geweigerd bij de registratie", async () => {
    const fout = await auth.api
      .signUpEmail({
        body: { name: "X", email: "taal-body@voorbeeld.be", password: WACHTWOORD, taal: "fr" } as never,
        headers: authHeaders(),
      })
      .then(() => null, (f: unknown) => f as { statusCode: number });
    expect(fout?.statusCode).toBe(400);
  });

  test("/update-user met taal geeft 400 en laat de taal staan", async () => {
    const fout = await auth.api
      .updateUser({
        body: { taal: "en" } as never,
        headers: new Headers({ cookie: frans.cookie, "user-agent": "vitest" }),
      })
      .then(() => null, (f: unknown) => f as { statusCode: number });
    expect(fout?.statusCode).toBe(400);
    expect(await taalInDb(frans.id)).toBe("fr");
  });
});

describe("PUT /api/mij/taal", () => {
  test("en geeft 200, { taal } en /api/mij toont en", async () => {
    const gebruikerEn = await gebruiker("engels@voorbeeld.be");
    const antwoord = await stuur("PUT", "/api/mij/taal", gebruikerEn.cookie, { json: { taal: "en" } });
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ taal: "en" });
    expect(await taalInDb(gebruikerEn.id)).toBe("en");
    const mij = (await (await stuur("GET", "/api/mij", gebruikerEn.cookie)).json()) as {
      gebruiker: { taal: string };
    };
    expect(mij.gebruiker.taal).toBe("en");
  });

  test("/api/mij toont de taal van de registratie", async () => {
    const mij = (await (await stuur("GET", "/api/mij", frans.cookie)).json()) as { gebruiker: { taal: string } };
    expect(mij.gebruiker.taal).toBe("fr");
  });

  test.each([["de"], ["EN"], [""], [null], [3]])("%j geeft 400 ONGELDIGE_TAAL", async (taal) => {
    const antwoord = await stuur("PUT", "/api/mij/taal", nederlands.cookie, { json: { taal } });
    expect(antwoord.status).toBe(400);
    expect(((await antwoord.json()) as { data: { code: string } }).data.code).toBe("ONGELDIGE_TAAL");
    expect(await taalInDb(nederlands.id)).toBe("nl");
  });

  test("zonder taal in de body geeft 400 ONGELDIGE_TAAL", async () => {
    const antwoord = await stuur("PUT", "/api/mij/taal", nederlands.cookie, { json: {} });
    expect(antwoord.status).toBe(400);
    expect(((await antwoord.json()) as { data: { code: string } }).data.code).toBe("ONGELDIGE_TAAL");
  });

  test("zonder sessie geeft 401", async () => {
    const antwoord = await stuur("PUT", "/api/mij/taal", undefined, { json: { taal: "fr" } });
    expect(antwoord.status).toBe(401);
  });
});

describe("dossiertaal van een nieuw project", () => {
  test("een fr-gebruiker krijgt meta.dossierTaal = fr", async () => {
    const antwoord = await stuur("POST", "/api/projecten", frans.cookie, {
      json: { naam: "Woning", klantnaam: "Dupont", stroomtype: "3N400V" },
    });
    expect(antwoord.status).toBe(201);
    const { id } = (await antwoord.json()) as { id: string };
    const [rij] = await db.select({ document: projecten.document }).from(projecten).where(eq(projecten.id, id));
    expect((rij!.document as { meta: { dossierTaal?: string } }).meta.dossierTaal).toBe("fr");
  });

  test("een nl-gebruiker krijgt meta.dossierTaal = nl", async () => {
    const antwoord = await stuur("POST", "/api/projecten", nederlands.cookie, {
      json: { naam: "Woning", klantnaam: "Peeters", stroomtype: "3N400V" },
    });
    const { id } = (await antwoord.json()) as { id: string };
    const [rij] = await db.select({ document: projecten.document }).from(projecten).where(eq(projecten.id, id));
    expect((rij!.document as { meta: { dossierTaal?: string } }).meta.dossierTaal).toBe("nl");
  });
});

describe("taal van een export", () => {
  const INVOER = {
    onderdelen: { eendraadschema: true, situatieschema: false, kringenlijst: true, bijlage: false },
    papier: "A4",
    versieLabel: "V1",
  };

  /** Een project van `eigenaar` met het referentiedocument en de gegeven dossiertaal; versie 2. */
  async function projectMet(eigenaar: Gebruiker, dossierTaal?: "nl" | "fr" | "en"): Promise<string> {
    const { id } = (await (
      await stuur("POST", "/api/projecten", eigenaar.cookie, {
        json: { naam: "Export", klantnaam: "", stroomtype: "3N400V" },
      })
    ).json()) as { id: string };
    const [rij] = await db.select({ org: projecten.organisatieId }).from(projecten).where(eq(projecten.id, id));
    const org = rij!.org!;
    const basis = referentieWoning();
    const doc = dossierTaal !== undefined ? { ...basis, meta: { ...basis.meta, dossierTaal } } : basis;
    await bewaarProject(db, org, id, 1, { document: doc });
    expect((await haalProject(db, org, id))?.document.meta.dossierTaal).toBe(dossierTaal);
    return id;
  }

  async function exporteer(eigenaar: Gebruiker, projectId: string): Promise<string> {
    vi.mocked(maakPdf).mockClear();
    const antwoord = await stuur("POST", `/api/projecten/${projectId}/exports`, eigenaar.cookie, {
      json: INVOER,
      ifMatch: 2,
    });
    expect(antwoord.status).toBe(201);
    expect(maakPdf).toHaveBeenCalledTimes(1);
    return vi.mocked(maakPdf).mock.calls[0]![0].html;
  }

  test("een project met dossierTaal en geeft een Engelse pdf, ook voor een nl-gebruiker", async () => {
    const html = await exporteer(nederlands, await projectMet(nederlands, "en"));
    expect(html).toContain('<html lang="en">');
  });

  test("een project met dossierTaal fr geeft een Franse pdf, ook voor een nl-gebruiker", async () => {
    const html = await exporteer(nederlands, await projectMet(nederlands, "fr"));
    expect(html).toContain('<html lang="fr">');
  });

  test("een project zonder dossierTaal exporteert in het Nederlands, ook voor een fr-gebruiker", async () => {
    const html = await exporteer(frans, await projectMet(frans));
    expect(html).toContain('<html lang="nl">');
  });
});

describe("mails in de taal van de gebruiker", () => {
  const wacht = () => new Promise((klaar) => setTimeout(klaar, 0));
  const mailsVoor = (adres: string) => mails.filter((m) => m.aan === adres);

  test("een fr-gebruiker die zich registreert krijgt een Franse bevestigingsmail", async () => {
    const adres = "bevestig-fr@voorbeeld.be";
    await auth.api.signUpEmail({
      body: { name: "Camille", email: adres, password: WACHTWOORD },
      headers: authHeaders({ [TAAL_HEADER]: "fr" }),
    });
    await wacht();
    const [mail] = mailsVoor(adres);
    expect(mail!.onderwerp).toBe("Confirmez votre adresse e-mail pour Elentrik");
    expect(mail!.tekst).toContain("Bonjour Camille,");
    expect(mail!.html).toContain('<html lang="fr">');
  });

  test("een en-gebruiker krijgt een Engelse bevestigingsmail, zonder header een Nederlandse", async () => {
    await auth.api.signUpEmail({
      body: { name: "Sam", email: "bevestig-en@voorbeeld.be", password: WACHTWOORD },
      headers: authHeaders({ [TAAL_HEADER]: "en" }),
    });
    await auth.api.signUpEmail({
      body: { name: "Sanne", email: "bevestig-nl@voorbeeld.be", password: WACHTWOORD },
      headers: authHeaders(),
    });
    await wacht();
    expect(mailsVoor("bevestig-en@voorbeeld.be")[0]!.onderwerp).toBe("Confirm your email address for Elentrik");
    expect(mailsVoor("bevestig-nl@voorbeeld.be")[0]!.onderwerp).toBe("Bevestig je e-mailadres bij Elentrik");
  });

  test("een onbevestigde inlogpoging stuurt de bevestiging opnieuw in de taal van de gebruiker", async () => {
    const adres = "opnieuw-fr@voorbeeld.be";
    await auth.api.signUpEmail({
      body: { name: "Luc", email: adres, password: WACHTWOORD },
      headers: authHeaders({ [TAAL_HEADER]: "fr" }),
    });
    await wacht();
    await auth.api
      .signInEmail({ body: { email: adres, password: WACHTWOORD }, headers: authHeaders() })
      .catch(() => undefined);
    await wacht();
    const lijst = mailsVoor(adres);
    expect(lijst.length).toBeGreaterThanOrEqual(2);
    for (const mail of lijst) expect(mail.onderwerp).toBe("Confirmez votre adresse e-mail pour Elentrik");
  });

  test("de inloglink en het wachtwoordherstel volgen de taal van de gebruiker", async () => {
    // `frans` is bevestigd en heeft taal fr.
    await auth.api.signInMagicLink({ body: { email: frans.email }, headers: authHeaders() });
    await auth.api.requestPasswordReset({
      body: { email: frans.email, redirectTo: "/wachtwoord-herstellen" },
      headers: authHeaders(),
    });
    await wacht();
    const onderwerpen = mailsVoor(frans.email).map((m) => m.onderwerp);
    expect(onderwerpen).toContain("Votre lien de connexion pour Elentrik");
    expect(onderwerpen).toContain("Définissez un nouveau mot de passe pour Elentrik");

    await auth.api.signInMagicLink({ body: { email: nederlands.email }, headers: authHeaders() });
    await wacht();
    expect(mailsVoor(nederlands.email).map((m) => m.onderwerp)).toContain("Je inloglink voor Elentrik");
  });

  test("een en-eigenaar die een nieuw adres uitnodigt, verstuurt een Engelse uitnodiging", async () => {
    const eigenaar = await gebruiker("eigenaar-en@voorbeeld.be", "en");
    const [lid] = await db.select({ org: member.organizationId }).from(member).where(eq(member.userId, eigenaar.id));
    const gast = "gast-en@voorbeeld.be";
    await auth.api.createInvitation({
      body: { email: gast, role: "member", organizationId: lid!.org },
      headers: new Headers({ cookie: eigenaar.cookie, "user-agent": "vitest" }),
    });
    await wacht();
    const [mail] = mailsVoor(gast);
    expect(mail!.onderwerp).toMatch(/ invites you to join Bedrijf eigenaar-en@voorbeeld\.be on Elentrik$/);
    expect(mail!.tekst).toContain("with the role of member.");
    expect(mail!.html).toContain('<html lang="en">');
  });

  test("de uitnodiging volgt de taal van wie uitnodigt, niet die van de genodigde", async () => {
    const [lid] = await db.select({ org: member.organizationId }).from(member).where(eq(member.userId, frans.id));
    const gast = "gast-fr@voorbeeld.be";
    await auth.api.createInvitation({
      body: { email: gast, role: "owner", organizationId: lid!.org },
      headers: new Headers({ cookie: frans.cookie, "user-agent": "vitest" }),
    });
    await wacht();
    const [mail] = mailsVoor(gast);
    expect(mail!.onderwerp).toContain("vous invite à rejoindre");
    expect(mail!.tekst).toContain("avec le rôle propriétaire.");
    expect(mail!.html).toContain('<html lang="fr">');
  });
});
