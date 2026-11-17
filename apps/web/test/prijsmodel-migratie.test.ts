import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { maakTestDb, maakTestOrganisatie } from "./db";
import type { Db } from "../server/db";
import { organization, projecten } from "../server/db/schema";

let db: Db;
beforeAll(async () => {
  db = await maakTestDb();
});

test("migratie stempelt bestaande projecten", async () => {
  const orgId = await maakTestOrganisatie(db);
  const [p] = await db
    .insert(projecten)
    .values({ organisatieId: orgId, naam: "Bestaand", document: {} })
    .returning();
  // Een project zonder organisatie en een verwijderd project blijven zonder stempel.
  const [zonderOrg] = await db.insert(projecten).values({ naam: "Wees", document: {} }).returning();
  const [verwijderd] = await db
    .insert(projecten)
    .values({ organisatieId: orgId, naam: "Weg", document: {}, verwijderd: new Date() })
    .returning();
  expect(p!.abonnementStempelOp).toBeNull();

  // De handmatige UPDATE uit 0014 zelf, zodat de test de echte zin controleert.
  const bestand = readFileSync(
    join(import.meta.dirname, "..", "server", "db", "migraties", "0014_prijsmodel.sql"),
    "utf8",
  );
  const update = bestand.split("--> statement-breakpoint").map((s) => s.trim()).find((s) => s.startsWith("UPDATE projecten"));
  expect(update).toBeDefined();
  await db.execute(sql.raw(update!));

  const [na] = await db.select().from(projecten).where(eq(projecten.id, p!.id));
  expect(na!.abonnementStempelOp).not.toBeNull();
  const [wees] = await db.select().from(projecten).where(eq(projecten.id, zonderOrg!.id));
  expect(wees!.abonnementStempelOp).toBeNull();
  const [weg] = await db.select().from(projecten).where(eq(projecten.id, verwijderd!.id));
  expect(weg!.abonnementStempelOp).toBeNull();
});

test("vrijgesteld en onderwijs samen faalt", async () => {
  const id = randomUUID();
  await expect(
    db.insert(organization).values({
      id,
      name: "X",
      slug: `x-${id}`,
      createdAt: new Date(),
      vrijgesteld: true,
      onderwijs: true,
    }),
  ).rejects.toThrow();
  const orgId = await maakTestOrganisatie(db);
  await db.update(organization).set({ vrijgesteld: true }).where(eq(organization.id, orgId));
  await expect(
    db.update(organization).set({ onderwijs: true }).where(eq(organization.id, orgId)),
  ).rejects.toThrow();
});

test("nieuwe organisatie heeft proef_einde ongeveer nu", async () => {
  const orgId = await maakTestOrganisatie(db);
  const [o] = await db.select().from(organization).where(eq(organization.id, orgId));
  expect(Math.abs(o!.proefEinde.getTime() - Date.now())).toBeLessThan(60_000);
});
