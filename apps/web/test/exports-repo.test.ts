import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { controleer, haalRegelset } from "@elentrik/arei";
import { referentieRijwoning, referentieWoning } from "@elentrik/arei/testing";
import type { InstallatieDocument } from "@elentrik/model";
import { NL } from "@elentrik/render";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ExportInvoer } from "../shared/exports";
import { bewaarBedrijf, bewaarLogo } from "../server/bedrijf/repo";
import { maakLokaleOpslag, type BestandOpslag } from "../server/bestanden/opslag";
import { bewaarBestand } from "../server/bestanden/repo";
import type { Db } from "../server/db";
import { bedrijfsinstellingen, bestanden, exports, projecten, snapshots } from "../server/db/schema";
import { exportBestandsnaam, lijstExports, maakExport } from "../server/exports/repo";
import { PdfFout, type PdfInvoer } from "../server/pdf/gotenberg";
import { bewaarProject, maakProject, ProjectFout } from "../server/projecten/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";

const ONBEKEND = "00000000-0000-4000-8000-000000000000";
/** De versie van een project na `maakProject` en één `bewaarProject`, zoals in `opzet`. */
const VERSIE = 2;
const PDF = new TextEncoder().encode("%PDF-1.7\n%nep\n");

let map: string;

beforeEach(async () => {
  map = await mkdtemp(join(tmpdir(), "elentrik-exports-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(map, { recursive: true, force: true });
});

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

/** Een nep-`maakPdf` die `%PDF-1.7` teruggeeft en zijn invoer bewaart. */
function nepPdf() {
  const oproepen: PdfInvoer[] = [];
  return {
    oproepen,
    maakPdf: async (invoer: PdfInvoer): Promise<Uint8Array> => {
      oproepen.push(invoer);
      return PDF;
    },
  };
}

function invoer(extra: Partial<ExportInvoer> = {}): ExportInvoer {
  return {
    onderdelen: { eendraadschema: true, situatieschema: false, kringenlijst: true, bijlage: false },
    papier: "A4",
    versieLabel: "V1",
    ...extra,
  };
}

/**
 * Zet het document van een project rechtstreeks in de tabel (versie 2, zoals `opzet`), zonder de controle
 * van `bewaarProject` op nieuwe planverwijzingen: voor documenten met een verwijzing die niet van het
 * project is, zoals oudere documenten die kunnen hebben (de export slaat zo'n plan over).
 */
async function zetDocumentZonderControle(db: Db, projectId: string, document: InstallatieDocument) {
  await db.update(projecten).set({ document, versie: VERSIE }).where(eq(projecten.id, projectId));
}

/** Een project met het gegeven document, bewaard zoals de editor dat doet (versie 2). */
async function opzet(doc: InstallatieDocument = referentieWoning()) {
  const db = await maakTestDb();
  const org = await maakTestOrganisatie(db);
  const opslag = maakLokaleOpslag(map);
  const { id: projectId } = await maakProject(db, org, { naam: "Huis Peeters", klantnaam: "", stroomtype: "3N400V" });
  await bewaarProject(db, org, projectId, 1, { document: doc });
  return { db, org, opslag, projectId };
}

async function tel(db: Db) {
  return {
    snapshots: (await db.select().from(snapshots)).length,
    exports: (await db.select().from(exports)).length,
    bestanden: (await db.select().from(bestanden)).length,
  };
}

async function bestandenOpSchijf(): Promise<string[]> {
  return (await readdir(map, { recursive: true, withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name);
}

/** Voegt een situatiepagina toe die naar het gegeven rasterbestand wijst. */
function metSituatiePagina(doc: InstallatieDocument, titel: string, rasterBestandId: string): void {
  doc.situatie.paginas.push({
    id: `pagina-${doc.situatie.paginas.length + 1}`,
    titel,
    achtergrond: { origineelBestandId: rasterBestandId, rasterBestandId, breedte_px: 40, hoogte_px: 20 },
    plaatsingen: [],
  });
}

describe("maakExport", () => {
  test("een export maakt een snapshot, een bestand en een rij, en de PDF-bytes staan in de opslag", async () => {
    const { db, org, opslag, projectId } = await opzet();
    const nep = nepPdf();
    const nu = new Date(2026, 9, 19, 14, 30);

    const info = await maakExport(db, opslag, org, projectId, VERSIE, invoer({ papier: "A3", versieLabel: "V1" }), {
      maakPdf: nep.maakPdf,
      nu: () => nu,
    });

    expect(info).toEqual({
      id: expect.any(String),
      bestandId: expect.any(String),
      versieLabel: "V1",
      papier: "A3",
      aantalFouten: 0,
      aantalWaarschuwingen: 0,
      aangemaakt: nu.toISOString(),
    });
    expect(nep.oproepen).toHaveLength(1);
    expect(nep.oproepen[0]!.papier).toBe("A3");
    expect(nep.oproepen[0]!.html).toContain("<!doctype html>");

    const [snapshot] = await db.select().from(snapshots);
    expect(snapshot).toMatchObject({ projectId, versie: 2, reden: "export" });

    const [bestand] = await db.select().from(bestanden).where(eq(bestanden.id, info.bestandId));
    expect(bestand).toMatchObject({ projectId, soort: "export", mime: "application/pdf", grootte: PDF.length });
    expect(new Uint8Array(await readFile(join(map, bestand!.sleutel)))).toEqual(PDF);

    const [rij] = await db.select().from(exports);
    expect(rij).toMatchObject({
      id: info.id,
      projectId,
      snapshotId: snapshot!.id,
      bestandId: info.bestandId,
      versieLabel: "V1",
      papier: "A3",
      onderdelen: { eendraadschema: true, situatieschema: false, kringenlijst: true, bijlage: false },
      aantalFouten: 0,
      aantalWaarschuwingen: 0,
    });
  });

  test("het snapshot is het opgeslagen document met de huidige versie", async () => {
    const doc = referentieWoning();
    const { db, org, opslag, projectId } = await opzet(doc);
    await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nepPdf().maakPdf });
    const [snapshot] = await db.select().from(snapshots);
    expect(snapshot!.versie).toBe(2);
    expect(snapshot!.document).toEqual(doc);
  });

  test("zonder fouten en met bijlage uit komt er geen bijlage in de HTML", async () => {
    const { db, org, opslag, projectId } = await opzet();
    const nep = nepPdf();
    await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf });
    expect(nep.oproepen[0]!.html).not.toContain(NL.paginatitels.bijlage);
  });

  test("een onopgeloste fout zet de bijlage verplicht aan, ook met bijlage: false", async () => {
    const { db, org, opslag, projectId } = await opzet(referentieRijwoning());
    const nep = nepPdf();
    const info = await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf });
    expect(info.aantalFouten).toBeGreaterThanOrEqual(1);
    expect(nep.oproepen[0]!.html).toContain(NL.paginatitels.bijlage);
    const [rij] = await db.select().from(exports);
    expect((rij!.onderdelen as { bijlage: boolean }).bijlage).toBe(true);
  });

  test("een afgeweken fout telt niet en maakt de bijlage niet verplicht", async () => {
    const zonder = await opzet(referentieRijwoning());
    const eerste = await maakExport(zonder.db, zonder.opslag, zonder.org, zonder.projectId, VERSIE, invoer(), { maakPdf: nepPdf().maakPdf });
    expect(eerste.aantalFouten).toBe(1);

    // Dezelfde fout, maar met een afwijking op het onderwerp van de bevinding.
    const doc = structuredClone(referentieRijwoning());
    const fout = controleer(doc, haalRegelset(doc.regelset)).find((b) => b.ernst === "fout")!;
    doc.afwijkingen.push({
      regelId: fout.regelId,
      nodeId: fout.nodeIds[0]!,
      motivatie: "Bewust zo, met akkoord van de keurder.",
      door: "Steff",
      datum: "2026-10-19",
    });
    const met = await opzet(doc);
    const nep = nepPdf();
    const tweede = await maakExport(met.db, met.opslag, met.org, met.projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf });
    expect(tweede.aantalFouten).toBe(0);
    expect(nep.oproepen[0]!.html).not.toContain(NL.paginatitels.bijlage);
  });

  test("Review Focus 2: een PdfFout bewaart niets, geen rijen en geen bestand", async () => {
    const { db, org, opslag, projectId } = await opzet();
    const voor = await tel(db);
    const maakPdf = async (): Promise<Uint8Array> => {
      throw new PdfFout("ONBEREIKBAAR", "De PDF-dienst is niet bereikbaar.");
    };
    const fout = await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf }).catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(PdfFout);
    expect((fout as PdfFout).code).toBe("ONBEREIKBAAR");
    expect(await tel(db)).toEqual(voor);
    expect(await bestandenOpSchijf()).toEqual([]);
  });

  test("een schrijffout in de opslag laat geen rijen achter", async () => {
    const { db, org, projectId } = await opzet();
    const stuk: BestandOpslag = {
      ...maakLokaleOpslag(map),
      schrijf: async () => {
        throw new Error("schijf vol");
      },
    };
    const voor = await tel(db);
    await expect(maakExport(db, stuk, org, projectId, VERSIE, invoer(), { maakPdf: nepPdf().maakPdf })).rejects.toThrow("schijf vol");
    expect(await tel(db)).toEqual(voor);
  });

  test("een antwoord dat geen PDF is, wordt niet bewaard", async () => {
    const { db, org, opslag, projectId } = await opzet();
    const voor = await tel(db);
    const maakPdf = async () => new TextEncoder().encode("<html>geen pdf</html>");
    const fout = await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf }).catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(PdfFout);
    expect((fout as PdfFout).code).toBe("MISLUKT");
    expect(await tel(db)).toEqual(voor);
  });

  test("een andere versie dan de opgeslagen geeft CONFLICT met de huidige versie en bewaart niets", async () => {
    const { db, org, opslag, projectId } = await opzet();
    // Een ander venster bewaart intussen versie 3; dit venster toont nog versie 2.
    await bewaarProject(db, org, projectId, VERSIE, { document: referentieRijwoning() });
    const voor = await tel(db);
    const nep = nepPdf();
    const fout = await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf }).catch(
      (e: unknown) => e,
    );
    expect(fout).toBeInstanceOf(ProjectFout);
    expect((fout as ProjectFout).code).toBe("CONFLICT");
    expect((fout as ProjectFout).details).toEqual({ versie: VERSIE + 1 });
    expect(nep.oproepen).toEqual([]);
    expect(await tel(db)).toEqual(voor);
    expect(await bestandenOpSchijf()).toEqual([]);
  });

  test("een onbekend project geeft NIET_GEVONDEN", async () => {
    const { db, org, opslag } = await opzet();
    const fout = await maakExport(db, opslag, org, ONBEKEND, VERSIE, invoer(), { maakPdf: nepPdf().maakPdf }).catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(ProjectFout);
    expect((fout as ProjectFout).code).toBe("NIET_GEVONDEN");
  });

  test("Review Focus 4: een ontbrekend rasterbestand wordt overgeslagen, de export lukt en de bijlage vermeldt het", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const opslag = maakLokaleOpslag(map);
    const { id: projectId } = await maakProject(db, org, { naam: "Huis", klantnaam: "", stroomtype: "3N400V" });
    const raster = await bewaarBestand(db, opslag, { organisatieId: org, projectId, soort: "plan-raster", data: png(40, 20) });
    const weg = await bewaarBestand(db, opslag, { organisatieId: org, projectId, soort: "plan-raster", data: png(40, 20) });
    await rm(join(map, projectId, weg.id));

    const doc = structuredClone(referentieWoning());
    metSituatiePagina(doc, "Gelijkvloers", raster.id);
    metSituatiePagina(doc, "Kelder", weg.id);
    metSituatiePagina(doc, "Zolder", ONBEKEND);
    metSituatiePagina(doc, "Garage", "geen-uuid");
    await zetDocumentZonderControle(db, projectId, doc);

    const nep = nepPdf();
    const info = await maakExport(
      db,
      opslag,
      org,
      projectId,
      VERSIE,
      invoer({ onderdelen: { eendraadschema: false, situatieschema: true, kringenlijst: false, bijlage: false } }),
      { maakPdf: nep.maakPdf },
    );
    expect(info.aantalFouten).toBe(0);

    const { html, bestanden: meegegeven } = nep.oproepen[0]!;
    expect(meegegeven.map((b) => ({ naam: b.naam, mime: b.mime, data: b.data }))).toEqual([
      { naam: `plan-${raster.id}.png`, mime: "image/png", data: png(40, 20) },
    ]);
    expect(html).toContain(`src="plan-${raster.id}.png"`);
    expect(html).toContain(NL.paginatitels.bijlage);
    expect(html).toContain("Overgeslagen pagina");
    for (const titel of ["Kelder", "Zolder", "Garage"]) expect(html).toContain(titel);
    const [rij] = await db.select().from(exports);
    expect((rij!.onderdelen as { bijlage: boolean }).bijlage).toBe(true);
  });

  test("een PNG die zelf als raster dient (plan-origineel, zelfde id) gaat mee op de situatiepagina", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const opslag = maakLokaleOpslag(map);
    const { id: projectId } = await maakProject(db, org, { naam: "Huis", klantnaam: "", stroomtype: "3N400V" });
    // De editor uploadt een PNG of JPEG maar één keer, als plan-origineel; dat bestand is ook het raster.
    const eigen = await bewaarBestand(db, opslag, { organisatieId: org, projectId, soort: "plan-origineel", data: png(40, 20) });
    const doc = structuredClone(referentieWoning());
    metSituatiePagina(doc, "Gelijkvloers", eigen.id);
    await zetDocumentZonderControle(db, projectId, doc);

    const nep = nepPdf();
    await maakExport(
      db,
      opslag,
      org,
      projectId,
      VERSIE,
      invoer({ onderdelen: { eendraadschema: false, situatieschema: true, kringenlijst: false, bijlage: false } }),
      { maakPdf: nep.maakPdf },
    );
    const { html, bestanden: meegegeven } = nep.oproepen[0]!;
    expect(meegegeven.map((b) => b.naam)).toEqual([`plan-${eigen.id}.png`]);
    expect(html).toContain(`src="plan-${eigen.id}.png"`);
    expect(html).not.toContain("Overgeslagen pagina");
  });

  test.each([
    {
      geval: "een PDF als plan-origineel",
      maak: (db: Db, opslag: BestandOpslag, org: string, projectId: string) =>
        bewaarBestand(db, opslag, { organisatieId: org, projectId, soort: "plan-origineel", data: PDF }),
    },
    {
      geval: "een logo",
      maak: (db: Db, opslag: BestandOpslag, org: string) => bewaarLogo(db, opslag, org, png(30, 10)),
    },
    {
      geval: "een export",
      maak: (db: Db, opslag: BestandOpslag, org: string, projectId: string) =>
        bewaarBestand(db, opslag, { organisatieId: org, projectId, soort: "export", data: PDF }),
    },
    {
      geval: "een PNG als plan-origineel van een ander project",
      maak: async (db: Db, opslag: BestandOpslag, org: string) => {
        const { id: anderId } = await maakProject(db, org, { naam: "Ander huis", klantnaam: "", stroomtype: "3N400V" });
        return bewaarBestand(db, opslag, { organisatieId: org, projectId: anderId, soort: "plan-origineel", data: png(40, 20) });
      },
    },
  ])("$geval als rasterBestandId wordt overgeslagen en staat in de bijlage", async ({ maak }) => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const opslag = maakLokaleOpslag(map);
    const { id: projectId } = await maakProject(db, org, { naam: "Huis", klantnaam: "", stroomtype: "3N400V" });
    const vreemd = await maak(db, opslag, org, projectId);
    const doc = structuredClone(referentieWoning());
    metSituatiePagina(doc, "Vreemd plan", vreemd.id);
    await zetDocumentZonderControle(db, projectId, doc);

    const nep = nepPdf();
    await maakExport(
      db,
      opslag,
      org,
      projectId,
      VERSIE,
      invoer({ onderdelen: { eendraadschema: false, situatieschema: true, kringenlijst: false, bijlage: false } }),
      { maakPdf: nep.maakPdf },
    );
    const { html, bestanden: meegegeven } = nep.oproepen[0]!;
    // Een logo-rij hoort wel als logo mee (het is het bedrijfslogo), maar niet als plan.
    expect(meegegeven.filter((b) => b.naam.startsWith("plan-"))).toEqual([]);
    expect(html).not.toContain(`plan-${vreemd.id}`);
    expect(html).toContain("Overgeslagen pagina");
    expect(html).toContain("Vreemd plan");
    const [rij] = await db.select().from(exports);
    expect((rij!.onderdelen as { bijlage: boolean }).bijlage).toBe(true);
  });

  test("zonder situatieschema worden geen rasters gelezen en is de bijlage niet verplicht", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const opslag = maakLokaleOpslag(map);
    const { id: projectId } = await maakProject(db, org, { naam: "Huis", klantnaam: "", stroomtype: "3N400V" });
    const doc = structuredClone(referentieWoning());
    metSituatiePagina(doc, "Kelder", ONBEKEND);
    await zetDocumentZonderControle(db, projectId, doc);

    const nep = nepPdf();
    await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf });
    expect(nep.oproepen[0]!.bestanden).toEqual([]);
    expect(nep.oproepen[0]!.html).not.toContain(NL.paginatitels.bijlage);
  });

  test("het logo van de installateur gaat mee als logo.png", async () => {
    const { db, org, opslag, projectId } = await opzet();
    await bewaarBedrijf(db, org, { naam: "Elektro Peeters bv" });
    await bewaarLogo(db, opslag, org, png(30, 10));

    const nep = nepPdf();
    await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf });
    const { html, bestanden: meegegeven } = nep.oproepen[0]!;
    expect(meegegeven).toEqual([{ naam: "logo.png", mime: "image/png", data: png(30, 10) }]);
    expect(html).toContain('src="logo.png"');
    expect(html).toContain("Elektro Peeters bv");
  });

  test("een logo dat ontbreekt in de opslag wordt overgeslagen met een waarschuwing in het log", async () => {
    const { db, org, opslag, projectId } = await opzet();
    const logo = await bewaarLogo(db, opslag, org, png(30, 10));
    await rm(join(map, "org", org, logo.id));
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});

    const nep = nepPdf();
    await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf });
    expect(nep.oproepen[0]!.bestanden).toEqual([]);
    expect(nep.oproepen[0]!.html).not.toContain("logo.png");
    expect(log).toHaveBeenCalledTimes(1);
    const tekst = JSON.stringify(log.mock.calls[0]);
    expect(tekst).toContain(projectId);
    expect(tekst).toContain(logo.id);
  });

  test("met een logo dat er is, komt er geen waarschuwing", async () => {
    const { db, org, opslag, projectId } = await opzet();
    await bewaarLogo(db, opslag, org, png(30, 10));
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nepPdf().maakPdf });
    expect(log).not.toHaveBeenCalled();
  });

  test("de datum komt uit het document, of anders vandaag in lokale tijd", async () => {
    const metDatum = structuredClone(referentieWoning());
    metDatum.meta.datum = "2026-10-01";
    const een = await opzet(metDatum);
    const nep1 = nepPdf();
    await maakExport(een.db, een.opslag, een.org, een.projectId, VERSIE, invoer(), {
      maakPdf: nep1.maakPdf,
      nu: () => new Date(2026, 2, 5, 23, 59),
    });
    expect(nep1.oproepen[0]!.html).toMatch(/>Datum: 1\/10\/2026</);

    const zonderDatum = structuredClone(referentieWoning());
    zonderDatum.meta.datum = "";
    const twee = await opzet(zonderDatum);
    const nep2 = nepPdf();
    await maakExport(twee.db, twee.opslag, twee.org, twee.projectId, VERSIE, invoer(), {
      maakPdf: nep2.maakPdf,
      nu: () => new Date(2026, 2, 5, 23, 59),
    });
    expect(nep2.oproepen[0]!.html).toMatch(/>Datum: 5\/03\/2026</);
  });
});

