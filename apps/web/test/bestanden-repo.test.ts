import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MAX_UPLOAD_BYTES } from "../shared/bestandsinhoud";
import { maakLokaleOpslag, type BestandOpslag } from "../server/bestanden/opslag";
import { BestandFout, bewaarBestand, haalBestand } from "../server/bestanden/repo";
import { bestanden } from "../server/db/schema";
import { maakProject, verwijderProject } from "../server/projecten/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";

const ONBEKEND = "00000000-0000-4000-8000-000000000000";

let map: string;

beforeEach(async () => {
  map = await mkdtemp(join(tmpdir(), "elentrik-bestanden-"));
});

afterEach(async () => {
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

function pdf(): Uint8Array {
  return new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
}

async function opzet() {
  const db = await maakTestDb();
  const organisatieId = await maakTestOrganisatie(db);
  const { id: projectId } = await maakProject(db, organisatieId, {
    naam: "Woning",
    klantnaam: "Peeters",
    stroomtype: "3N400V",
  });
  return { db, organisatieId, projectId, opslag: maakLokaleOpslag(map) };
}

async function vangFout(belofte: Promise<unknown>): Promise<BestandFout> {
  try {
    await belofte;
  } catch (fout) {
    expect(fout).toBeInstanceOf(BestandFout);
    return fout as BestandFout;
  }
  throw new Error("Er werd geen fout gegooid");
}

describe("bewaarBestand", () => {
  test("een PNG van 10x10 als plan-raster", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const data = png(10, 10);
    const info = await bewaarBestand(db, opslag, { organisatieId, projectId, soort: "plan-raster", data });
    expect(info).toEqual({
      id: expect.any(String),
      mime: "image/png",
      grootte: data.length,
      breedte_px: 10,
      hoogte_px: 10,
    });
    const opSchijf = await readFile(join(map, projectId, info.id));
    expect(new Uint8Array(opSchijf)).toEqual(data);
  });

  test("het type volgt uit de inhoud, ook voor plan-origineel", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const info = await bewaarBestand(db, opslag, {
      organisatieId,
      projectId,
      soort: "plan-origineel",
      data: png(10, 10),
    });
    expect(info.mime).toBe("image/png");
  });

  test("een PDF als plan-origineel heeft geen afmetingen", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const info = await bewaarBestand(db, opslag, {
      organisatieId,
      projectId,
      soort: "plan-origineel",
      data: pdf(),
    });
    expect(info.mime).toBe("application/pdf");
    expect(info.breedte_px).toBeUndefined();
    expect(info.hoogte_px).toBeUndefined();
  });

  test("een PDF of SVG als plan-raster geeft ONGELDIG_TYPE", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const svg = new TextEncoder().encode("<svg></svg>");
    for (const data of [pdf(), svg]) {
      const fout = await vangFout(
        bewaarBestand(db, opslag, { organisatieId, projectId, soort: "plan-raster", data }),
      );
      expect(fout.code).toBe("ONGELDIG_TYPE");
    }
  });

  test("een SVG als plan-origineel geeft ONGELDIG_TYPE", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const svg = new TextEncoder().encode("<svg></svg>");
    const fout = await vangFout(
      bewaarBestand(db, opslag, { organisatieId, projectId, soort: "plan-origineel", data: svg }),
    );
    expect(fout.code).toBe("ONGELDIG_TYPE");
  });

  test("meer dan MAX_UPLOAD_BYTES geeft TE_GROOT", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const data = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    data.set(png(10, 10));
    const fout = await vangFout(
      bewaarBestand(db, opslag, { organisatieId, projectId, soort: "plan-origineel", data }),
    );
    expect(fout.code).toBe("TE_GROOT");
  });

  test("een onbekend project geeft NIET_GEVONDEN en bewaart niets", async () => {
    const { db, organisatieId, opslag } = await opzet();
    const fout = await vangFout(
      bewaarBestand(db, opslag, { organisatieId, projectId: ONBEKEND, soort: "plan-raster", data: png(10, 10) }),
    );
    expect(fout.code).toBe("NIET_GEVONDEN");
    expect(await db.select().from(bestanden)).toHaveLength(0);
  });

  test("een project van een andere organisatie telt als onbekend", async () => {
    const { db, projectId, opslag } = await opzet();
    const ander = await maakTestOrganisatie(db, "Ander");
    const fout = await vangFout(
      bewaarBestand(db, opslag, { organisatieId: ander, projectId, soort: "plan-raster", data: png(10, 10) }),
    );
    expect(fout.code).toBe("NIET_GEVONDEN");
    expect(await db.select().from(bestanden)).toHaveLength(0);
  });

  test("een verwijderd project telt als onbekend", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    await verwijderProject(db, organisatieId, projectId);
    const fout = await vangFout(
      bewaarBestand(db, opslag, { organisatieId, projectId, soort: "plan-raster", data: png(10, 10) }),
    );
    expect(fout.code).toBe("NIET_GEVONDEN");
  });

  test("een raster van 8001x10 geeft RASTER_TE_GROOT, 8000x10 mag", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const fout = await vangFout(
      bewaarBestand(db, opslag, { organisatieId, projectId, soort: "plan-raster", data: png(8001, 10) }),
    );
    expect(fout.code).toBe("RASTER_TE_GROOT");
    const info = await bewaarBestand(db, opslag, {
      organisatieId,
      projectId,
      soort: "plan-raster",
      data: png(8000, 10),
    });
    expect(info.breedte_px).toBe(8000);
  });

  test("een raster met breedte of hoogte 0 geeft ONGELDIG_TYPE", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    for (const data of [png(0, 10), png(10, 0)]) {
      const fout = await vangFout(
        bewaarBestand(db, opslag, { organisatieId, projectId, soort: "plan-raster", data }),
      );
      expect(fout.code).toBe("ONGELDIG_TYPE");
    }
  });

  test("een afgekapte PNG (afmetingen onleesbaar) als raster geeft ONGELDIG_TYPE", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const data = png(10, 10).slice(0, 12);
    const fout = await vangFout(
      bewaarBestand(db, opslag, { organisatieId, projectId, soort: "plan-raster", data }),
    );
    expect(fout.code).toBe("ONGELDIG_TYPE");
  });

  test("een mislukte schrijfactie laat geen rij achter en gooit de fout opnieuw", async () => {
    const { db, organisatieId, projectId } = await opzet();
    const kapot: BestandOpslag = {
      async schrijf() {
        throw new Error("schijf vol");
      },
      async lees() {
        return null;
      },
      async bestaat() {
        return false;
      },
      async lijst() {
        return [];
      },
      async verwijder() {},
    };
    await expect(
      bewaarBestand(db, kapot, { organisatieId, projectId, soort: "plan-raster", data: png(10, 10) }),
    ).rejects.toThrow("schijf vol");
    expect(await db.select().from(bestanden)).toHaveLength(0);
  });
});

