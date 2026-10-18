import { nieuwProjectDocument, valideerStructuur } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import {
  bewaarProject,
  dupliceerProject,
  haalProject,
  lijstProjecten,
  maakProject,
  ProjectFout,
  verwijderProject,
} from "../server/projecten/repo";
import { maakTestDb } from "./db";

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
    const { id, versie } = await maakProject(db, invoer);
    expect(versie).toBe(1);

    const lijst = await lijstProjecten(db);
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatchObject({ id, naam: "Woning Peeters", klantnaam: "Peeters" });
    expect(typeof lijst[0]!.gewijzigd).toBe("string");
    expect(new Date(lijst[0]!.gewijzigd).toISOString()).toBe(lijst[0]!.gewijzigd);

    const project = await haalProject(db, id);
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
    const a = await maakProject(db, { ...invoer, naam: "A" });
    const b = await maakProject(db, { ...invoer, naam: "B" });
    expect((await lijstProjecten(db)).map((p) => p.id)).toEqual([b.id, a.id]);

    const huidig = await haalProject(db, a.id);
    await bewaarProject(db, a.id, 1, { document: huidig!.document });
    expect((await lijstProjecten(db)).map((p) => p.id)).toEqual([a.id, b.id]);
  });

  test("haalProject geeft null voor een onbekend id", async () => {
    const db = await maakTestDb();
    expect(await haalProject(db, ONBEKEND)).toBeNull();
  });

  test("bewaren met de juiste versie geeft versie 2, daarna CONFLICT met de huidige versie", async () => {
    const db = await maakTestDb();
    const { id } = await maakProject(db, invoer);
    const document = (await haalProject(db, id))!.document;

    expect(await bewaarProject(db, id, 1, { document })).toEqual({ versie: 2 });

    const fout = await vangFout(bewaarProject(db, id, 1, { document }));
    expect(fout.code).toBe("CONFLICT");
    expect(fout.details).toEqual({ versie: 2 });
    expect((await haalProject(db, id))!.versie).toBe(2);
  });

  test("twee gelijktijdige bewaaracties met dezelfde versie: precies één slaagt", async () => {
    const db = await maakTestDb();
    const { id } = await maakProject(db, invoer);
    const document = (await haalProject(db, id))!.document;

    const resultaten = await Promise.allSettled([
      bewaarProject(db, id, 1, { document }),
      bewaarProject(db, id, 1, { document }),
    ]);
    expect(resultaten.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultaten.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await haalProject(db, id))!.versie).toBe(2);
  });

  test("bewaren met een naam wijzigt de naam", async () => {
    const db = await maakTestDb();
    const { id } = await maakProject(db, invoer);
    const document = (await haalProject(db, id))!.document;
    await bewaarProject(db, id, 1, { naam: "Nieuwe naam", document });
    expect((await haalProject(db, id))!.naam).toBe("Nieuwe naam");
  });

  test("bewaren van een onbekend project geeft NIET_GEVONDEN", async () => {
    const db = await maakTestDb();
    const document = nieuwProjectDocument({ klantNaam: "X", stroomtype: "2x230V" });
    const fout = await vangFout(bewaarProject(db, ONBEKEND, 1, { document }));
    expect(fout.code).toBe("NIET_GEVONDEN");
  });

  test("bewaren van een document met een onbekend node-type geeft ONGELDIG met issues", async () => {
    const db = await maakTestDb();
    const { id } = await maakProject(db, invoer);
    const document = structuredClone((await haalProject(db, id))!.document);
    const sleutel = Object.keys(document.nodes).find((k) => k !== document.rootId)!;
    (document.nodes[sleutel] as { type: string }).type = "bestaat-niet";

    const fout = await vangFout(bewaarProject(db, id, 1, { document }));
    expect(fout.code).toBe("ONGELDIG");
    expect(fout.details).toHaveProperty("issues");
    expect((await haalProject(db, id))!.versie).toBe(1);
  });

  test("bewaren van een document met een cyclus geeft ONGELDIG met een CYCLUS-probleem", async () => {
    const db = await maakTestDb();
    const { id } = await maakProject(db, invoer);
    const document = structuredClone((await haalProject(db, id))!.document);
    const bord = Object.values(document.nodes).find((n) => n.type === "verdeelbord")!;
    const differentieel = Object.values(document.nodes).find((n) => n.type === "differentieel")!;
    bord.kinderen.push(differentieel.id);

    const fout = await vangFout(bewaarProject(db, id, 1, { document }));
    expect(fout.code).toBe("ONGELDIG");
    const problemen = (fout.details as { problemen: { code: string }[] }).problemen;
    expect(problemen.map((p) => p.code)).toContain("CYCLUS");
  });

  test("de klantnaam wordt overgenomen uit het document", async () => {
    const db = await maakTestDb();
    const { id } = await maakProject(db, invoer);
    const document = structuredClone((await haalProject(db, id))!.document);
    document.meta.klant.naam = "Janssens";

    await bewaarProject(db, id, 1, { document });
    expect((await haalProject(db, id))!.klantnaam).toBe("Janssens");
    expect((await lijstProjecten(db))[0]!.klantnaam).toBe("Janssens");
  });

  test("dupliceren geeft een ander document.id en (kopie) in de naam", async () => {
    const db = await maakTestDb();
    const { id } = await maakProject(db, invoer);
    const { id: kopieId } = await dupliceerProject(db, id);
    expect(kopieId).not.toBe(id);

    const origineel = (await haalProject(db, id))!;
    const kopie = (await haalProject(db, kopieId))!;
    expect(kopie.naam).toBe("Woning Peeters (kopie)");
    expect(kopie.versie).toBe(1);
    expect(kopie.document.id).not.toBe(origineel.document.id);
    expect(kopie.klantnaam).toBe(origineel.klantnaam);
    expect(kopie.document.rootId).toBe(origineel.document.rootId);
    expect(origineel.naam).toBe("Woning Peeters");
    expect(await lijstProjecten(db)).toHaveLength(2);
  });

  test("dupliceren van een onbekend project geeft NIET_GEVONDEN", async () => {
    const db = await maakTestDb();
    const fout = await vangFout(dupliceerProject(db, ONBEKEND));
    expect(fout.code).toBe("NIET_GEVONDEN");
  });

  test("een verwijderd project staat niet meer in de lijst en haalProject geeft null", async () => {
    const db = await maakTestDb();
    const { id } = await maakProject(db, invoer);
    await verwijderProject(db, id);

    expect(await lijstProjecten(db)).toEqual([]);
    expect(await haalProject(db, id)).toBeNull();
  });

  test("bewaren van een verwijderd project geeft NIET_GEVONDEN, ook met de juiste versie", async () => {
    const db = await maakTestDb();
    const { id } = await maakProject(db, invoer);
    const document = (await haalProject(db, id))!.document;
    await verwijderProject(db, id);

    const fout = await vangFout(bewaarProject(db, id, 1, { document }));
    expect(fout.code).toBe("NIET_GEVONDEN");
  });

  test("verwijderen of dupliceren van een verwijderd of onbekend project geeft NIET_GEVONDEN", async () => {
    const db = await maakTestDb();
    const { id } = await maakProject(db, invoer);
    await verwijderProject(db, id);
    expect((await vangFout(verwijderProject(db, id))).code).toBe("NIET_GEVONDEN");
    expect((await vangFout(dupliceerProject(db, id))).code).toBe("NIET_GEVONDEN");
    expect((await vangFout(verwijderProject(db, ONBEKEND))).code).toBe("NIET_GEVONDEN");
  });
});