describe("maakExport per organisatie", () => {
  test("een project van een andere organisatie geeft NIET_GEVONDEN en bewaart niets", async () => {
    const { db, opslag, projectId } = await opzet();
    const andere = await maakTestOrganisatie(db, "Ander");
    const nep = nepPdf();
    const fout = await maakExport(db, opslag, andere, projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf }).catch(
      (e: unknown) => e,
    );
    expect(fout).toBeInstanceOf(ProjectFout);
    expect((fout as ProjectFout).code).toBe("NIET_GEVONDEN");
    expect(nep.oproepen).toHaveLength(0);
    expect(await tel(db)).toEqual({ snapshots: 0, exports: 0, bestanden: 0 });
  });

  test("de cartouche krijgt de bedrijfsgegevens en het logo van de eigen organisatie, niet die van een andere", async () => {
    const { db, org, opslag, projectId } = await opzet();
    const andere = await maakTestOrganisatie(db, "Ander");
    await bewaarBedrijf(db, org, { naam: "Eigen Elektro" });
    await bewaarBedrijf(db, andere, { naam: "Vreemd Elektro" });
    const vreemdLogo = await bewaarLogo(db, opslag, andere, png(30, 10));
    // Een vervalste verwijzing naar het logo van een andere organisatie gaat niet mee.
    await db
      .update(bedrijfsinstellingen)
      .set({ installateur: { naam: "Eigen Elektro", logoBestandId: vreemdLogo.id } })
      .where(eq(bedrijfsinstellingen.organisatieId, org));
    const waarschuwing = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const nep = nepPdf();
      await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf });
      expect(nep.oproepen[0]!.html).toContain("Eigen Elektro");
      expect(nep.oproepen[0]!.html).not.toContain("Vreemd Elektro");
      expect(nep.oproepen[0]!.bestanden).toEqual([]);
      expect(waarschuwing).toHaveBeenCalledTimes(1);
    } finally {
      waarschuwing.mockRestore();
    }
  });
});