describe("bewaarBestand voor een export", () => {
  test("soort export met een PDF krijgt mime application/pdf en de sleutel <projectId>/<id>", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const info = await bewaarBestand(db, opslag, { organisatieId, projectId, soort: "export", data: pdf() });
    expect(info.mime).toBe("application/pdf");
    expect(info.breedte_px).toBeUndefined();
    const [rij] = await db.select().from(bestanden).where(eq(bestanden.id, info.id));
    expect(rij).toMatchObject({ organisatieId: null, projectId, soort: "export", sleutel: `${projectId}/${info.id}` });
  });

  test("soort export met een PNG geeft ONGELDIG_TYPE", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const fout = await vangFout(
      bewaarBestand(db, opslag, { organisatieId, projectId, soort: "export", data: png(10, 10) }),
    );
    expect(fout.code).toBe("ONGELDIG_TYPE");
  });
});

describe("bestanden zonder project", () => {
  test("project_id is nullable in de database", async () => {
    const { db } = await opzet();
    const [rij] = await db
      .insert(bestanden)
      .values({ soort: "logo", mime: "image/png", grootte: 1, sleutel: "bedrijf/x" })
      .returning();
    expect(rij?.projectId).toBeNull();
  });
});

describe("index op bestanden.project_id", () => {
  test("de migratie maakt een index op project_id", async () => {
    const { db } = await opzet();
    const resultaat = (await db.execute(
      sql`select indexdef from pg_indexes where tablename = 'bestanden' and indexname = 'bestanden_project_id_idx'`,
    )) as unknown as { rows: { indexdef: string }[] };
    expect(resultaat.rows).toHaveLength(1);
    expect(resultaat.rows[0]!.indexdef).toMatch(/\(project_id\)/);
  });
});

describe("haalBestand", () => {
  test("een onbekend id geeft null", async () => {
    const { db } = await opzet();
    expect(await haalBestand(db, ONBEKEND)).toBeNull();
  });

  test("geeft id, soort, mime, sleutel en project van een bewaard bestand", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const info = await bewaarBestand(db, opslag, {
      organisatieId,
      projectId,
      soort: "plan-raster",
      data: png(10, 10),
    });
    expect(await haalBestand(db, info.id)).toEqual({
      id: info.id,
      soort: "plan-raster",
      mime: "image/png",
      sleutel: `${projectId}/${info.id}`,
      projectId,
      organisatieId,
      projectVerwijderd: false,
    });
  });

  test("meldt dat het project verwijderd is; een logo zonder project is nooit verwijderd", async () => {
    const { db, organisatieId, projectId, opslag } = await opzet();
    const info = await bewaarBestand(db, opslag, { organisatieId, projectId, soort: "plan-raster", data: png(10, 10) });
    await verwijderProject(db, organisatieId, projectId);
    expect((await haalBestand(db, info.id))!.projectVerwijderd).toBe(true);
    const [logo] = await db
      .insert(bestanden)
      .values({ organisatieId, soort: "logo", mime: "image/png", grootte: 1, sleutel: "bedrijf/z" })
      .returning({ id: bestanden.id });
    expect((await haalBestand(db, logo!.id))!.projectVerwijderd).toBe(false);
  });

  test("de organisatie van een logo komt uit de eigen kolom; zonder organisatie is ze null", async () => {
    const { db, organisatieId } = await opzet();
    const [logo] = await db
      .insert(bestanden)
      .values({ organisatieId, soort: "logo", mime: "image/png", grootte: 1, sleutel: "bedrijf/x" })
      .returning({ id: bestanden.id });
    const [wees] = await db
      .insert(bestanden)
      .values({ soort: "logo", mime: "image/png", grootte: 1, sleutel: "bedrijf/y" })
      .returning({ id: bestanden.id });
    expect((await haalBestand(db, logo!.id))!.organisatieId).toBe(organisatieId);
    expect((await haalBestand(db, wees!.id))!.organisatieId).toBeNull();
  });
});
