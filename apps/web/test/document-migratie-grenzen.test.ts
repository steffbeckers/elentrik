import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  nieuwProjectDocument,
  migreer,
  wijzigEigenschappen,
  voegOnderdeelToe,
  SCHEMA_VERSIE,
  type InstallatieDocument,
} from "@elentrik/model";
import { maakTestDb, maakTestOrganisatie } from "./db";
import type { Db } from "../server/db";
import { projecten, snapshots } from "../server/db/schema";
import {
  bewaarProject,
  dupliceerProject,
  haalProject,
  maakProjectUitDocument,
} from "../server/projecten/repo";
import { maakLokaleOpslag } from "../server/bestanden/opslag";
import { tmpdir } from "node:os";
import { join } from "node:path";
let db: Db;
beforeAll(async () => {
  db = await maakTestDb();
});
const opslag = maakLokaleOpslag(join(tmpdir(), "elentrik-legacy-no-files"));
function legacy() {
  const d = nieuwProjectDocument({ klantNaam: "Oud", stroomtype: "2x230V" });
  const bord = Object.values(d.nodes).find((n) => n.type === "verdeelbord")!.id;
  const r = voegOnderdeelToe(
    d,
    { soort: "rail-einde", nodeId: bord },
    "contactdoos",
  );
  const raw = JSON.parse(JSON.stringify(r.doc));
  raw.schemaVersion = 1;
  raw.nodes[r.ids[1]!].plaatsing = "buis";
  return { raw, leiding: r.ids[1]! };
}
async function seed() {
  const org = await maakTestOrganisatie(db);
  const x = legacy();
  const [row] = await db
    .insert(projecten)
    .values({
      organisatieId: org,
      naam: "Oud",
      klantnaam: "Oud",
      document: x.raw,
    })
    .returning();
  return { ...x, org, id: row!.id };
}
test("opening a v1 project migrates a copy and never rewrites stored document or historical snapshot", async () => {
  const x = await seed();
  await db
    .insert(snapshots)
    .values({ projectId: x.id, versie: 1, document: x.raw, reden: "export" });
  const p = await haalProject(db, x.org, x.id);
  expect(p!.document.schemaVersion).toBe(SCHEMA_VERSIE);
  expect(p!.document.nodes[x.leiding]).toHaveProperty("aanleg", {
    inBuis: true,
  });
  const [stored] = await db
    .select()
    .from(projecten)
    .where(eq(projecten.id, x.id));
  const [snapshot] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.projectId, x.id));
  expect(stored!.document).toEqual(x.raw);
  expect(snapshot!.document).toEqual(x.raw);
});
test("saving v1 API input and importing as new use migration before validation", async () => {
  const x = await seed();
  await expect(
    bewaarProject(db, x.org, x.id, 1, { document: x.raw }),
  ).resolves.toEqual({ versie: 2 });
  const imported = await maakProjectUitDocument(db, opslag, x.org, {
    naam: "Import",
    document: x.raw,
  });
  const p = (await haalProject(db, x.org, imported.id))!;
  expect(p.document.schemaVersion).toBe(SCHEMA_VERSIE);
  expect(p.document.nodes[x.leiding]).toHaveProperty("aanleg", {
    inBuis: true,
  });
  const copy = await dupliceerProject(db, opslag, x.org, x.id);
  expect(
    (await haalProject(db, x.org, copy.id))!.document.nodes[x.leiding],
  ).toHaveProperty("aanleg", { inBuis: true });
});
test("duplicate imported references are rejected with node evidence and leave storage untouched", async () => {
  const x = await seed();
  const valid = migreer(x.raw);
  const automaat = Object.values(valid.nodes).find(
    (n) => n.type === "automaat",
  )!;
  const bord = Object.values(valid.nodes).find(
    (n) => n.type === "verdeelbord",
  )!;
  const fixed = wijzigEigenschappen(valid, automaat.id, { kringCode: "J" }).doc;
  const b = voegOnderdeelToe(
    fixed,
    { soort: "rail-einde", nodeId: bord.id },
    "lichtpunt",
  );
  const invalid = JSON.parse(JSON.stringify(b.doc));
  invalid.nodes[b.ids[0]!].kringCode = "J";
  await expect(
    maakProjectUitDocument(db, opslag, x.org, {
      naam: "Ongeldig",
      document: invalid,
    }),
  ).rejects.toMatchObject({
    code: "ONGELDIG",
    details: { reden: "dubbele referentie", code: "J" },
  });
  const [stored] = await db
    .select()
    .from(projecten)
    .where(eq(projecten.id, x.id));
  expect((stored!.document as any).schemaVersion).toBe(1);
});
