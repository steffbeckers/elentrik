// Planverwijzingen bij het bewaren (plan 12, Task 1): een document kan geen NIEUWE verwijzing naar een
// plan krijgen dat niet van dit project is; een verwijzing die al in het bewaarde document stond, blijft
// aanvaard.
import { nieuwProjectDocument, type InstallatieDocument } from "@elentrik/model";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { maakLokaleOpslag } from "../server/bestanden/opslag";
import type { Db } from "../server/db";
import { bestanden, projecten } from "../server/db/schema";
import { controleerPlanverwijzingen, nieuwePlanIds } from "../server/projecten/planverwijzingen";
import {
  bewaarProject,
  dupliceerProject,
  haalProject,
  maakProject,
  maakProjectUitDocument,
} from "../server/projecten/repo";
import { metProjectFouten } from "../server/utils/projecten";
import { maakTestDb, maakTestOrganisatie } from "./db";

const invoer = { naam: "Woning Peeters", klantnaam: "Peeters", stroomtype: "3N400V" as const };
const ONBEKEND = "00000000-0000-4000-8000-000000000000";

type H3Vorm = { statusCode?: number; data?: { code?: string } };

function basisDocument(): InstallatieDocument {
  return nieuwProjectDocument({ klantNaam: "Peeters", stroomtype: "3N400V" });
}

/** Een document met een pagina per (origineel, raster)-paar. */
function metPaginas(document: InstallatieDocument, paren: [string, string][]): InstallatieDocument {
  return {
    ...document,
    situatie: {
      ...document.situatie,
      paginas: paren.map(([origineelBestandId, rasterBestandId], i) => ({
        id: `p${i + 1}`,
        titel: `Pagina ${i + 1}`,
        plaatsingen: [],
        achtergrond: { origineelBestandId, rasterBestandId, breedte_px: 10, hoogte_px: 10 },
      })),
    },
  };
}

function metKlant(document: InstallatieDocument, naam: string): InstallatieDocument {
  return { ...document, meta: { ...document.meta, klant: { ...document.meta.klant, naam } } };
}

async function vangFout(belofte: Promise<unknown>): Promise<H3Vorm> {
  try {
    await belofte;
  } catch (fout) {
    return fout as H3Vorm;
  }
  throw new Error("Er werd geen fout gegooid");
}

async function documentEnVersie(db: Db, org: string, id: string) {
  const project = (await haalProject(db, org, id))!;
  return { document: project.document, versie: project.versie };
}

describe("nieuwePlanIds", () => {
  const A = randomUUID();
  const B = randomUUID();
  const C = randomUUID();
  const D = randomUUID();

  test("geeft alleen de id's die nieuw zijn, origineel en raster, over alle pagina's, ontdubbeld", () => {
    const bewaard = metPaginas(basisDocument(), [[A, B]]);
    const nieuw = metPaginas(basisDocument(), [
      [A, B],
      [C, D],
      [C, C],
    ]);
    expect(nieuwePlanIds(bewaard, nieuw).sort()).toEqual([C, D].sort());
  });

  test("een nieuw raster bij een bekend origineel telt, en omgekeerd", () => {
    const bewaard = metPaginas(basisDocument(), [[A, B]]);
    expect(nieuwePlanIds(bewaard, metPaginas(basisDocument(), [[A, C]]))).toEqual([C]);
    expect(nieuwePlanIds(bewaard, metPaginas(basisDocument(), [[D, B]]))).toEqual([D]);
  });

  test("niets nieuw, of pagina's zonder achtergrond: leeg", () => {
    const bewaard = metPaginas(basisDocument(), [[A, B]]);
    expect(nieuwePlanIds(bewaard, bewaard)).toEqual([]);
    expect(nieuwePlanIds(bewaard, basisDocument())).toEqual([]);
    expect(nieuwePlanIds(basisDocument(), basisDocument())).toEqual([]);
  });

  test("een bewaard document zonder situatie telt als leeg", () => {
    const nieuw = metPaginas(basisDocument(), [[A, B]]);
    expect(nieuwePlanIds({} as InstallatieDocument, nieuw).sort()).toEqual([A, B].sort());
  });
});

