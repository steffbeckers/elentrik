// De dagelijkse opruimtaak: een verwijderd project en een verweesd planbestand na 30 dagen definitief
// wissen, en oude logo's en bestanden op schijf zonder rij na 7 dagen. De database is PGlite,
// de opslag een lokale opslag in een tijdelijke map (met af en toe een defecte verwijderstap).
// Nooit de echte database en nooit de echte bestandenmap.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { ruimOp } from "../server/bestanden/opruimen";
import { maakLokaleOpslag, type BestandOpslag } from "../server/bestanden/opslag";
import type { Db } from "../server/db";
import { bedrijfsinstellingen, bestanden, exports, organization, projecten, snapshots } from "../server/db/schema";
import { dupliceerProject, haalProject, maakProject as maakRepoProject } from "../server/projecten/repo";
import type { MetLock } from "../server/taken/lock";
import { maakTestDb, maakTestOrganisatie } from "./db";

const DAG_MS = 24 * 3600 * 1000;
const NU = new Date("2026-11-10T04:00:00.000Z");
const geleden = (dagen: number) => new Date(NU.getTime() - dagen * DAG_MS);

const zonderLock: MetLock = async (werk) => {
  await werk();
  return true;
};
const bezetLock: MetLock = async () => false;

let db: Db;
let org: string;
let map: string;
let opslag: BestandOpslag;

beforeAll(async () => {
  db = await maakTestDb();
  org = await maakTestOrganisatie(db, "Geheim Installatiebedrijf");
}, 60_000);

beforeEach(async () => {
  map = await mkdtemp(join(tmpdir(), "elentrik-opruimen-"));
  opslag = maakLokaleOpslag(map);
  await db.delete(exports);
  await db.delete(snapshots);
  await db.delete(bedrijfsinstellingen);
  await db.delete(bestanden);
  await db.delete(projecten);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(map, { recursive: true, force: true });
});

function document(...bestandIds: string[]) {
  return {
    situatie: {
      paginas: bestandIds.map((id, i) => ({
        id: `pagina-${i}`,
        titel: `Verdieping ${i}`,
        plaatsingen: [],
        achtergrond: { origineelBestandId: id, rasterBestandId: id, breedte_px: 100, hoogte_px: 100 },
      })),
    },
  };
}

async function maakProject(opties: { verwijderdDagen?: number; document?: unknown; naam?: string } = {}): Promise<string> {
  const [rij] = await db
    .insert(projecten)
    .values({
      organisatieId: org,
      naam: opties.naam ?? "Woning Peeters",
      document: opties.document ?? document(),
      verwijderd: opties.verwijderdDagen === undefined ? null : geleden(opties.verwijderdDagen),
    })
    .returning({ id: projecten.id });
  return rij!.id;
}

/** Een bestandsrij met zijn bestand op schijf; zowel de rij als het bestand zijn `leeftijdDagen` oud. */
async function maakBestand(opties: {
  projectId: string | null;
  soort: (typeof bestanden.$inferInsert)["soort"];
  leeftijdDagen: number;
}): Promise<{ id: string; sleutel: string }> {
  const id = randomUUID();
  const sleutel = `${opties.projectId ?? `org/${org}`}/${id}`;
  await opslag.schrijf(sleutel, new Uint8Array([1, 2, 3]));
  const tijd = geleden(opties.leeftijdDagen);
  await utimes(join(map, sleutel), tijd, tijd);
  await db.insert(bestanden).values({
    id,
    projectId: opties.projectId,
    organisatieId: opties.soort === "logo" ? org : null,
    soort: opties.soort,
    mime: "image/png",
    grootte: 3,
    sleutel,
    aangemaakt: tijd,
  });
  return { id, sleutel };
}

/** Een bestand op schijf zonder rij. */
async function maakLosBestand(leeftijdDagen: number): Promise<string> {
  const sleutel = `weesmap/${randomUUID()}`;
  await opslag.schrijf(sleutel, new Uint8Array([9]));
  const tijd = geleden(leeftijdDagen);
  await utimes(join(map, sleutel), tijd, tijd);
  return sleutel;
}

/** Een levend project met een gebruikt planbestand: zorgt dat `bestanden` niet leeg is. */
async function omstander(): Promise<{ id: string; sleutel: string }> {
  const projectId = await maakProject({});
  const bestand = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 100 });
  await db.update(projecten).set({ document: document(bestand.id) }).where(eq(projecten.id, projectId));
  return bestand;
}

