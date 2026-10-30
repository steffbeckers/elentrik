import { nieuwProjectDocument, valideerStructuur, type InstallatieDocument } from "@elentrik/model";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { haalBestand } from "../server/bestanden/repo";
import { maakLokaleOpslag, type BestandOpslag } from "../server/bestanden/opslag";
import { bestanden, projecten } from "../server/db/schema";
import {
  bewaarProject,
  dupliceerProject,
  haalProject,
  lijstProjecten,
  maakProject,
  maakProjectUitDocument,
  ProjectFout,
  projectOrganisatie,
  verwijderProject,
} from "../server/projecten/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";

/** Voor tests zonder planbestanden: er wordt niets gelezen of geschreven. */
const GEEN_OPSLAG = maakLokaleOpslag(join(tmpdir(), "elentrik-projecten-zonder-bestanden"));

const invoer = { naam: "Woning Peeters", klantnaam: "Peeters", stroomtype: "3N400V" as const };
const ONBEKEND = "00000000-0000-4000-8000-000000000000";

async function vangFout(belofte: Promise<unknown>): Promise<ProjectFout> {
  try {
    await belofte;
  } catch (fout) {
    expect(fout).toBeInstanceOf(ProjectFout);
    return fout as ProjectFout;
  }
  throw new Error("Er werd geen fout gegooid");
}