describe("bewaarProject: planverwijzingen", () => {
  let map: string | undefined;
  afterEach(async () => {
    if (map) await rm(map, { recursive: true, force: true });
    map = undefined;
  });

  async function opzet() {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const andereOrg = await maakTestOrganisatie(db, "Ander bedrijf");
    const { id } = await maakProject(db, org, invoer);
    const { id: ander } = await maakProject(db, org, { ...invoer, naam: "Ander project" });
    const { id: vreemd } = await maakProject(db, andereOrg, { ...invoer, naam: "Vreemd project" });

    const bestand = async (projectId: string | null, soort: "plan-origineel" | "plan-raster" | "logo" | "export") => {
      const [rij] = await db
        .insert(bestanden)
        .values({
          projectId,
          organisatieId: soort === "logo" ? org : null,
          soort,
          mime: "application/octet-stream",
          grootte: 1,
          sleutel: `${projectId ?? "logo"}/${randomUUID()}`,
        })
        .returning({ id: bestanden.id, sleutel: bestanden.sleutel });
      return rij!;
    };
    const document = (await haalProject(db, org, id))!.document;
    return { db, org, id, ander, vreemd, bestand, document };
  }

  test("een nieuw plan van dit project wordt bewaard", async () => {
    const { db, org, id, bestand, document } = await opzet();
    const origineel = (await bestand(id, "plan-origineel")).id;
    const raster = (await bestand(id, "plan-raster")).id;

    expect(await bewaarProject(db, org, id, 1, { document: metPaginas(document, [[origineel, raster]]) })).toEqual({
      versie: 2,
    });
    expect((await haalProject(db, org, id))!.document.situatie.paginas[0]!.achtergrond?.origineelBestandId).toBe(
      origineel,
    );
  });

  test.each([
    ["een plan van een ander project van hetzelfde bedrijf", "ander"],
    ["een plan van een project van een ander bedrijf", "vreemd"],
  ] as const)("%s geeft 422 PLANBESTAND_ONBEKEND en laat het project ongemoeid", async (_naam, waar) => {
    const o = await opzet();
    const elders = (await o.bestand(waar === "ander" ? o.ander : o.vreemd, "plan-origineel")).id;
    const eigen = (await o.bestand(o.id, "plan-raster")).id;

    const fout = await vangFout(
      metProjectFouten(() =>
        bewaarProject(o.db, o.org, o.id, 1, { naam: "Nieuwe naam", document: metPaginas(o.document, [[elders, eigen]]) }),
      ),
    );
    expect(fout.statusCode).toBe(422);
    expect(fout.data?.code).toBe("PLANBESTAND_ONBEKEND");

    const na = (await haalProject(o.db, o.org, o.id))!;
    expect(na.versie).toBe(1);
    expect(na.naam).toBe("Woning Peeters");
    expect(na.document).toEqual(o.document);
  });

  test("een logo en een export geven 422 PLANBESTAND_ONBEKEND", async () => {
    const o = await opzet();
    const eigen = (await o.bestand(o.id, "plan-raster")).id;
    const logo = (await o.bestand(null, "logo")).id;
    const uitvoer = (await o.bestand(o.id, "export")).id;
    for (const slecht of [logo, uitvoer]) {
      const fout = await vangFout(
        metProjectFouten(() =>
          bewaarProject(o.db, o.org, o.id, 1, { document: metPaginas(o.document, [[eigen, slecht]]) }),
        ),
      );
      expect(fout.statusCode, slecht).toBe(422);
      expect(fout.data?.code, slecht).toBe("PLANBESTAND_ONBEKEND");
    }
    expect((await haalProject(o.db, o.org, o.id))!.versie).toBe(1);
  });

  test("een nieuw id zonder bestand (een onbekende uuid, een geen-uuid) wijst naar niets en wordt aanvaard", async () => {
    const o = await opzet();
    const eigen = (await o.bestand(o.id, "plan-raster")).id;
    // Ongedaan maken over een bewaring heen herstelt zo'n verwijzing: ze mag nooit een blijvende 422 geven.
    const document = metPaginas(o.document, [
      [ONBEKEND, eigen],
      ["geen-uuid", ONBEKEND],
    ]);
    expect(await bewaarProject(o.db, o.org, o.id, 1, { document })).toEqual({ versie: 2 });
    expect((await haalProject(o.db, o.org, o.id))!.document.situatie.paginas[1]!.achtergrond?.origineelBestandId).toBe(
      "geen-uuid",
    );
  });

  test("een id dat al in het bewaarde document stond, blijft aanvaard, ook als hij naar een ander project of naar niets wijst", async () => {
    const o = await opzet();
    const elders = (await o.bestand(o.vreemd, "plan-origineel")).id;
    // Het bewaarde document verwijst al naar een vreemd plan en naar niets (een oude kopie): rechtstreeks
    // in de tabel gezet, zoals een document van vóór deze controle.
    const met = metPaginas(o.document, [[elders, ONBEKEND]]);
    await o.db.update(projecten).set({ document: met }).where(eq(projecten.id, o.id));

    const gewijzigd = metKlant(met, "Janssens");
    expect(await bewaarProject(o.db, o.org, o.id, 1, { document: gewijzigd })).toEqual({ versie: 2 });

    // Een tweede pagina met een nieuw eigen plan erbij kan ook, de oude verwijzingen blijven.
    const eigen = (await o.bestand(o.id, "plan-origineel")).id;
    const raster = (await o.bestand(o.id, "plan-raster")).id;
    const uitgebreid = metPaginas(gewijzigd, [
      [elders, ONBEKEND],
      [eigen, raster],
    ]);
    expect(await bewaarProject(o.db, o.org, o.id, 2, { document: uitgebreid })).toEqual({ versie: 3 });

    // Maar een nieuwe verwijzing naar het plan van een ander project naast de oude blijft geweigerd.
    const nogVreemd = (await o.bestand(o.vreemd, "plan-raster")).id;
    const fout = await vangFout(
      metProjectFouten(() =>
        bewaarProject(o.db, o.org, o.id, 3, { document: metPaginas(uitgebreid, [[elders, nogVreemd]]) }),
      ),
    );
    expect(fout.data?.code).toBe("PLANBESTAND_ONBEKEND");
  });

  test("een verouderde versie geeft nog steeds PROJECT_GEWIJZIGD, ook met een vreemd plan in het document", async () => {
    const o = await opzet();
    const vreemd = (await o.bestand(o.vreemd, "plan-origineel")).id;
    const fout = await vangFout(
      metProjectFouten(() =>
        bewaarProject(o.db, o.org, o.id, 7, { document: metPaginas(o.document, [[vreemd, vreemd]]) }),
      ),
    );
    expect(fout.statusCode).toBe(409);
    expect(fout.data?.code).toBe("PROJECT_GEWIJZIGD");
  });

  test("na dupliceer en na uit-document lukt de eerste bewaring van het nieuwe project", async () => {
    map = await mkdtemp(join(tmpdir(), "elentrik-planverwijzingen-"));
    const opslag = maakLokaleOpslag(map);
    const o = await opzet();
    const origineel = await o.bestand(o.id, "plan-origineel");
    const raster = await o.bestand(o.id, "plan-raster");
    // De bytes moeten bestaan om gekopieerd te worden.
    for (const rij of [origineel, raster]) await opslag.schrijf(rij.sleutel, new Uint8Array([1, 2, 3]));
    await bewaarProject(o.db, o.org, o.id, 1, { document: metPaginas(o.document, [[origineel.id, raster.id]]) });

    const kopie = await dupliceerProject(o.db, opslag, o.org, o.id);
    const gekopieerd = await documentEnVersie(o.db, o.org, kopie.id);
    expect(gekopieerd.document.situatie.paginas[0]!.achtergrond!.origineelBestandId).not.toBe(origineel.id);
    expect(
      await bewaarProject(o.db, o.org, kopie.id, gekopieerd.versie, { document: metKlant(gekopieerd.document, "Kopie") }),
    ).toEqual({ versie: gekopieerd.versie + 1 });

    const bron = (await haalProject(o.db, o.org, o.id))!.document;
    const uitDocument = await maakProjectUitDocument(o.db, opslag, o.org, { naam: "Uit document", document: bron });
    const nieuw = await documentEnVersie(o.db, o.org, uitDocument.id);
    expect(nieuw.document.situatie.paginas[0]!.achtergrond!.origineelBestandId).not.toBe(origineel.id);
    expect(
      await bewaarProject(o.db, o.org, uitDocument.id, uitDocument.versie, {
        document: metKlant(nieuw.document, "Nog eens"),
      }),
    ).toEqual({ versie: uitDocument.versie + 1 });
  });
});

describe("controleerPlanverwijzingen", () => {
  test("alleen ids zonder bestand, of geen uuid's: aanvaard", async () => {
    const db = await maakTestDb();
    await expect(controleerPlanverwijzingen(db, ONBEKEND, [ONBEKEND, "geen-uuid"])).resolves.toBeUndefined();
  });

  test("geen id's: niets te controleren", async () => {
    const db = await maakTestDb();
    await expect(controleerPlanverwijzingen(db, ONBEKEND, [])).resolves.toBeUndefined();
  });

  test("een dubbel id telt één keer", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    const [rij] = await db
      .insert(bestanden)
      .values({ projectId: id, soort: "plan-raster", mime: "x", grootte: 1, sleutel: `${id}/a` })
      .returning({ id: bestanden.id });
    await expect(controleerPlanverwijzingen(db, id, [rij!.id, rij!.id])).resolves.toBeUndefined();
  });
});
