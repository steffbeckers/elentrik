// De opslaglimiet per bedrijf (plan 12, punt 2): de telling, de controle, de uploadroutes, dupliceren,
// "Bewaar als nieuw project" en de uitzondering voor exports.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createEvent, type H3Event } from "h3";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { bewaarLogo } from "../server/bedrijf/repo";
import { maakLokaleOpslag, type BestandOpslag } from "../server/bestanden/opslag";
import {
  controleerOpslagruimte,
  gebruikteOpslag,
  opslagLimietBytes,
  STANDAARD_OPSLAG_MB,
} from "../server/bestanden/opslagruimte";
import { bewaarBestand } from "../server/bestanden/repo";
import type { Db } from "../server/db";
import { bestanden, projecten } from "../server/db/schema";
import {
  bewaarProject,
  dupliceerProject,
  haalProject,
  maakProject,
  maakProjectUitDocument,
} from "../server/projecten/repo";
import { leesLogoUpload, leesPlanUpload } from "../server/utils/bestanden";
import { maakTestDb, maakTestOrganisatie } from "./db";

const MB = 1024 * 1024;
const GRENS = "----elentrik";
const invoer = { naam: "Woning", klantnaam: "Klant", stroomtype: "3N400V" as const };

let db: Db;
let map: string;
let opslag: BestandOpslag;

beforeAll(async () => {
  db = await maakTestDb();
});

beforeEach(async () => {
  map = await mkdtemp(join(tmpdir(), "elentrik-opslagruimte-"));
  opslag = maakLokaleOpslag(map);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(map, { recursive: true, force: true });
});

/** Alle bestanden onder de opslagmap, als relatieve paden. */
async function bestandenOpSchijf(): Promise<string[]> {
  const namen = await readdir(map, { recursive: true, withFileTypes: true });
  return namen.filter((n) => n.isFile()).map((n) => join(n.parentPath, n.name));
}

async function aantalRijen(): Promise<number> {
  return (await db.select({ id: bestanden.id }).from(bestanden)).length;
}

/** Een rij in `bestanden` met een opgegeven grootte, zonder bestand op schijf. */
async function vulOp(
  organisatieId: string,
  projectId: string | null,
  soort: (typeof bestanden.$inferInsert)["soort"],
  grootte: number,
): Promise<void> {
  await db.insert(bestanden).values({
    projectId,
    organisatieId: soort === "logo" ? organisatieId : null,
    soort,
    mime: "application/octet-stream",
    grootte,
    sleutel: `${projectId ?? `org/${organisatieId}`}/${crypto.randomUUID()}`,
  });
}

async function opzet(): Promise<{ org: string; project: string }> {
  const org = await maakTestOrganisatie(db);
  const { id } = await maakProject(db, org, invoer);
  return { org, project: id };
}

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

const PDF = new TextEncoder().encode("%PDF-1.7\n%nep\n");

function maakEvent(headers: Record<string, string>, body?: Buffer): H3Event {
  const req = new IncomingMessage(new Socket());
  req.method = "POST";
  req.headers = headers;
  if (body) {
    req.push(body);
    req.push(null);
  }
  return createEvent(req, new ServerResponse(req));
}

function multipart(velden: { naam: string; inhoud: string | Uint8Array; bestand?: boolean }[]) {
  const delen: Buffer[] = [];
  for (const veld of velden) {
    const kop =
      `--${GRENS}\r\nContent-Disposition: form-data; name="${veld.naam}"` +
      (veld.bestand ? `; filename="x.bin"\r\nContent-Type: application/octet-stream` : "") +
      `\r\n\r\n`;
    delen.push(Buffer.from(kop), Buffer.from(veld.inhoud), Buffer.from("\r\n"));
  }
  delen.push(Buffer.from(`--${GRENS}--\r\n`));
  const body = Buffer.concat(delen);
  return {
    body,
    headers: {
      "content-type": `multipart/form-data; boundary=${GRENS}`,
      "content-length": String(body.length),
    },
  };
}

async function foutVan(actie: () => unknown): Promise<{ statusCode?: number; data?: { code?: string } }> {
  try {
    await actie();
  } catch (fout) {
    return fout as { statusCode?: number; data?: { code?: string } };
  }
  return {};
}

