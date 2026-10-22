import { nieuwProjectDocument, valideerStructuur } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { projecten } from "../server/db/schema";
import {
  bewaarProject,
  dupliceerProject,
  haalProject,
  lijstProjecten,
  maakProject,
  ProjectFout,
  projectOrganisatie,
  verwijderProject,
} from "../server/projecten/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";

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
    const { id: kopieId } = await dupliceerProject(db, org, id);
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
    const fout = await vangFout(dupliceerProject(db, org, ONBEKEND));
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
    expect((await vangFout(dupliceerProject(db, org, id))).code).toBe("NIET_GEVONDEN");
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
    expect((await vangFout(dupliceerProject(db, b, id))).code).toBe("NIET_GEVONDEN");
    expect((await vangFout(verwijderProject(db, b, id))).code).toBe("NIET_GEVONDEN");
    expect((await haalProject(db, a, id))!.versie).toBe(1);
    expect(await lijstProjecten(db, b)).toEqual([]);
  });

  test("dupliceren blijft binnen dezelfde organisatie", async () => {
    const db = await maakTestDb();
    const a = await maakTestOrganisatie(db, "A");
    const b = await maakTestOrganisatie(db, "B");
    const { id } = await maakProject(db, a, invoer);
    const { id: kopieId } = await dupliceerProject(db, a, id);
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