async function maakExport(projectId: string, bestandId: string): Promise<void> {
  const [snapshot] = await db
    .insert(snapshots)
    .values({ projectId, versie: 1, document: document(), reden: "export" })
    .returning({ id: snapshots.id });
  await db.insert(exports).values({
    projectId,
    snapshotId: snapshot!.id,
    bestandId,
    versieLabel: "V1",
    papier: "A4",
    onderdelen: [],
    aantalFouten: 0,
    aantalWaarschuwingen: 0,
  });
}

const rijBestaat = async (id: string) => (await db.select().from(bestanden).where(eq(bestanden.id, id))).length === 1;
const projectBestaat = async (id: string) => (await db.select().from(projecten).where(eq(projecten.id, id))).length === 1;

const opruimen = (extra: { opslag?: BestandOpslag; metLock?: MetLock } = {}) =>
  ruimOp({ db, opslag: extra.opslag ?? opslag, nu: NU, metLock: extra.metLock ?? zonderLock });

describe("de prullenbak", () => {
  test("een project dat 31 dagen verwijderd is, gaat weg met snapshots, exports, bestandsrijen en bestanden", async () => {
    const projectId = await maakProject({ verwijderdDagen: 31 });
    const plan = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 40 });
    const pdf = await maakBestand({ projectId, soort: "export", leeftijdDagen: 40 });
    await db.insert(snapshots).values({ projectId, versie: 1, document: document(plan.id), reden: "export" });
    await maakExport(projectId, pdf.id);

    const resultaat = await opruimen();

    expect(resultaat.projecten).toBe(1);
    expect(await projectBestaat(projectId)).toBe(false);
    expect(await db.select().from(snapshots)).toEqual([]);
    expect(await db.select().from(exports)).toEqual([]);
    expect(await db.select().from(bestanden)).toEqual([]);
    expect(await opslag.bestaat(plan.sleutel)).toBe(false);
    expect(await opslag.bestaat(pdf.sleutel)).toBe(false);
  });

  test("een project dat 29 dagen verwijderd is, blijft met al zijn bestanden staan", async () => {
    const projectId = await maakProject({ verwijderdDagen: 29 });
    // Zelfs een planbestand waar niets meer naar verwijst blijft: het project kan nog terugkomen.
    const plan = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 40 });
    const pdf = await maakBestand({ projectId, soort: "export", leeftijdDagen: 40 });

    const resultaat = await opruimen();

    expect(resultaat).toEqual({ projecten: 0, planbestanden: 0, logos: 0, losseBestanden: 0, geblokkeerd: 0 });
    expect(await projectBestaat(projectId)).toBe(true);
    expect(await rijBestaat(plan.id)).toBe(true);
    expect(await opslag.bestaat(plan.sleutel)).toBe(true);
    expect(await opslag.bestaat(pdf.sleutel)).toBe(true);
  });

  test("een project dat niet verwijderd is, blijft staan, hoe oud ook", async () => {
    const projectId = await maakProject({});
    await db.update(projecten).set({ aangemaakt: geleden(400) }).where(eq(projecten.id, projectId));
    await opruimen();
    expect(await projectBestaat(projectId)).toBe(true);
  });

  test("een ander project blijft ongemoeid", async () => {
    const weg = await maakProject({ verwijderdDagen: 31 });
    const blijft = await maakProject({});
    const bestand = await maakBestand({ projectId: blijft, soort: "plan-raster", leeftijdDagen: 40 });
    await db.update(projecten).set({ document: document(bestand.id) }).where(eq(projecten.id, blijft));
    await maakBestand({ projectId: weg, soort: "plan-raster", leeftijdDagen: 40 });

    await opruimen();

    expect(await projectBestaat(weg)).toBe(false);
    expect(await projectBestaat(blijft)).toBe(true);
    expect(await opslag.bestaat(bestand.sleutel)).toBe(true);
  });

  test("een project dat niet gewist kan worden, houdt de rest niet tegen", async () => {
    // Het export-bestand van een ander project wijst naar een bestand van het verwijderde project:
    // de verwijdering mislukt (FK) en moet de volgende projecten niet blokkeren.
    const vast = await maakProject({ verwijderdDagen: 40 });
    const vastBestand = await maakBestand({ projectId: vast, soort: "export", leeftijdDagen: 50 });
    const ander = await maakProject({});
    await maakExport(ander, vastBestand.id);
    const weg = await maakProject({ verwijderdDagen: 31 });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultaat = await opruimen();

    expect(resultaat.projecten).toBe(1);
    expect(await projectBestaat(vast)).toBe(true);
    expect(await opslag.bestaat(vastBestand.sleutel)).toBe(true);
    expect(await projectBestaat(weg)).toBe(false);
  });
});