describe("projecten-repo", () => {
  test("maken, lijsten en ophalen", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id, versie } = await maakProject(db, org, invoer);
    expect(versie).toBe(1);

    const lijst = await lijstProjecten(db, org);
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatchObject({ id, naam: "Woning Peeters", klantnaam: "Peeters" });
    expect(typeof lijst[0]!.gewijzigd).toBe("string");
    expect(new Date(lijst[0]!.gewijzigd).toISOString()).toBe(lijst[0]!.gewijzigd);

    const project = await haalProject(db, org, id);
    expect(project).not.toBeNull();
    expect(project!.id).toBe(id);
    expect(project!.versie).toBe(1);
    expect(project!.klantnaam).toBe("Peeters");
    expect(project!.document.meta.klant.naam).toBe("Peeters");
    expect(valideerStructuur(project!.document)).toEqual([]);
    expect(project!.document.nodes[project!.document.rootId]!.type).toBe("aansluiting");
  });

  test("de lijst staat gesorteerd op gewijzigd, nieuwste eerst", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const a = await maakProject(db, org, { ...invoer, naam: "A" });
    const b = await maakProject(db, org, { ...invoer, naam: "B" });
    expect((await lijstProjecten(db, org)).map((p) => p.id)).toEqual([b.id, a.id]);

    const huidig = await haalProject(db, org, a.id);
    await bewaarProject(db, org, a.id, 1, { document: huidig!.document });
    expect((await lijstProjecten(db, org)).map((p) => p.id)).toEqual([a.id, b.id]);
  });

  test("haalProject geeft null voor een onbekend id", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    expect(await haalProject(db, org, ONBEKEND)).toBeNull();
  });

  test("bewaren met de juiste versie geeft versie 2, daarna CONFLICT met de huidige versie", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    const document = (await haalProject(db, org, id))!.document;

    expect(await bewaarProject(db, org, id, 1, { document })).toEqual({ versie: 2 });

    const fout = await vangFout(bewaarProject(db, org, id, 1, { document }));
    expect(fout.code).toBe("CONFLICT");
    expect(fout.details).toEqual({ versie: 2 });
    expect((await haalProject(db, org, id))!.versie).toBe(2);
  });

  test("twee gelijktijdige bewaaracties met dezelfde versie: precies één slaagt", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    const document = (await haalProject(db, org, id))!.document;

    const resultaten = await Promise.allSettled([
      bewaarProject(db, org, id, 1, { document }),
      bewaarProject(db, org, id, 1, { document }),
    ]);
    expect(resultaten.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultaten.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await haalProject(db, org, id))!.versie).toBe(2);
  });

  test("bewaren met een naam wijzigt de naam", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    const document = (await haalProject(db, org, id))!.document;
    await bewaarProject(db, org, id, 1, { naam: "Nieuwe naam", document });
    expect((await haalProject(db, org, id))!.naam).toBe("Nieuwe naam");
  });

  test("bewaren van een onbekend project geeft NIET_GEVONDEN", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const document = nieuwProjectDocument({ klantNaam: "X", stroomtype: "2x230V" });
    const fout = await vangFout(bewaarProject(db, org, ONBEKEND, 1, { document }));
    expect(fout.code).toBe("NIET_GEVONDEN");
  });

  test("bewaren van een document met een onbekend node-type geeft ONGELDIG met issues", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    const document = structuredClone((await haalProject(db, org, id))!.document);
    const sleutel = Object.keys(document.nodes).find((k) => k !== document.rootId)!;
    (document.nodes[sleutel] as { type: string }).type = "bestaat-niet";

    const fout = await vangFout(bewaarProject(db, org, id, 1, { document }));
    expect(fout.code).toBe("ONGELDIG");
    expect(fout.details).toHaveProperty("issues");
    expect((await haalProject(db, org, id))!.versie).toBe(1);
  });

  test("bewaren van een document met een cyclus geeft ONGELDIG met een CYCLUS-probleem", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    const document = structuredClone((await haalProject(db, org, id))!.document);
    const bord = Object.values(document.nodes).find((n) => n.type === "verdeelbord")!;
    const differentieel = Object.values(document.nodes).find((n) => n.type === "differentieel")!;
    bord.kinderen.push(differentieel.id);

    const fout = await vangFout(bewaarProject(db, org, id, 1, { document }));
    expect(fout.code).toBe("ONGELDIG");
    const problemen = (fout.details as { problemen: { code: string }[] }).problemen;
    expect(problemen.map((p) => p.code)).toContain("CYCLUS");
  });

  test("de klantnaam wordt overgenomen uit het document", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    const document = structuredClone((await haalProject(db, org, id))!.document);
    document.meta.klant.naam = "Janssens";

    await bewaarProject(db, org, id, 1, { document });
    expect((await haalProject(db, org, id))!.klantnaam).toBe("Janssens");
    expect((await lijstProjecten(db, org))[0]!.klantnaam).toBe("Janssens");
  });

  test("dupliceren geeft een ander document.id en (kopie) in de naam", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    const { id: kopieId } = await dupliceerProject(db, GEEN_OPSLAG, org, id);
    expect(kopieId).not.toBe(id);

    const origineel = (await haalProject(db, org, id))!;
    const kopie = (await haalProject(db, org, kopieId))!;
    expect(kopie.naam).toBe("Woning Peeters (kopie)");
    expect(kopie.versie).toBe(1);
    expect(kopie.document.id).not.toBe(origineel.document.id);
    expect(kopie.klantnaam).toBe(origineel.klantnaam);
    expect(kopie.document.rootId).toBe(origineel.document.rootId);
    expect(origineel.naam).toBe("Woning Peeters");
    expect(await lijstProjecten(db, org)).toHaveLength(2);
  });

  test("dupliceren van een onbekend project geeft NIET_GEVONDEN", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const fout = await vangFout(dupliceerProject(db, GEEN_OPSLAG, org, ONBEKEND));
    expect(fout.code).toBe("NIET_GEVONDEN");
  });

  test("een verwijderd project staat niet meer in de lijst en haalProject geeft null", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    await verwijderProject(db, org, id);

    expect(await lijstProjecten(db, org)).toEqual([]);
    expect(await haalProject(db, org, id)).toBeNull();
  });

  test("bewaren van een verwijderd project geeft NIET_GEVONDEN, ook met de juiste versie", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    const document = (await haalProject(db, org, id))!.document;
    await verwijderProject(db, org, id);

    const fout = await vangFout(bewaarProject(db, org, id, 1, { document }));
    expect(fout.code).toBe("NIET_GEVONDEN");
  });

  test("verwijderen of dupliceren van een verwijderd of onbekend project geeft NIET_GEVONDEN", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    await verwijderProject(db, org, id);
    expect((await vangFout(verwijderProject(db, org, id))).code).toBe("NIET_GEVONDEN");
    expect((await vangFout(dupliceerProject(db, GEEN_OPSLAG, org, id))).code).toBe("NIET_GEVONDEN");
    expect((await vangFout(verwijderProject(db, org, ONBEKEND))).code).toBe("NIET_GEVONDEN");
  });
  test("lijstProjecten toont alleen de projecten van de eigen organisatie", async () => {
    const db = await maakTestDb();
    const a = await maakTestOrganisatie(db, "A");
    const b = await maakTestOrganisatie(db, "B");
    const vanA = await maakProject(db, a, { ...invoer, naam: "Van A" });
    const vanB = await maakProject(db, b, { ...invoer, naam: "Van B" });
    await db.insert(projecten).values({ naam: "Zonder organisatie", document: {} });

    expect((await lijstProjecten(db, a)).map((p) => p.id)).toEqual([vanA.id]);
    expect((await lijstProjecten(db, b)).map((p) => p.id)).toEqual([vanB.id]);
    expect(await projectOrganisatie(db, vanA.id)).toBe(a);
    expect((await haalProject(db, a, vanA.id))!.organisatieId).toBe(a);
  });

  test("een project van een andere organisatie bestaat niet voor haalProject, bewaren, dupliceren of verwijderen", async () => {
    const db = await maakTestDb();
    const a = await maakTestOrganisatie(db, "A");
    const b = await maakTestOrganisatie(db, "B");
    const { id } = await maakProject(db, a, invoer);
    const document = (await haalProject(db, a, id))!.document;

    expect(await haalProject(db, b, id)).toBeNull();
    expect((await vangFout(bewaarProject(db, b, id, 1, { document }))).code).toBe("NIET_GEVONDEN");
    expect((await vangFout(dupliceerProject(db, GEEN_OPSLAG, b, id))).code).toBe("NIET_GEVONDEN");
    expect((await vangFout(verwijderProject(db, b, id))).code).toBe("NIET_GEVONDEN");
    expect((await haalProject(db, a, id))!.versie).toBe(1);
    expect(await lijstProjecten(db, b)).toEqual([]);
  });

  test("dupliceren blijft binnen dezelfde organisatie", async () => {
    const db = await maakTestDb();
    const a = await maakTestOrganisatie(db, "A");
    const b = await maakTestOrganisatie(db, "B");
    const { id } = await maakProject(db, a, invoer);
    const { id: kopieId } = await dupliceerProject(db, GEEN_OPSLAG, a, id);
    expect(await projectOrganisatie(db, kopieId)).toBe(a);
    expect((await lijstProjecten(db, a)).map((p) => p.id).sort()).toEqual([id, kopieId].sort());
    expect(await lijstProjecten(db, b)).toEqual([]);
  });

  test("projectOrganisatie geeft null voor een onbekend, verwijderd of organisatieloos project", async () => {
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    await verwijderProject(db, org, id);
    const [wees] = await db.insert(projecten).values({ naam: "Wees", document: {} }).returning({ id: projecten.id });
    expect(await projectOrganisatie(db, ONBEKEND)).toBeNull();
    expect(await projectOrganisatie(db, id)).toBeNull();
    expect(await projectOrganisatie(db, wees!.id)).toBeNull();
  });
});

