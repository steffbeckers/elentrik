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
import { maakTestDb } from "./db";

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
    expect(await haalBedrijf(db)).toEqual({ naam: "" });
  });

  test("bewaar en dan haal geeft dezelfde waarde", async () => {
    const db = await maakTestDb();
    const bewaard = await bewaarBedrijf(db, VOLLEDIG);
    expect(bewaard).toEqual(VOLLEDIG);
    expect(await haalBedrijf(db)).toEqual(VOLLEDIG);
  });

  test("een tweede bewaar vervangt de waarde en houdt één rij met id 1", async () => {
    const db = await maakTestDb();
    await bewaarBedrijf(db, VOLLEDIG);
    await bewaarBedrijf(db, { naam: "Nieuw" });
    expect(await haalBedrijf(db)).toEqual({ naam: "Nieuw" });
    const rijen = await db.select().from(bedrijfsinstellingen);
    expect(rijen.map((rij) => rij.id)).toEqual([1]);
  });

  test("een ongeldig adres wordt geweigerd en bewaart niets", async () => {
    const db = await maakTestDb();
    const fout = await vangFout(
      bewaarBedrijf(db, { naam: "X", adres: { straat: "Kerkstraat" } } as unknown as Partij),
      BedrijfFout,
    );
    expect(fout.code).toBe("ONGELDIG");
    expect(await haalBedrijf(db)).toEqual({ naam: "" });
  });

  test("onbekende velden worden geweigerd", async () => {
    const db = await maakTestDb();
    const fout = await vangFout(
      bewaarBedrijf(db, { naam: "X", website: "x" } as unknown as Partij),
      BedrijfFout,
    );
    expect(fout.code).toBe("ONGELDIG");
  });
});

describe("bewaarLogo", () => {
  test("een PNG wordt bewaard onder bedrijf/<id> zonder project, en logoBestandId is gezet", async () => {
    const db = await maakTestDb();
    const opslag = maakLokaleOpslag(map);
    const data = png(40, 20);
    const info = await bewaarLogo(db, opslag, data);
    expect(info).toEqual({
      id: expect.any(String),
      mime: "image/png",
      grootte: data.length,
      breedte_px: 40,
      hoogte_px: 20,
    });
    expect(new Uint8Array(await readFile(join(map, "bedrijf", info.id)))).toEqual(data);
    const [rij] = await db.select().from(bestanden).where(eq(bestanden.id, info.id));
    expect(rij).toMatchObject({
      projectId: null,
      soort: "logo",
      mime: "image/png",
      sleutel: `bedrijf/${info.id}`,
    });
    expect(await haalBedrijf(db)).toEqual({ naam: "", logoBestandId: info.id });
  });

  test("een JPEG is toegelaten", async () => {
    const db = await maakTestDb();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);
    const info = await bewaarLogo(db, maakLokaleOpslag(map), jpeg);
    expect(info.mime).toBe("image/jpeg");
  });

  test("het logo overleeft een nieuwe bewaarBedrijf, ook als die logoBestandId meestuurt", async () => {
    const db = await maakTestDb();
    const info = await bewaarLogo(db, maakLokaleOpslag(map), png(10, 10));
    const bewaard = await bewaarBedrijf(db, { ...VOLLEDIG, logoBestandId: "ander-id" });
    expect(bewaard).toEqual({ ...VOLLEDIG, logoBestandId: info.id });
    expect(await haalBedrijf(db)).toEqual({ ...VOLLEDIG, logoBestandId: info.id });
  });

  test("een logo bewaren behoudt de overige bedrijfsgegevens", async () => {
    const db = await maakTestDb();
    await bewaarBedrijf(db, VOLLEDIG);
    const info = await bewaarLogo(db, maakLokaleOpslag(map), png(10, 10));
    expect(await haalBedrijf(db)).toEqual({ ...VOLLEDIG, logoBestandId: info.id });
  });

  test("een SVG geeft ONGELDIG_TYPE en bewaart niets", async () => {
    const db = await maakTestDb();
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    const fout = await vangFout(bewaarLogo(db, maakLokaleOpslag(map), svg), BestandFout);
    expect(fout.code).toBe("ONGELDIG_TYPE");
    expect(await db.select().from(bestanden)).toHaveLength(0);
  });

  test("een PDF geeft ONGELDIG_TYPE", async () => {
    const db = await maakTestDb();
    const pdf = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
    const fout = await vangFout(bewaarLogo(db, maakLokaleOpslag(map), pdf), BestandFout);
    expect(fout.code).toBe("ONGELDIG_TYPE");
  });

  test("MAX_LOGO_BYTES + 1 geeft TE_GROOT, precies MAX_LOGO_BYTES mag", async () => {
    const db = await maakTestDb();
    const opslag = maakLokaleOpslag(map);
    const groot = new Uint8Array(MAX_LOGO_BYTES + 1);
    groot.set(png(10, 10));
    const fout = await vangFout(bewaarLogo(db, opslag, groot), BestandFout);
    expect(fout.code).toBe("TE_GROOT");
    expect(MAX_LOGO_BYTES).toBe(2 * 1024 * 1024);
    const precies = new Uint8Array(MAX_LOGO_BYTES);
    precies.set(png(10, 10));
    const info = await bewaarLogo(db, opslag, precies);
    expect(info.grootte).toBe(MAX_LOGO_BYTES);
  });

  test("een mislukte schrijfactie laat geen rij en geen logoBestandId achter", async () => {
    const db = await maakTestDb();
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
    };
    await expect(bewaarLogo(db, kapot, png(10, 10))).rejects.toThrow("schijf vol");
    expect(await db.select().from(bestanden)).toHaveLength(0);
    expect(await haalBedrijf(db)).toEqual({ naam: "" });
  });
});