describe("planbestanden", () => {
  test("een planbestand waarnaar het huidige document verwijst, blijft staan, hoe oud ook", async () => {
    const projectId = await maakProject({});
    const origineel = await maakBestand({ projectId, soort: "plan-origineel", leeftijdDagen: 100 });
    const raster = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 100 });
    await db
      .update(projecten)
      .set({
        document: {
          situatie: {
            paginas: [
              {
                id: "p",
                titel: "t",
                plaatsingen: [],
                achtergrond: {
                  origineelBestandId: origineel.id,
                  rasterBestandId: raster.id,
                  breedte_px: 1,
                  hoogte_px: 1,
                },
              },
            ],
          },
        },
      })
      .where(eq(projecten.id, projectId));

    const resultaat = await opruimen();

    expect(resultaat.planbestanden).toBe(0);
    expect(await opslag.bestaat(origineel.sleutel)).toBe(true);
    expect(await opslag.bestaat(raster.sleutel)).toBe(true);
    expect(await rijBestaat(origineel.id)).toBe(true);
    expect(await rijBestaat(raster.id)).toBe(true);
  });

  test("een planbestand waarnaar alleen een snapshot verwijst, blijft staan", async () => {
    const projectId = await maakProject({});
    const plan = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 100 });
    await db.insert(snapshots).values({ projectId, versie: 1, document: document(plan.id), reden: "export" });

    const resultaat = await opruimen();

    expect(resultaat.planbestanden).toBe(0);
    expect(await opslag.bestaat(plan.sleutel)).toBe(true);
    expect(await rijBestaat(plan.id)).toBe(true);
  });

  test("een planbestand waarnaar niets verwijst en dat ouder is dan 30 dagen, wordt gewist", async () => {
    const projectId = await maakProject({});
    const wees = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 31 });

    const resultaat = await opruimen();

    expect(resultaat.planbestanden).toBe(1);
    expect(await rijBestaat(wees.id)).toBe(false);
    expect(await opslag.bestaat(wees.sleutel)).toBe(false);
  });

  test("een planbestand waarnaar niets verwijst maar dat jonger is dan 30 dagen, blijft staan (een lokaal concept kan er nog naar verwijzen)", async () => {
    const projectId = await maakProject({});
    const jong = await maakBestand({ projectId, soort: "plan-origineel", leeftijdDagen: 29 });
    const week = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 8 });

    const resultaat = await opruimen();

    expect(resultaat.planbestanden).toBe(0);
    for (const bestand of [jong, week]) {
      expect(await rijBestaat(bestand.id)).toBe(true);
      expect(await opslag.bestaat(bestand.sleutel)).toBe(true);
    }
  });

  test("het bestand blijft ook staan als alleen een ander project ernaar verwijst", async () => {
    const eigenaar = await maakProject({});
    const ander = await maakProject({});
    const plan = await maakBestand({ projectId: eigenaar, soort: "plan-raster", leeftijdDagen: 50 });
    await db.update(projecten).set({ document: document(plan.id) }).where(eq(projecten.id, ander));

    await opruimen();

    expect(await rijBestaat(plan.id)).toBe(true);
  });

  test("een export-pdf van een levend project blijft staan", async () => {
    const projectId = await maakProject({});
    const pdf = await maakBestand({ projectId, soort: "export", leeftijdDagen: 100 });
    await maakExport(projectId, pdf.id);

    await opruimen();

    expect(await rijBestaat(pdf.id)).toBe(true);
    expect(await opslag.bestaat(pdf.sleutel)).toBe(true);
  });
});

