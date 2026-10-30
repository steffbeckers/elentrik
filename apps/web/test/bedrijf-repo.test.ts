import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Partij } from "@elentrik/model";
import { MAX_LOGO_BYTES } from "../shared/bestandsinhoud";
import { BedrijfFout, bewaarBedrijf, bewaarLogo, haalBedrijf } from "../server/bedrijf/repo";
import { maakLokaleOpslag, type BestandOpslag } from "../server/bestanden/opslag";
import { BestandFout } from "../server/bestanden/repo";
import { bedrijfsinstellingen, bestanden } from "../server/db/schema";
import { maakTestDb, maakTestOrganisatie } from "./db";

let map: string;

beforeEach(async () => {
  map = await mkdtemp(join(tmpdir(), "elentrik-bedrijf-"));
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

const VOLLEDIG: Partij = {
  naam: "Elektro Peeters BV",
  ondernemingsnummer: "BE0123.456.789",
  email: "info@peeters.example",
  telefoon: "+32 3 123 45 67",
  adres: {
    straat: "Kerkstraat",
    nummer: "12",
    bus: "3",
    postcode: "2000",
    gemeente: "Antwerpen",
    land: "België",
  },
};

async function vangFout<T extends Error>(
  belofte: Promise<unknown>,
  klasse: abstract new (...args: never[]) => T,
): Promise<T> {
  try {
    await belofte;
  } catch (fout) {
    expect(fout).toBeInstanceOf(klasse);
    return fout as T;
  }
  throw new Error("Er werd geen fout gegooid");
}

describe("haalBedrijf en bewaarBedrijf", () => {
  test("zonder rij geeft haalBedrijf { naam: '' }", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    expect(await haalBedrijf(db, org)).toEqual({ naam: "" });
  });

  test("bewaar en dan haal geeft dezelfde waarde", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const bewaard = await bewaarBedrijf(db, org, VOLLEDIG);
    expect(bewaard).toEqual(VOLLEDIG);
    expect(await haalBedrijf(db, org)).toEqual(VOLLEDIG);
  });

  test("een tweede bewaar vervangt de waarde en houdt één rij voor de organisatie", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    await bewaarBedrijf(db, org, VOLLEDIG);
    await bewaarBedrijf(db, org, { naam: "Nieuw" });
    expect(await haalBedrijf(db, org)).toEqual({ naam: "Nieuw" });
    const rijen = await db.select().from(bedrijfsinstellingen);
    expect(rijen.map((rij) => rij.organisatieId)).toEqual([org]);
    expect(rijen[0]!.id).not.toBe(1);
  });

  test("elke organisatie heeft haar eigen rij; een nieuwe rij wordt aangemaakt bij het eerste bewaren", async () => {
    const db = await maakTestDb();
    const a = await maakTestOrganisatie(db, "A");
    const b = await maakTestOrganisatie(db, "B");
    await bewaarBedrijf(db, a, VOLLEDIG);
    expect(await haalBedrijf(db, b)).toEqual({ naam: "" });
    await bewaarBedrijf(db, b, { naam: "Janssens" });
    expect(await haalBedrijf(db, a)).toEqual(VOLLEDIG);
    expect(await haalBedrijf(db, b)).toEqual({ naam: "Janssens" });
    expect(await db.select().from(bedrijfsinstellingen)).toHaveLength(2);
  });

  test("de legacy-rij id = 1 is van de organisatie die ze overnam, en wordt daar bijgewerkt", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    await db.insert(bedrijfsinstellingen).values({ id: 1, installateur: { naam: "Oud" } });
    expect(await haalBedrijf(db, org)).toEqual({ naam: "" });
    await db.update(bedrijfsinstellingen).set({ organisatieId: org }).where(eq(bedrijfsinstellingen.id, 1));
    expect(await haalBedrijf(db, org)).toEqual({ naam: "Oud" });
    await bewaarBedrijf(db, org, { naam: "Nieuw" });
    const rijen = await db.select().from(bedrijfsinstellingen);
    expect(rijen.map((r) => [r.id, r.organisatieId, r.installateur])).toEqual([[1, org, { naam: "Nieuw" }]]);
  });

  test("een ongeldig adres wordt geweigerd en bewaart niets", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const fout = await vangFout(
      bewaarBedrijf(db, org, { naam: "X", adres: { straat: "Kerkstraat" } } as unknown as Partij),
      BedrijfFout,
    );
    expect(fout.code).toBe("ONGELDIG");
    expect(await haalBedrijf(db, org)).toEqual({ naam: "" });
  });

  test("onbekende velden worden geweigerd", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const fout = await vangFout(
      bewaarBedrijf(db, org, { naam: "X", website: "x" } as unknown as Partij),
      BedrijfFout,
    );
    expect(fout.code).toBe("ONGELDIG");
  });
});