describe("dupliceren met planbestanden", () => {
  let map: string | undefined;
  afterEach(async () => {
    if (map) await rm(map, { recursive: true, force: true });
    map = undefined;
  });

  async function opzet() {
    map = await mkdtemp(join(tmpdir(), "elentrik-dupliceer-"));
    const opslag = maakLokaleOpslag(map);
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    // Een pagina met een pdf als origineel en een raster, plus een pagina met een afbeelding
    // waarvan origineel en raster hetzelfde bestand zijn.
    const nieuw = async (soort: "plan-origineel" | "plan-raster", bytes: number[]) => {
      const [rij] = await db
        .insert(bestanden)
        .values({ projectId: id, soort, mime: "application/octet-stream", grootte: bytes.length, sleutel: `${id}/${crypto.randomUUID()}` })
        .returning();
      await opslag.schrijf(rij!.sleutel, new Uint8Array(bytes));
      return rij!;
    };
    const pdf = await nieuw("plan-origineel", [1, 1, 1]);
    const raster = await nieuw("plan-raster", [2, 2]);
    const afbeelding = await nieuw("plan-origineel", [3]);
    const document = (await haalProject(db, org, id))!.document;
    const metPlannen = {
      ...document,
      situatie: {
        ...document.situatie,
        paginas: [
          {
            id: "p1",
            titel: "Gelijkvloers",
            plaatsingen: [],
            achtergrond: { origineelBestandId: pdf.id, rasterBestandId: raster.id, breedte_px: 10, hoogte_px: 10 },
          },
          {
            id: "p2",
            titel: "Verdieping",
            plaatsingen: [],
            achtergrond: { origineelBestandId: afbeelding.id, rasterBestandId: afbeelding.id, breedte_px: 10, hoogte_px: 10 },
          },
        ],
      },
    };
    await bewaarProject(db, org, id, 1, { document: metPlannen });
    return { db, org, id, opslag, bestanden: { pdf, raster, afbeelding } };
  }

  test("de kopie krijgt eigen bestanden en eigen id's in haar document; het bron blijft ongemoeid", async () => {
    const { db, org, id, opslag, bestanden: b } = await opzet();

    const { id: kopieId } = await dupliceerProject(db, opslag, org, id);

    const kopie = (await haalProject(db, org, kopieId))!;
    const [p1, p2] = kopie.document.situatie.paginas;
    const nieuweIds = [
      p1!.achtergrond!.origineelBestandId,
      p1!.achtergrond!.rasterBestandId,
      p2!.achtergrond!.origineelBestandId,
    ];
    expect(new Set(nieuweIds).size).toBe(3);
    for (const oud of [b.pdf.id, b.raster.id, b.afbeelding.id]) expect(nieuweIds).not.toContain(oud);
    // Origineel en raster van de afbeelding blijven hetzelfde bestand.
    expect(p2!.achtergrond!.rasterBestandId).toBe(p2!.achtergrond!.origineelBestandId);

    // Elk nieuw id is een bestand van de kopie, met dezelfde inhoud en een eigen sleutel.
    const verwacht = [[1, 1, 1], [2, 2], [3]];
    for (const [i, nieuwId] of nieuweIds.entries()) {
      const info = await haalBestand(db, nieuwId);
      expect(info?.projectId).toBe(kopieId);
      expect(info?.organisatieId).toBe(org);
      expect(info?.sleutel.startsWith(`${kopieId}/`)).toBe(true);
      const stroom = await opslag.lees(info!.sleutel);
      expect([...new Uint8Array(await new Response(stroom!).arrayBuffer())]).toEqual(verwacht[i]);
    }

    // Het bron wijst nog naar zijn eigen bestanden, die nog bestaan.
    const bron = (await haalProject(db, org, id))!;
    expect(bron.document.situatie.paginas[0]!.achtergrond!.origineelBestandId).toBe(b.pdf.id);
    expect(await opslag.bestaat(b.pdf.sleutel)).toBe(true);
    expect((await haalBestand(db, b.pdf.id))?.projectId).toBe(id);
  });

  test("dupliceren geeft de oude en nieuwe bestandsid's terug", async () => {
    const { db, org, id, opslag, bestanden: b } = await opzet();
    const { id: kopieId, bestandIds } = await dupliceerProject(db, opslag, org, id);
    expect(Object.keys(bestandIds).sort()).toEqual([b.pdf.id, b.raster.id, b.afbeelding.id].sort());
    const kopie = (await haalProject(db, org, kopieId))!;
    const [p1] = kopie.document.situatie.paginas;
    expect(bestandIds[b.pdf.id]).toBe(p1!.achtergrond!.origineelBestandId);
    expect(bestandIds[b.raster.id]).toBe(p1!.achtergrond!.rasterBestandId);
  });

  test("extra bestanden van het bronproject (een plan dat alleen in de editor staat) worden ook gekopieerd", async () => {
    const { db, org, id, opslag } = await opzet();
    const [extra] = await db
      .insert(bestanden)
      .values({ projectId: id, soort: "plan-origineel", mime: "application/pdf", grootte: 2, sleutel: `${id}/${crypto.randomUUID()}` })
      .returning();
    await opslag.schrijf(extra!.sleutel, new Uint8Array([9, 9]));

    const { id: kopieId, bestandIds } = await dupliceerProject(db, opslag, org, id, [extra!.id]);

    const nieuw = await haalBestand(db, bestandIds[extra!.id]!);
    expect(nieuw?.projectId).toBe(kopieId);
    expect(nieuw?.sleutel.startsWith(`${kopieId}/`)).toBe(true);
    expect([...new Uint8Array(await new Response((await opslag.lees(nieuw!.sleutel))!).arrayBuffer())]).toEqual([9, 9]);
  });

  test("een bestand van een andere organisatie, of een onbekend of ongeldig id, wordt stil genegeerd", async () => {
    const { db, org, id, opslag } = await opzet();
    const vreemdeOrg = await maakTestOrganisatie(db, "Vreemd");
    const { id: ander } = await maakProject(db, vreemdeOrg, invoer);
    const [vreemd] = await db
      .insert(bestanden)
      .values({ projectId: ander, soort: "plan-origineel", mime: "application/pdf", grootte: 1, sleutel: `${ander}/${crypto.randomUUID()}` })
      .returning();
    await opslag.schrijf(vreemd!.sleutel, new Uint8Array([7]));
    const voor = (await db.select().from(bestanden)).length;

    const { bestandIds } = await dupliceerProject(db, opslag, org, id, [vreemd!.id, crypto.randomUUID(), "geen-uuid"]);

    expect(Object.keys(bestandIds)).not.toContain(vreemd!.id);
    expect(Object.keys(bestandIds)).toHaveLength(3);
    // Alleen de drie planbestanden van het bron zijn erbij gekomen.
    expect((await db.select().from(bestanden)).length).toBe(voor + 3);
  });

  test("een kopie van vóór de fix (verwijst naar de bestanden van haar bron) krijgt bij het dupliceren eigen bestanden", async () => {
    const { db, org, id: a, opslag, bestanden: b } = await opzet();
    // Een oude kopie B: het document verwijst nog naar de planbestanden van A, B zelf heeft geen rijen.
    const { id: oudeKopie } = await maakProject(db, org, { ...invoer, naam: "B" });
    const documentA = (await haalProject(db, org, a))!.document;
    await bewaarProject(db, org, oudeKopie, 1, { document: documentA });

    const { id: nieuweKopie, bestandIds } = await dupliceerProject(db, opslag, org, oudeKopie);

    // Elk planbestand van A heeft een eigen kopie onder de nieuwe kopie, met dezelfde inhoud.
    expect(Object.keys(bestandIds).sort()).toEqual([b.pdf.id, b.raster.id, b.afbeelding.id].sort());
    const kopie = (await haalProject(db, org, nieuweKopie))!;
    const [p1, p2] = kopie.document.situatie.paginas;
    const nieuweIds = [p1!.achtergrond!.origineelBestandId, p1!.achtergrond!.rasterBestandId, p2!.achtergrond!.origineelBestandId];
    for (const oud of [b.pdf.id, b.raster.id, b.afbeelding.id]) expect(nieuweIds).not.toContain(oud);
    for (const nieuwId of nieuweIds) {
      const info = await haalBestand(db, nieuwId);
      expect(info?.projectId).toBe(nieuweKopie);
      expect(info?.sleutel.startsWith(`${nieuweKopie}/`)).toBe(true);
    }
    // A en haar bestanden blijven ongemoeid.
    expect((await haalBestand(db, b.pdf.id))?.projectId).toBe(a);
  });

  test("mislukt het schrijven van een kopie, dan blijft er geen project, geen rij en geen bestand achter", async () => {
    const { db, org, id, opslag } = await opzet();
    let schrijfbeurten = 0;
    const stuk: BestandOpslag = {
      ...opslag,
      async schrijf(sleutel, data) {
        if (++schrijfbeurten === 2) throw new Error("schijf vol");
        await opslag.schrijf(sleutel, data);
      },
    };
    const voor = {
      projecten: (await db.select().from(projecten)).length,
      bestanden: (await db.select().from(bestanden)).length,
      schijf: (await opslag.lijst()).length,
    };

    await expect(dupliceerProject(db, stuk, org, id)).rejects.toThrow("schijf vol");

    expect((await db.select().from(projecten)).length).toBe(voor.projecten);
    expect((await db.select().from(bestanden)).length).toBe(voor.bestanden);
    expect((await opslag.lijst()).length).toBe(voor.schijf);
  });

  test("een planbestand dat op schijf ontbreekt, laat de verwijzing staan en het dupliceren slagen", async () => {
    const { db, org, id, opslag, bestanden: b } = await opzet();
    await opslag.verwijder(b.raster.sleutel);

    const { id: kopieId } = await dupliceerProject(db, opslag, org, id);

    const kopie = (await haalProject(db, org, kopieId))!;
    const a = kopie.document.situatie.paginas[0]!.achtergrond!;
    expect(a.rasterBestandId).toBe(b.raster.id);
    expect(a.origineelBestandId).not.toBe(b.pdf.id);
  });
});