describe("logos", () => {
  test("het huidige logo blijft staan, een oud logo ouder dan 7 dagen wordt gewist", async () => {
    const huidig = await maakBestand({ projectId: null, soort: "logo", leeftijdDagen: 100 });
    const oud = await maakBestand({ projectId: null, soort: "logo", leeftijdDagen: 20 });
    await db
      .insert(bedrijfsinstellingen)
      .values({ organisatieId: org, installateur: { naam: "Bedrijf", logoBestandId: huidig.id } });

    const resultaat = await opruimen();

    expect(resultaat.logos).toBe(1);
    expect(await rijBestaat(huidig.id)).toBe(true);
    expect(await opslag.bestaat(huidig.sleutel)).toBe(true);
    expect(await rijBestaat(oud.id)).toBe(false);
    expect(await opslag.bestaat(oud.sleutel)).toBe(false);
  });

  test("een logo waarnaar organization.logo verwijst, blijft staan", async () => {
    const logo = await maakBestand({ projectId: null, soort: "logo", leeftijdDagen: 100 });
    await db.update(organization).set({ logo: `/api/bestanden/${logo.id}` }).where(eq(organization.id, org));
    try {
      const resultaat = await opruimen();
      expect(resultaat.logos).toBe(0);
      expect(await rijBestaat(logo.id)).toBe(true);
      expect(await opslag.bestaat(logo.sleutel)).toBe(true);
    } finally {
      await db.update(organization).set({ logo: null }).where(eq(organization.id, org));
    }
  });

  test("een oud logo jonger dan 7 dagen blijft staan", async () => {
    const huidig = await maakBestand({ projectId: null, soort: "logo", leeftijdDagen: 100 });
    const vers = await maakBestand({ projectId: null, soort: "logo", leeftijdDagen: 6 });
    await db
      .insert(bedrijfsinstellingen)
      .values({ organisatieId: org, installateur: { naam: "Bedrijf", logoBestandId: huidig.id } });

    const resultaat = await opruimen();

    expect(resultaat.logos).toBe(0);
    expect(await rijBestaat(vers.id)).toBe(true);
    expect(await opslag.bestaat(vers.sleutel)).toBe(true);
  });
});

describe("bestanden op schijf zonder rij", () => {
  test("ouder dan 7 dagen wordt het gewist, jonger blijft het staan", async () => {
    await omstander();
    const oud = await maakLosBestand(8);
    const jong = await maakLosBestand(6);

    const resultaat = await opruimen();

    expect(resultaat.losseBestanden).toBe(1);
    expect(await opslag.bestaat(oud)).toBe(false);
    expect(await opslag.bestaat(jong)).toBe(true);
  });

  test("met een lege bestanden-tabel naast oude bestanden wordt er niets gewist en komt er een waarschuwing met aantallen", async () => {
    const oud = [await maakLosBestand(40), await maakLosBestand(50)];
    const waarschuwingen: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void waarschuwingen.push(args));

    const resultaat = await opruimen();

    expect(resultaat.losseBestanden).toBe(0);
    for (const sleutel of oud) expect(await opslag.bestaat(sleutel)).toBe(true);
    expect(waarschuwingen).toHaveLength(1);
    const log = JSON.stringify(waarschuwingen);
    for (const sleutel of oud) expect(log).not.toContain(sleutel);
    expect(log).toContain('"zonderRij":2');
  });

  test("een run die meer dan de helft van de oude bestanden (en meer dan 10) zou wissen, wist niets", async () => {
    const bekend = [await omstander(), await omstander()];
    const wezen: string[] = [];
    for (let i = 0; i < 11; i++) wezen.push(await maakLosBestand(10 + i));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultaat = await opruimen();

    expect(resultaat.losseBestanden).toBe(0);
    for (const sleutel of wezen) expect(await opslag.bestaat(sleutel)).toBe(true);
    for (const b of bekend) expect(await opslag.bestaat(b.sleutel)).toBe(true);
  });

  test("11 losse bestanden naast 12 bestanden met een rij: wel gewist (niet meer dan de helft)", async () => {
    for (let i = 0; i < 12; i++) await omstander();
    const wezen: string[] = [];
    for (let i = 0; i < 11; i++) wezen.push(await maakLosBestand(10 + i));

    const resultaat = await opruimen();

    expect(resultaat.losseBestanden).toBe(11);
    for (const sleutel of wezen) expect(await opslag.bestaat(sleutel)).toBe(false);
  });

  test("10 losse bestanden naast 1 bestand met een rij: wel gewist (niet meer dan 10)", async () => {
    await omstander();
    for (let i = 0; i < 10; i++) await maakLosBestand(10 + i);

    expect((await opruimen()).losseBestanden).toBe(10);
  });

  test("een bestand met een rij wordt nooit als los bestand gewist", async () => {
    const projectId = await maakProject({});
    const plan = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 100 });
    await db.update(projecten).set({ document: document(plan.id) }).where(eq(projecten.id, projectId));

    const resultaat = await opruimen();

    expect(resultaat.losseBestanden).toBe(0);
    expect(await opslag.bestaat(plan.sleutel)).toBe(true);
  });
});

const mapBestaat = async (naam: string) => {
  try {
    return (await stat(join(map, naam))).isDirectory();
  } catch {
    return false;
  }
};