describe("opslagLimietBytes", () => {
  test("standaard 5 GB", () => {
    expect(STANDAARD_OPSLAG_MB).toBe(5120);
    expect(opslagLimietBytes({})).toBe(5120 * MB);
    expect(opslagLimietBytes({ ELENTRIK_OPSLAG_PER_BEDRIJF_MB: "" })).toBe(5120 * MB);
    expect(opslagLimietBytes({ ELENTRIK_OPSLAG_PER_BEDRIJF_MB: "  " })).toBe(5120 * MB);
  });

  test("ELENTRIK_OPSLAG_PER_BEDRIJF_MB stelt de limiet in megabytes in", () => {
    expect(opslagLimietBytes({ ELENTRIK_OPSLAG_PER_BEDRIJF_MB: "100" })).toBe(100 * MB);
    expect(opslagLimietBytes({ ELENTRIK_OPSLAG_PER_BEDRIJF_MB: " 100 " })).toBe(100 * MB);
  });

  test.each(["0", "-1", "abc", "1.5", "1e3", "010", "99999999999999"])("%s is ongeldig", (waarde) => {
    expect(() => opslagLimietBytes({ ELENTRIK_OPSLAG_PER_BEDRIJF_MB: waarde })).toThrow("ELENTRIK_OPSLAG_PER_BEDRIJF_MB");
  });

  test("zonder argument leest ze process.env", () => {
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "7");
    expect(opslagLimietBytes()).toBe(7 * MB);
  });
});

describe("gebruikteOpslag", () => {
  test("een bedrijf zonder bestanden gebruikt niets", async () => {
    const org = await maakTestOrganisatie(db);
    expect(await gebruikteOpslag(db, org)).toBe(0);
  });

  test("telt de plannen en exports van levende projecten plus de logo's van het bedrijf", async () => {
    const { org, project } = await opzet();
    await vulOp(org, project, "plan-origineel", 1000);
    await vulOp(org, project, "plan-raster", 200);
    await vulOp(org, project, "export", 30);
    await vulOp(org, null, "logo", 4);
    expect(await gebruikteOpslag(db, org)).toBe(1234);
  });

  test("telt boven 2 GB zonder te overlopen", async () => {
    const { org, project } = await opzet();
    await vulOp(org, project, "plan-origineel", 2_000_000_000);
    await vulOp(org, project, "plan-origineel", 2_000_000_000);
    expect(await gebruikteOpslag(db, org)).toBe(4_000_000_000);
  });

  test("projecten in de prullenbak en andere bedrijven tellen niet mee", async () => {
    const { org, project } = await opzet();
    const prullenbak = (await maakProject(db, org, invoer)).id;
    const { org: ander, project: anderProject } = await opzet();
    await vulOp(org, project, "plan-origineel", 10);
    await vulOp(org, prullenbak, "plan-origineel", 500);
    await vulOp(ander, anderProject, "plan-origineel", 700);
    await vulOp(ander, null, "logo", 90);
    await db.update(projecten).set({ verwijderd: new Date() }).where(eq(projecten.id, prullenbak));
    expect(await gebruikteOpslag(db, org)).toBe(10);
    expect(await gebruikteOpslag(db, ander)).toBe(790);
  });
});

describe("controleerOpslagruimte", () => {
  test("precies tot de limiet lukt, één byte erover geeft 413 OPSLAG_VOL", async () => {
    const { org, project } = await opzet();
    await vulOp(org, project, "plan-origineel", 900);
    await expect(controleerOpslagruimte(db, org, 100, 1000)).resolves.toBeUndefined();
    const fout = await foutVan(() => controleerOpslagruimte(db, org, 101, 1000));
    expect([fout.statusCode, fout.data?.code]).toEqual([413, "OPSLAG_VOL"]);
  });

  test("zonder limiet gebruikt ze die van de omgeving", async () => {
    const { org, project } = await opzet();
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(org, project, "plan-origineel", MB - 5);
    await expect(controleerOpslagruimte(db, org, 5)).resolves.toBeUndefined();
    expect((await foutVan(() => controleerOpslagruimte(db, org, 6))).data?.code).toBe("OPSLAG_VOL");
  });

  test("de ruimte van een ander bedrijf telt niet", async () => {
    const { org: vol, project } = await opzet();
    await vulOp(vol, project, "plan-origineel", 1000);
    const leeg = await maakTestOrganisatie(db);
    await expect(controleerOpslagruimte(db, leeg, 1000, 1000)).resolves.toBeUndefined();
  });
});