describe("een nieuw project uit een document (project elders verwijderd)", () => {
  let map: string | undefined;
  afterEach(async () => {
    if (map) await rm(map, { recursive: true, force: true });
    map = undefined;
  });

  async function opzet() {
    map = await mkdtemp(join(tmpdir(), "elentrik-uit-document-"));
    const opslag = maakLokaleOpslag(map);
    const db = await maakTestDb();
    const org = await maakTestOrganisatie(db);
    const { id } = await maakProject(db, org, invoer);
    const nieuw = async (projectId: string, soort: "plan-origineel" | "plan-raster", bytes: number[]) => {
      const [rij] = await db
        .insert(bestanden)
        .values({ projectId, soort, mime: "application/octet-stream", grootte: bytes.length, sleutel: `${projectId}/${crypto.randomUUID()}` })
        .returning();
      await opslag.schrijf(rij!.sleutel, new Uint8Array(bytes));
      return rij!;
    };
    const metPlan = (document: InstallatieDocument, origineel: string, raster: string): InstallatieDocument => ({
      ...document,
      situatie: {
        ...document.situatie,
        paginas: [
          {
            id: "p1",
            titel: "Gelijkvloers",
            plaatsingen: [],
            achtergrond: { origineelBestandId: origineel, rasterBestandId: raster, breedte_px: 10, hoogte_px: 10 },
          },
        ],
      },
    });
    const document = (await haalProject(db, org, id))!.document;
    return { db, org, id, opslag, nieuw, metPlan, document };
  }

  test("de plannen van het verwijderde bronproject in dezelfde organisatie worden gekopieerd, met nieuwe id's", async () => {
    const { db, org, id, opslag, nieuw, metPlan, document } = await opzet();
    const pdf = await nieuw(id, "plan-origineel", [1, 1, 1]);
    const raster = await nieuw(id, "plan-raster", [2, 2]);
    await verwijderProject(db, org, id);

    const antwoord = await maakProjectUitDocument(db, opslag, org, {
      naam: "Terug van weggeweest",
      document: metPlan(document, pdf.id, raster.id),
    });

    expect(antwoord.versie).toBe(1);
    expect(Object.keys(antwoord.bestandIds).sort()).toEqual([pdf.id, raster.id].sort());
    const project = (await haalProject(db, org, antwoord.id))!;
    expect(project.naam).toBe("Terug van weggeweest");
    // Een vers document-id, ook in het antwoord.
    expect(project.document.id).not.toBe(document.id);
    expect(antwoord.documentId).toBe(project.document.id);
    const a = project.document.situatie.paginas[0]!.achtergrond!;
    expect(a.origineelBestandId).toBe(antwoord.bestandIds[pdf.id]);
    expect(a.rasterBestandId).toBe(antwoord.bestandIds[raster.id]);
    // De nieuwe bestanden horen bij het nieuwe project en hebben dezelfde inhoud.
    const verwacht = new Map([
      [a.origineelBestandId, [1, 1, 1]],
      [a.rasterBestandId, [2, 2]],
    ]);
    for (const [nieuwId, bytes] of verwacht) {
      const info = await haalBestand(db, nieuwId);
      expect(info?.projectId).toBe(antwoord.id);
      expect(info?.sleutel.startsWith(`${antwoord.id}/`)).toBe(true);
      expect([...new Uint8Array(await new Response((await opslag.lees(info!.sleutel))!).arrayBuffer())]).toEqual(bytes);
    }
  });

  test("de plannen van een levend project van dezelfde organisatie worden ook gekopieerd", async () => {
    const { db, org, opslag, nieuw, metPlan, document } = await opzet();
    const { id: ander } = await maakProject(db, org, invoer);
    const pdf = await nieuw(ander, "plan-origineel", [4]);
    const raster = await nieuw(ander, "plan-raster", [5]);

    const antwoord = await maakProjectUitDocument(db, opslag, org, { naam: "X", document: metPlan(document, pdf.id, raster.id) });

    expect(Object.keys(antwoord.bestandIds)).toHaveLength(2);
    expect((await haalBestand(db, antwoord.bestandIds[pdf.id]!))?.projectId).toBe(antwoord.id);
  });

  test("bestanden van een andere organisatie, onbekende id's en geen planbestanden worden genegeerd", async () => {
    const { db, org, opslag, nieuw, metPlan, document } = await opzet();
    const vreemdeOrg = await maakTestOrganisatie(db, "Vreemd");
    const { id: vreemdProject } = await maakProject(db, vreemdeOrg, invoer);
    const vreemd = await nieuw(vreemdProject, "plan-origineel", [7]);
    // Een export van het eigen project is geen plan.
    const { id: eigen } = await maakProject(db, org, invoer);
    const [uitvoer] = await db
      .insert(bestanden)
      .values({ projectId: eigen, soort: "export", mime: "application/pdf", grootte: 1, sleutel: `${eigen}/${crypto.randomUUID()}` })
      .returning();
    await opslag.schrijf(uitvoer!.sleutel, new Uint8Array([8]));
    const onbekend = crypto.randomUUID();
    const voor = (await db.select().from(bestanden)).length;

    const invoerDoc = metPlan(document, vreemd.id, onbekend);
    const antwoord = await maakProjectUitDocument(db, opslag, org, { naam: "X", document: invoerDoc });
    const tweede = await maakProjectUitDocument(db, opslag, org, { naam: "Y", document: metPlan(document, uitvoer!.id, "geen-uuid") });

    expect(antwoord.bestandIds).toEqual({});
    expect(tweede.bestandIds).toEqual({});
    expect((await db.select().from(bestanden)).length).toBe(voor);
    // De verwijzingen blijven zoals ze waren.
    const a = (await haalProject(db, org, antwoord.id))!.document.situatie.paginas[0]!.achtergrond!;
    expect(a.origineelBestandId).toBe(vreemd.id);
    expect(a.rasterBestandId).toBe(onbekend);
  });

  test("een ongeldig document is ONGELDIG en maakt niets aan", async () => {
    const { db, org, opslag } = await opzet();
    const voor = (await db.select().from(projecten)).length;
    const fout = await vangFout(maakProjectUitDocument(db, opslag, org, { naam: "X", document: { onzin: true } }));
    expect(fout.code).toBe("ONGELDIG");
    expect((await db.select().from(projecten)).length).toBe(voor);
  });

  test("mislukt het schrijven van een bestand, dan blijft er geen project, geen rij en geen bestand achter", async () => {
    const { db, org, id, opslag, nieuw, metPlan, document } = await opzet();
    const pdf = await nieuw(id, "plan-origineel", [1]);
    const raster = await nieuw(id, "plan-raster", [2]);
    let beurten = 0;
    const stuk: BestandOpslag = {
      ...opslag,
      async schrijf(sleutel, data) {
        if (++beurten === 2) throw new Error("schijf vol");
        await opslag.schrijf(sleutel, data);
      },
    };
    const voor = {
      projecten: (await db.select().from(projecten)).length,
      bestanden: (await db.select().from(bestanden)).length,
      schijf: (await opslag.lijst()).length,
    };

    await expect(
      maakProjectUitDocument(db, stuk, org, { naam: "X", document: metPlan(document, pdf.id, raster.id) }),
    ).rejects.toThrow("schijf vol");

    expect((await db.select().from(projecten)).length).toBe(voor.projecten);
    expect((await db.select().from(bestanden)).length).toBe(voor.bestanden);
    expect((await opslag.lijst()).length).toBe(voor.schijf);
  });
});