describe("een onbereikbare opslagmap", () => {
  /** Een kopie van vroeger die het plan van een project in de prullenbak nog gebruikt: de bron is zo `geblokkeerd`. */
  async function geblokkeerdeBron() {
    const bron = await maakProject({ verwijderdDagen: 31 });
    const plan = await maakBestand({ projectId: bron, soort: "plan-raster", leeftijdDagen: 60 });
    await maakProject({ document: document(plan.id), naam: "Kopie" });
    // Ook de rest van de stappen heeft werk: een oud logo, een verweesd plan en een los bestand.
    const logo = await maakBestand({ projectId: null, soort: "logo", leeftijdDagen: 20 });
    const wees = await maakBestand({ projectId: await maakProject({}), soort: "plan-origineel", leeftijdDagen: 40 });
    const los = await maakLosBestand(40);
    return { bron, plan, logo, wees, los };
  }

  async function allesBlijftStaan(g: Awaited<ReturnType<typeof geblokkeerdeBron>>) {
    expect(await projectBestaat(g.bron)).toBe(true);
    for (const b of [g.plan, g.logo, g.wees]) {
      expect(await rijBestaat(b.id)).toBe(true);
      expect(await opslag.bestaat(b.sleutel)).toBe(true);
    }
    expect(await opslag.bestaat(g.los)).toBe(true);
  }

  test("een opslagmap die er niet is (een niet-aangekoppeld volume): de run wist niets en ontgrendelt geen project", async () => {
    const g = await geblokkeerdeBron();
    const weg = maakLokaleOpslag(join(map, "niet-aangekoppeld"));
    const waarschuwingen: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void waarschuwingen.push(args));

    const resultaat = await opruimen({ opslag: weg });

    expect(resultaat).toEqual({
      projecten: 0,
      planbestanden: 0,
      logos: 0,
      losseBestanden: 0,
      geblokkeerd: 0,
      overgeslagen: "opslag-onbereikbaar",
    });
    await allesBlijftStaan(g);
    expect(waarschuwingen).toHaveLength(1);
  });

  test("een lege opslagmap terwijl er bestandsrijen zijn: idem", async () => {
    const g = await geblokkeerdeBron();
    const leegPad = await mkdtemp(join(tmpdir(), "elentrik-leeg-"));
    const waarschuwingen: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void waarschuwingen.push(args));

    try {
      const resultaat = await opruimen({ opslag: maakLokaleOpslag(leegPad) });

      expect(resultaat.overgeslagen).toBe("opslag-onbereikbaar");
      expect(resultaat.projecten + resultaat.planbestanden + resultaat.logos + resultaat.losseBestanden).toBe(0);
      expect(resultaat.geblokkeerd).toBe(0);
      await allesBlijftStaan(g);
      expect(waarschuwingen).toHaveLength(1);
    } finally {
      await rm(leegPad, { recursive: true, force: true });
    }
  });

  test("een opslagmap die zich niet laat lezen: idem", async () => {
    const g = await geblokkeerdeBron();
    const stuk: BestandOpslag = {
      ...opslag,
      async lijst() {
        throw new Error(`EIO: ${map}`);
      },
    };
    const waarschuwingen: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void waarschuwingen.push(args));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultaat = await opruimen({ opslag: stuk });

    expect(resultaat.overgeslagen).toBe("opslag-onbereikbaar");
    await allesBlijftStaan(g);
    expect(JSON.stringify(waarschuwingen)).not.toContain(map);
  });

  test("de waarschuwing bevat alleen aantallen: geen paden, sleutels of id's", async () => {
    const g = await geblokkeerdeBron();
    const meldingen: unknown[][] = [];
    for (const methode of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, methode).mockImplementation((...args: unknown[]) => void meldingen.push(args));
    }
    const pad = join(map, "niet-aangekoppeld");

    await opruimen({ opslag: maakLokaleOpslag(pad) });

    expect(meldingen.filter((m) => String(m[0]).startsWith("Opruimtaak"))).toHaveLength(1);
    const log = JSON.stringify(meldingen);
    for (const verboden of [pad, map, g.plan.sleutel, g.plan.id, g.bron, org, "Kopie"]) {
      expect(log, verboden).not.toContain(verboden);
    }
    expect(log).toMatch(/"rijen":\d+/);
  });

  test("zonder bestandsrijen en met een lege (maar bestaande) opslagmap loopt de run gewoon", async () => {
    const leeg = await maakProject({ verwijderdDagen: 31 });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultaat = await opruimen();

    expect(resultaat).not.toHaveProperty("overgeslagen");
    expect(resultaat.projecten).toBe(1);
    expect(await projectBestaat(leeg)).toBe(false);
  });

  test("een bereikbare opslagmap met bestanden: geen vlag", async () => {
    await omstander();
    const resultaat = await opruimen();
    expect(resultaat).not.toHaveProperty("overgeslagen");
  });
});