describe("lijstExports", () => {
  test("geeft de exports van het project, de nieuwste eerst", async () => {
    const { db, org, opslag, projectId } = await opzet();
    const ander = await maakProject(db, org, { naam: "Ander", klantnaam: "", stroomtype: "2x230V" });
    const deps = (dag: number) => ({ maakPdf: nepPdf().maakPdf, nu: () => new Date(2026, 9, dag, 12) });
    const v1 = await maakExport(db, opslag, org, projectId, VERSIE, invoer({ versieLabel: "V1" }), deps(1));
    const v3 = await maakExport(db, opslag, org, projectId, VERSIE, invoer({ versieLabel: "V3" }), deps(3));
    const v2 = await maakExport(db, opslag, org, projectId, VERSIE, invoer({ versieLabel: "V2" }), deps(2));

    expect(await lijstExports(db, org, projectId)).toEqual([v3, v2, v1]);
    expect(await lijstExports(db, org, ander.id)).toEqual([]);
  });

  test("een andere organisatie ziet de exports van het project niet", async () => {
    const { db, org, opslag, projectId } = await opzet();
    const andere = await maakTestOrganisatie(db, "Ander");
    await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nepPdf().maakPdf });
    expect(await lijstExports(db, andere, projectId)).toEqual([]);
    expect(await lijstExports(db, org, projectId)).toHaveLength(1);
  });
});