describe("een plan uploaden", () => {
  const bytes = png(10, 10);
  const upload = multipart([
    { naam: "soort", inhoud: "plan-origineel" },
    { naam: "bestand", inhoud: bytes, bestand: true },
  ]);
  const lengte = Number(upload.headers["content-length"]);

  /** Wat de route doet: eerst lezen en de ruimte controleren, dan pas bewaren. */
  async function uploadPlan(org: string, project: string) {
    const { soort, data } = await leesPlanUpload(maakEvent(upload.headers, upload.body), { db, organisatieId: org });
    return bewaarBestand(db, opslag, { organisatieId: org, projectId: project, soort, data });
  }

  test("precies tot de limiet lukt", async () => {
    const { org, project } = await opzet();
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(org, project, "plan-origineel", MB - lengte);
    const info = await uploadPlan(org, project);
    expect(info.grootte).toBe(bytes.length);
  });

  test("één byte erover geeft 413 OPSLAG_VOL, zonder nieuwe rij en zonder nieuw bestand", async () => {
    const { org, project } = await opzet();
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(org, project, "plan-origineel", MB - lengte + 1);
    const rijen = await aantalRijen();

    const fout = await foutVan(() => uploadPlan(org, project));

    expect([fout.statusCode, fout.data?.code]).toEqual([413, "OPSLAG_VOL"]);
    expect(await aantalRijen()).toBe(rijen);
    expect(await bestandenOpSchijf()).toEqual([]);
  });

  test("een te groot bestand blijft BESTAND_TE_GROOT, ook als het bedrijf vol is", async () => {
    const { org, project } = await opzet();
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(org, project, "plan-origineel", MB);
    const teGroot = { "content-type": upload.headers["content-type"], "content-length": String(1024 * MB) };
    const fout = await foutVan(() => leesPlanUpload(maakEvent(teGroot), { db, organisatieId: org }));
    expect(fout.data?.code).toBe("BESTAND_TE_GROOT");
  });

  test("een upload bij een bedrijf dat de limiet nog niet haalt, lukt ook als een ander bedrijf vol is", async () => {
    const vol = await opzet();
    const leeg = await opzet();
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(vol.org, vol.project, "plan-origineel", MB);
    await expect(uploadPlan(leeg.org, leeg.project)).resolves.toMatchObject({ grootte: bytes.length });
  });
});

describe("een logo uploaden", () => {
  const logo = multipart([{ naam: "bestand", inhoud: png(10, 10), bestand: true }]);
  const lengte = Number(logo.headers["content-length"]);

  async function uploadLogo(org: string) {
    const data = await leesLogoUpload(maakEvent(logo.headers, logo.body), { db, organisatieId: org });
    return bewaarLogo(db, opslag, org, data);
  }

  test("precies tot de limiet lukt, één byte erover geeft 413 OPSLAG_VOL zonder rij of bestand", async () => {
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    const { org, project } = await opzet();
    await vulOp(org, project, "plan-origineel", MB - lengte);
    await expect(uploadLogo(org)).resolves.toBeDefined();

    const { org: vol, project: volProject } = await opzet();
    await vulOp(vol, volProject, "plan-origineel", MB - lengte + 1);
    const rijen = await aantalRijen();
    const bestandenVoor = await bestandenOpSchijf();
    const fout = await foutVan(() => uploadLogo(vol));
    expect([fout.statusCode, fout.data?.code]).toEqual([413, "OPSLAG_VOL"]);
    expect(await aantalRijen()).toBe(rijen);
    expect(await bestandenOpSchijf()).toEqual(bestandenVoor);
  });
});