describe("lege mappen", () => {
  test("na het wissen van het laatste bestand van een project verdwijnt ook de map van het project", async () => {
    await omstander();
    const projectId = await maakProject({ verwijderdDagen: 31 });
    const plan = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 40 });
    await maakBestand({ projectId, soort: "export", leeftijdDagen: 40 });
    expect(await mapBestaat(projectId)).toBe(true);

    expect((await opruimen()).projecten).toBe(1);

    expect(await opslag.bestaat(plan.sleutel)).toBe(false);
    expect(await mapBestaat(projectId)).toBe(false);
  });

  test("een map waarin nog een bestand staat, blijft staan", async () => {
    await omstander();
    const projectId = await maakProject({ verwijderdDagen: 31 });
    await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 40 });
    // Een vers bestand zonder rij (een upload die nog moet volgen) in dezelfde map.
    const vers = `${projectId}/${randomUUID()}`;
    await opslag.schrijf(vers, new Uint8Array([7]));
    await utimes(join(map, vers), geleden(1), geleden(1));

    expect((await opruimen()).projecten).toBe(1);

    expect(await opslag.bestaat(vers)).toBe(true);
    expect(await mapBestaat(projectId)).toBe(true);
  });

  test("de mappen van andere projecten blijven staan", async () => {
    const blijft = await omstander();
    const projectId = await maakProject({ verwijderdDagen: 31 });
    await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 40 });

    await opruimen();

    expect(await opslag.bestaat(blijft.sleutel)).toBe(true);
    expect(await mapBestaat(blijft.sleutel.split("/")[0]!)).toBe(true);
  });

  test("ook de map van een verweesd planbestand, een oud logo en een los bestand verdwijnt als ze leeg wordt", async () => {
    await omstander();
    const projectId = await maakProject({});
    await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 40 });
    await maakBestand({ projectId: null, soort: "logo", leeftijdDagen: 20 });
    await maakLosBestand(40);

    const resultaat = await opruimen();

    expect(resultaat).toMatchObject({ planbestanden: 1, logos: 1, losseBestanden: 1 });
    expect(await mapBestaat(projectId)).toBe(false);
    expect(await mapBestaat(`org/${org}`)).toBe(false);
    expect(await mapBestaat("weesmap")).toBe(false);
  });

  test("de opslagmap zelf blijft altijd staan", async () => {
    const projectId = await maakProject({ verwijderdDagen: 31 });
    await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 40 });
    await opruimen();
    expect((await stat(map)).isDirectory()).toBe(true);
  });

  test("een map die niet gewist kan worden, houdt de rest niet tegen", async () => {
    await omstander();
    const a = await maakProject({ verwijderdDagen: 31 });
    const b = await maakProject({ verwijderdDagen: 31 });
    await maakBestand({ projectId: a, soort: "plan-raster", leeftijdDagen: 40 });
    await maakBestand({ projectId: b, soort: "plan-raster", leeftijdDagen: 40 });
    const stuk: BestandOpslag = {
      ...opslag,
      async wisLegeMap() {
        throw new Error("EBUSY");
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultaat = await opruimen({ opslag: stuk });

    expect(resultaat.projecten).toBe(2);
  });
});

describe("lock", () => {
  test("met een bezet lock wordt er niets gewist", async () => {
    const weg = await maakProject({ verwijderdDagen: 31 });
    const wees = await maakBestand({ projectId: weg, soort: "plan-raster", leeftijdDagen: 40 });
    const actief = await maakProject({});
    const orphan = await maakBestand({ projectId: actief, soort: "plan-raster", leeftijdDagen: 40 });
    const los = await maakLosBestand(40);

    const resultaat = await opruimen({ metLock: bezetLock });

    expect(resultaat).toEqual({ projecten: 0, planbestanden: 0, logos: 0, losseBestanden: 0, geblokkeerd: 0 });
    expect(await projectBestaat(weg)).toBe(true);
    expect(await opslag.bestaat(wees.sleutel)).toBe(true);
    expect(await rijBestaat(orphan.id)).toBe(true);
    expect(await opslag.bestaat(orphan.sleutel)).toBe(true);
    expect(await opslag.bestaat(los)).toBe(true);
  });
});