describe("exportBestandsnaam", () => {
  test("is <projectnaam> - <versieLabel>.pdf", async () => {
    const { db, org, opslag, projectId } = await opzet();
    const info = await maakExport(db, opslag, org, projectId, VERSIE, invoer({ versieLabel: "V1" }), { maakPdf: nepPdf().maakPdf });
    expect(await exportBestandsnaam(db, info.bestandId)).toBe("Huis Peeters - V1.pdf");
  });

  test("valt terug op export.pdf zonder exportrij", async () => {
    const { db } = await opzet();
    expect(await exportBestandsnaam(db, ONBEKEND)).toBe("export.pdf");
  });
});

describe("maakExport: watermerk van staging", () => {
  async function exporteer(omgeving: string | undefined, dossierTaal?: "nl" | "fr" | "en") {
    const doc = structuredClone(referentieWoning());
    if (dossierTaal !== undefined) doc.meta.dossierTaal = dossierTaal;
    const { db, org, opslag, projectId } = await opzet(doc);
    const nep = nepPdf();
    const env = omgeving === undefined ? {} : { ELENTRIK_OMGEVING: omgeving };
    await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf, env });
    return nep.oproepen[0]!.html;
  }

  test("bij staging staat het watermerk in de dossiertaal op elke pagina (fr: Document non valable)", async () => {
    const html = await exporteer("staging", "fr");
    expect(html).toContain('<div class="watermerk-titel">STAGING</div>');
    expect(html).toContain('<div class="watermerk-ondertitel">Document non valable</div>');
    expect(html.match(/class="watermerk"/g)!.length).toBe(html.match(/<section class="pagina">/g)!.length);
  });

  test("bij staging zonder dossiertaal is de ondertitel Nederlands", async () => {
    expect(await exporteer("staging")).toContain("Geen geldig document");
  });

  test("bij productie, een lege of onbekende omgeving staat er geen watermerk in", async () => {
    for (const omgeving of ["productie", "", "iets-anders", undefined]) {
      expect(await exporteer(omgeving, "fr")).not.toContain("watermerk");
    }
  });

  test("zonder ingespoten omgeving leest de export ELENTRIK_OMGEVING op het moment van de aanroep", async () => {
    const { db, org, opslag, projectId } = await opzet();
    const nep = nepPdf();
    vi.stubEnv("ELENTRIK_OMGEVING", "staging");
    try {
      await maakExport(db, opslag, org, projectId, VERSIE, invoer(), { maakPdf: nep.maakPdf });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(nep.oproepen[0]!.html).toContain("watermerk-titel");
  });
});