describe("bewaarLogo", () => {
  test("een PNG wordt bewaard onder org/<organisatieId>/<id> zonder project, en logoBestandId is gezet", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const opslag = maakLokaleOpslag(map);
    const data = png(40, 20);
    const info = await bewaarLogo(db, opslag, org, data);
    expect(info).toEqual({
      id: expect.any(String),
      mime: "image/png",
      grootte: data.length,
      breedte_px: 40,
      hoogte_px: 20,
    });
    expect(new Uint8Array(await readFile(join(map, "org", org, info.id)))).toEqual(data);
    const [rij] = await db.select().from(bestanden).where(eq(bestanden.id, info.id));
    expect(rij).toMatchObject({
      projectId: null,
      organisatieId: org,
      soort: "logo",
      mime: "image/png",
      sleutel: `org/${org}/${info.id}`,
    });
    expect(await haalBedrijf(db, org)).toEqual({ naam: "", logoBestandId: info.id });
  });

  test("een JPEG is toegelaten", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    // SOI + SOF0 met hoogte 16 en breedte 32.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0x10, 0x00, 0x20]);
    const info = await bewaarLogo(db, maakLokaleOpslag(map), org, jpeg);
    expect(info).toMatchObject({ mime: "image/jpeg", breedte_px: 32, hoogte_px: 16 });
  });

  test("het logo overleeft een nieuwe bewaarBedrijf, ook als die logoBestandId meestuurt", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const info = await bewaarLogo(db, maakLokaleOpslag(map), org, png(10, 10));
    const bewaard = await bewaarBedrijf(db, org, { ...VOLLEDIG, logoBestandId: "ander-id" });
    expect(bewaard).toEqual({ ...VOLLEDIG, logoBestandId: info.id });
    expect(await haalBedrijf(db, org)).toEqual({ ...VOLLEDIG, logoBestandId: info.id });
  });

  test("een logo bewaren behoudt de overige bedrijfsgegevens", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    await bewaarBedrijf(db, org, VOLLEDIG);
    const info = await bewaarLogo(db, maakLokaleOpslag(map), org, png(10, 10));
    expect(await haalBedrijf(db, org)).toEqual({ ...VOLLEDIG, logoBestandId: info.id });
  });

  test("een logo met onleesbare of nulafmetingen geeft ONGELDIG_TYPE en bewaart niets", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const opslag = maakLokaleOpslag(map);
    const afgekapteJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);
    for (const data of [png(10, 10).slice(0, 12), png(0, 10), png(10, 0), afgekapteJpeg]) {
      const fout = await vangFout(bewaarLogo(db, opslag, org, data), BestandFout);
      expect(fout.code).toBe("ONGELDIG_TYPE");
    }
    expect(await db.select().from(bestanden)).toHaveLength(0);
    expect(await haalBedrijf(db, org)).toEqual({ naam: "" });
  });

  test("een SVG geeft ONGELDIG_TYPE en bewaart niets", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    const fout = await vangFout(bewaarLogo(db, maakLokaleOpslag(map), org, svg), BestandFout);
    expect(fout.code).toBe("ONGELDIG_TYPE");
    expect(await db.select().from(bestanden)).toHaveLength(0);
  });

  test("een PDF geeft ONGELDIG_TYPE", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const pdf = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
    const fout = await vangFout(bewaarLogo(db, maakLokaleOpslag(map), org, pdf), BestandFout);
    expect(fout.code).toBe("ONGELDIG_TYPE");
  });

  test("MAX_LOGO_BYTES + 1 geeft TE_GROOT, precies MAX_LOGO_BYTES mag", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const opslag = maakLokaleOpslag(map);
    const groot = new Uint8Array(MAX_LOGO_BYTES + 1);
    groot.set(png(10, 10));
    const fout = await vangFout(bewaarLogo(db, opslag, org, groot), BestandFout);
    expect(fout.code).toBe("TE_GROOT");
    expect(MAX_LOGO_BYTES).toBe(2 * 1024 * 1024);
    const precies = new Uint8Array(MAX_LOGO_BYTES);
    precies.set(png(10, 10));
    const info = await bewaarLogo(db, opslag, org, precies);
    expect(info.grootte).toBe(MAX_LOGO_BYTES);
  });

  test("een mislukte schrijfactie laat geen rij en geen logoBestandId achter", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
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
    await expect(bewaarLogo(db, kapot, org, png(10, 10))).rejects.toThrow("schijf vol");
    expect(await db.select().from(bestanden)).toHaveLength(0);
    expect(await haalBedrijf(db, org)).toEqual({ naam: "" });
  });
});