describe("volgorde: eerst de rij, dan het bestand", () => {
  function kapotteVerwijdering(): BestandOpslag & { kapot: boolean } {
    const stuk = {
      ...opslag,
      kapot: true,
      async verwijder(sleutel: string) {
        if (stuk.kapot) throw new Error(`schijf kapot: ${sleutel}`);
        await opslag.verwijder(sleutel);
      },
    };
    return stuk;
  }

  test("faalt het wissen op schijf, dan is de rij al weg en wist de volgende run het bestand", async () => {
    await omstander();
    const projectId = await maakProject({});
    const wees = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 40 });
    const stuk = kapotteVerwijdering();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const eerste = await opruimen({ opslag: stuk });

    expect(eerste.planbestanden).toBe(1);
    expect(await rijBestaat(wees.id)).toBe(false);
    expect(await opslag.bestaat(wees.sleutel)).toBe(true);

    stuk.kapot = false;
    const tweede = await opruimen({ opslag: stuk });

    expect(tweede.losseBestanden).toBe(1);
    expect(await opslag.bestaat(wees.sleutel)).toBe(false);
  });

  test("faalt het wissen op schijf bij een project uit de prullenbak, dan is het project al weg en wist de volgende run het bestand", async () => {
    await omstander();
    const projectId = await maakProject({ verwijderdDagen: 31 });
    const plan = await maakBestand({ projectId, soort: "plan-raster", leeftijdDagen: 40 });
    const stuk = kapotteVerwijdering();
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await opruimen({ opslag: stuk })).projecten).toBe(1);
    expect(await projectBestaat(projectId)).toBe(false);
    expect(await opslag.bestaat(plan.sleutel)).toBe(true);

    stuk.kapot = false;
    expect((await opruimen({ opslag: stuk })).losseBestanden).toBe(1);
    expect(await opslag.bestaat(plan.sleutel)).toBe(false);
  });
});

describe("het log", () => {
  test("bevat alleen aantallen: geen sleutels, id's of namen, ook niet bij een fout", async () => {
    const meldingen: unknown[][] = [];
    for (const methode of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, methode).mockImplementation((...args: unknown[]) => void meldingen.push(args));
    }
    const verwijderd = await maakProject({ verwijderdDagen: 31, naam: "Villa Geheimnaam" });
    const a = await maakBestand({ projectId: verwijderd, soort: "plan-raster", leeftijdDagen: 40 });
    const actief = await maakProject({ naam: "Woning Privenaam" });
    const b = await maakBestand({ projectId: actief, soort: "plan-origineel", leeftijdDagen: 40 });
    const los = await maakLosBestand(40);
    await omstander();
    const kapot: BestandOpslag = {
      ...opslag,
      async verwijder(sleutel) {
        throw new Error(`kapot: ${sleutel}`);
      },
    };

    await opruimen({ opslag: kapot });

    expect(meldingen.length).toBeGreaterThan(0);
    const log = JSON.stringify(meldingen);
    for (const verboden of [a.sleutel, a.id, b.sleutel, b.id, los, verwijderd, actief, org, "Geheimnaam", "Privenaam", "Geheim Installatiebedrijf", map]) {
      expect(log, verboden).not.toContain(verboden);
    }
    // Er staat wel een samenvatting met aantallen in.
    expect(log).toContain('"projecten":1');
  });
});

