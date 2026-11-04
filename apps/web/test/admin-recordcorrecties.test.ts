import { beforeAll, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../server/db";
import { bedrijfsinstellingen, user } from "../server/db/schema";
import { corrigeerGebruiker, corrigeerOrganisatie } from "../server/admin/gebruikers";
import { haalAdminGebruiker, haalAdminOrganisatie } from "../server/admin/records";
import { haalAdminAudit, lijstAdminAudit } from "../server/admin/audit";
import { maakTestDb, maakTestOrganisatie } from "./db";
let db: Db;
const actor = { id: "support", naam: "Support", sessieId: "sessie" };
beforeAll(async () => { db = await maakTestDb(); });
test("name correction is strict, versioned, replayable and records actual before/after", async () => {
  await db.insert(user).values({ id: actor.id, name: "Voor", email: "support@test.be", emailVerified: true });
  const origineel = await haalAdminGebruiker(db, actor.id);
  const body = { mutatieId: crypto.randomUUID(), reden: "Spelling verbeteren", verwacht: origineel.verwacht, gegevens: { naam: "Na" } };
  for (const gegevens of [{ naam: "" }, { naam: "Na", email: "anders@test.be" }, { naam: "Na", superuser: true }]) {
    await expect(corrigeerGebruiker(db, actor, actor.id, { ...body, gegevens })).rejects.toMatchObject({ statusCode: 400 });
  }
  const gewijzigd = await corrigeerGebruiker(db, actor, actor.id, body);
  expect(gewijzigd.naam).toBe("Na");
  expect(await corrigeerGebruiker(db, actor, actor.id, body)).toEqual(gewijzigd);
  await expect(corrigeerGebruiker(db, actor, actor.id, { ...body, mutatieId: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  await corrigeerGebruiker(db, actor, actor.id, { ...body, mutatieId: crypto.randomUUID(), verwacht: gewijzigd.verwacht });
  const audit = await lijstAdminAudit(db, { doelId: actor.id });
  expect(audit.totaal).toBe(1); // unchanged state is not a correction
  expect(await haalAdminAudit(db, audit.items[0]!.id)).toMatchObject({ voor: { naam: "Voor" }, na: { naam: "Na" }, reden: body.reden });
});
test("company correction preserves stored logo and conflicts after a customer update", async () => {
  const id = await maakTestOrganisatie(db, "Voor");
  const logo = crypto.randomUUID();
  await db.insert(bedrijfsinstellingen).values({ organisatieId: id, installateur: { naam: "Installateur", logoBestandId: logo } });
  const before = await haalAdminOrganisatie(db, id);
  const body = { mutatieId: crypto.randomUUID(), reden: "Bedrijfsgegevens nakijken", verwacht: before.verwacht,
    gegevens: { naam: "Na", installateur: { naam: "Nieuwe installateur", logoBestandId: crypto.randomUUID() } } };
  const result = await corrigeerOrganisatie(db, actor, id, body);
  expect(result.installateur).toEqual({ naam: "Nieuwe installateur", logoBestandId: logo });
  expect(result.naam).toBe("Na");
  await db.update(bedrijfsinstellingen).set({ installateur: { naam: "Klantupdate", logoBestandId: logo } }).where(eq(bedrijfsinstellingen.organisatieId, id));
  await expect(corrigeerOrganisatie(db, actor, id, { ...body, mutatieId: crypto.randomUUID(), verwacht: result.verwacht })).rejects.toMatchObject({ statusCode: 409 });
  expect((await haalAdminOrganisatie(db, id)).installateur.naam).toBe("Klantupdate");
});
test("audit insertion failure rolls back the actual profile correction", async () => {
  const id = "rollback";
  await db.insert(user).values({ id, name: "Before", email: "rollback@test.be" });
  await db.execute(sql`create function reject_admin_audit() returns trigger language plpgsql as $$ begin raise exception 'forced audit failure'; end $$`);
  await db.execute(sql`create trigger reject_admin_audit before insert on admin_audit for each row execute function reject_admin_audit()`);
  try {
    await expect(corrigeerGebruiker(db, actor, id, { mutatieId: crypto.randomUUID(), reden: "Test", verwacht: (await haalAdminGebruiker(db, id)).verwacht, gegevens: { naam: "After" } })).rejects.toThrow();
    expect((await haalAdminGebruiker(db, id)).naam).toBe("Before");
  } finally { await db.execute(sql`drop trigger reject_admin_audit on admin_audit`); }
});