describe("dupliceren en Bewaar als nieuw project", () => {
  /** Een project met twee planbestanden van 2 en 3 bytes, waar het document naar verwijst. */
  async function metPlannen() {
    const { org, project } = await opzet();
    const origineel = await bewaarBestand(db, opslag, { organisatieId: org, projectId: project, soort: "plan-origineel", data: PDF });
    const raster = await bewaarBestand(db, opslag, { organisatieId: org, projectId: project, soort: "plan-raster", data: png(10, 10) });
    const document = (await haalProject(db, org, project))!.document;
    const metPlan = {
      ...document,
      situatie: {
        ...document.situatie,
        paginas: [
          {
            id: "p1",
            titel: "Gelijkvloers",
            plaatsingen: [],
            achtergrond: { origineelBestandId: origineel.id, rasterBestandId: raster.id, breedte_px: 10, hoogte_px: 10 },
          },
        ],
      },
    };
    await bewaarProject(db, org, project, 1, { document: metPlan });
    return { org, project, document: metPlan, tekopieren: PDF.length + 33 };
  }

  async function aantalProjecten(org: string): Promise<number> {
    return (await db.select({ id: projecten.id }).from(projecten).where(eq(projecten.organisatieId, org))).length;
  }

  test("dupliceren: precies tot de limiet lukt", async () => {
    const o = await metPlannen();
    // Het bedrijf gebruikt nu `tekopieren` bytes; na de kopie is dat het dubbele.
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(o.org, null, "logo", MB - 2 * o.tekopieren);
    const kopie = await dupliceerProject(db, opslag, o.org, o.project);
    expect(Object.keys(kopie.bestandIds)).toHaveLength(2);
  });

  test("dupliceren: één byte erover geeft 413 OPSLAG_VOL en maakt niets aan", async () => {
    const o = await metPlannen();
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(o.org, null, "logo", MB - 2 * o.tekopieren + 1);
    const projecten0 = await aantalProjecten(o.org);
    const rijen = await aantalRijen();
    const bestandenVoor = await bestandenOpSchijf();

    const fout = await foutVan(() => dupliceerProject(db, opslag, o.org, o.project));

    expect([fout.statusCode, fout.data?.code]).toEqual([413, "OPSLAG_VOL"]);
    expect(await aantalProjecten(o.org)).toBe(projecten0);
    expect(await aantalRijen()).toBe(rijen);
    expect(await bestandenOpSchijf()).toEqual(bestandenVoor);
  });

  test("dupliceren: een project zonder planbestanden kost geen ruimte en lukt ook bij een vol bedrijf", async () => {
    const { org, project } = await opzet();
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(org, null, "logo", MB);
    await expect(dupliceerProject(db, opslag, org, project)).resolves.toMatchObject({ bestandIds: {} });
  });

  test("uit een document: precies tot de limiet lukt", async () => {
    const o = await metPlannen();
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(o.org, null, "logo", MB - 2 * o.tekopieren);
    const nieuw = await maakProjectUitDocument(db, opslag, o.org, { naam: "Nieuw", document: o.document });
    expect(Object.keys(nieuw.bestandIds)).toHaveLength(2);
  });

  test("uit een document: één byte erover geeft 413 OPSLAG_VOL en maakt niets aan", async () => {
    const o = await metPlannen();
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(o.org, null, "logo", MB - 2 * o.tekopieren + 1);
    const projecten0 = await aantalProjecten(o.org);
    const rijen = await aantalRijen();
    const bestandenVoor = await bestandenOpSchijf();

    const fout = await foutVan(() => maakProjectUitDocument(db, opslag, o.org, { naam: "Nieuw", document: o.document }));

    expect([fout.statusCode, fout.data?.code]).toEqual([413, "OPSLAG_VOL"]);
    expect(await aantalProjecten(o.org)).toBe(projecten0);
    expect(await aantalRijen()).toBe(rijen);
    expect(await bestandenOpSchijf()).toEqual(bestandenVoor);
  });
});

describe("een export", () => {
  test("lukt ook boven de limiet, en telt daarna wel mee", async () => {
    const { org, project } = await opzet();
    vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
    await vulOp(org, project, "plan-origineel", MB);
    const info = await bewaarBestand(db, opslag, { organisatieId: org, projectId: project, soort: "export", data: PDF });
    expect(info.grootte).toBe(PDF.length);
    expect(await gebruikteOpslag(db, org)).toBe(MB + PDF.length);
  });
});