describe("een project in de prullenbak waarvan een ander project bestanden gebruikt", () => {
  test("een kopie van vroeger (verwijst naar het plan van het bron): bron blijft staan en telt als geblokkeerd", async () => {
    const bron = await maakProject({ verwijderdDagen: 31 });
    const plan = await maakBestand({ projectId: bron, soort: "plan-raster", leeftijdDagen: 60 });
    await maakProject({ document: document(plan.id), naam: "Kopie" });

    const resultaat = await opruimen();

    expect(resultaat).toEqual({ projecten: 0, planbestanden: 0, logos: 0, losseBestanden: 0, geblokkeerd: 1 });
    expect(await projectBestaat(bron)).toBe(true);
    expect(await rijBestaat(plan.id)).toBe(true);
    expect(await opslag.bestaat(plan.sleutel)).toBe(true);
  });

  test("een snapshot van een ander project dat ernaar verwijst, blokkeert ook", async () => {
    const bron = await maakProject({ verwijderdDagen: 31 });
    const plan = await maakBestand({ projectId: bron, soort: "plan-raster", leeftijdDagen: 60 });
    const ander = await maakProject({});
    await db.insert(snapshots).values({ projectId: ander, versie: 1, document: document(plan.id), reden: "export" });

    expect((await opruimen()).geblokkeerd).toBe(1);
    expect(await projectBestaat(bron)).toBe(true);
    expect(await rijBestaat(plan.id)).toBe(true);
  });

  test("een verwijzing naar een bestand dat niet meer op schijf staat, blokkeert niet", async () => {
    // Er staat nog een ander bestand op schijf: de opslagmap is dus bereikbaar.
    await omstander();
    const bron = await maakProject({ verwijderdDagen: 31 });
    const plan = await maakBestand({ projectId: bron, soort: "plan-raster", leeftijdDagen: 60 });
    await opslag.verwijder(plan.sleutel);
    await maakProject({ document: document(plan.id), naam: "Kopie" });

    const resultaat = await opruimen();

    expect(resultaat.projecten).toBe(1);
    expect(resultaat.geblokkeerd).toBe(0);
    expect(await projectBestaat(bron)).toBe(false);
    expect(await rijBestaat(plan.id)).toBe(false);
  });

  test("een bestand dat wel op schijf staat blokkeert nog, ook als een ander bestand van het project ontbreekt", async () => {
    const bron = await maakProject({ verwijderdDagen: 31 });
    const weg = await maakBestand({ projectId: bron, soort: "plan-origineel", leeftijdDagen: 60 });
    const staat = await maakBestand({ projectId: bron, soort: "plan-raster", leeftijdDagen: 60 });
    await opslag.verwijder(weg.sleutel);
    await maakProject({ document: document(weg.id, staat.id), naam: "Kopie" });

    const resultaat = await opruimen();

    expect(resultaat).toMatchObject({ projecten: 0, geblokkeerd: 1 });
    expect(await projectBestaat(bron)).toBe(true);
  });

  test("een eigen verwijzing (eigen document of snapshot) blokkeert niet", async () => {
    const bron = await maakProject({ verwijderdDagen: 31 });
    const plan = await maakBestand({ projectId: bron, soort: "plan-raster", leeftijdDagen: 60 });
    await db.update(projecten).set({ document: document(plan.id) }).where(eq(projecten.id, bron));
    await db.insert(snapshots).values({ projectId: bron, versie: 1, document: document(plan.id), reden: "export" });

    const resultaat = await opruimen();

    expect(resultaat.projecten).toBe(1);
    expect(resultaat.geblokkeerd).toBe(0);
    expect(await projectBestaat(bron)).toBe(false);
  });

  test("een gedupliceerd project heeft eigen bestanden: het bron wissen laat de kopie intact", async () => {
    // Een echt, geldig document via de repo; dupliceerProject parst het document van het bron.
    const { id: bron } = await maakRepoProject(db, org, { naam: "Bron", klantnaam: "K", stroomtype: "3N400V" });
    const origineel = await maakBestand({ projectId: bron, soort: "plan-origineel", leeftijdDagen: 60 });
    const raster = await maakBestand({ projectId: bron, soort: "plan-raster", leeftijdDagen: 60 });
    const basis = (await haalProject(db, org, bron))!.document;
    await db
      .update(projecten)
      .set({
        document: {
          ...basis,
          situatie: {
            ...basis.situatie,
            paginas: [
              {
                id: "p",
                titel: "t",
                plaatsingen: [],
                achtergrond: { origineelBestandId: origineel.id, rasterBestandId: raster.id, breedte_px: 1, hoogte_px: 1 },
              },
            ],
          },
        },
      })
      .where(eq(projecten.id, bron));

    const { id: kopie } = await dupliceerProject(db, opslag, org, bron);
    await db.update(projecten).set({ verwijderd: geleden(31) }).where(eq(projecten.id, bron));

    const resultaat = await opruimen();

    expect(resultaat.projecten).toBe(1);
    expect(resultaat.geblokkeerd).toBe(0);
    expect(await projectBestaat(bron)).toBe(false);
    expect(await opslag.bestaat(origineel.sleutel)).toBe(false);
    expect(await projectBestaat(kopie)).toBe(true);
    const eigen = await db.select().from(bestanden).where(eq(bestanden.projectId, kopie));
    expect(eigen).toHaveLength(2);
    for (const rij of eigen) expect(await opslag.bestaat(rij.sleutel)).toBe(true);
  });
});
