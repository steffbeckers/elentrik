import { eq, sql } from "drizzle-orm";
import { beforeAll, expect, test } from "vitest";
import type { Db } from "../server/db";
import { user } from "../server/db/schema";
import { versieToken, voerAdminMutatieUit } from "../server/admin/mutaties";
import { schrijfAdminAudit, lijstAdminAudit } from "../server/admin/audit";
import { maakTestDb } from "./db";

let db: Db;
const actor = { id: "admin", naam: "Support", sessieId: "signed-in-session" };
beforeAll(async () => { db = await maakTestDb(); });

test("canonical version tokens ignore key order but detect value changes", () => {
  expect(versieToken({ b: { z: 1, a: 2 }, a: [3] })).toBe(versieToken({ a: [3], b: { a: 2, z: 1 } }));
  expect(versieToken({ a: 1 })).not.toBe(versieToken({ a: 2 }));
});

test("concurrent retries commit one edit and one audit entry, with the original response", async () => {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: "Oud", email: `${id}@voorbeeld.be` });
  const doel = { type: "gebruiker" as const, id, organisatieId: null, projectId: null };
  const invoer = { mutatieId: crypto.randomUUID(), actie: "gebruiker.naam", doel, payload: { naam: "Nieuw" } };
  let uitgevoerd = 0;
  const run = () => voerAdminMutatieUit(db, actor, invoer, async (tx) => {
    uitgevoerd++;
    await tx.update(user).set({ name: "Nieuw" }).where(eq(user.id, id));
    await schrijfAdminAudit(tx, actor, { doel, actie: invoer.actie, reden: "Spelling", voor: { naam: "Oud" }, na: { naam: "Nieuw" } });
    return { naam: "Nieuw", versie: 2 };
  });
  expect(await Promise.all([run(), run(), run()])).toEqual(Array(3).fill({ naam: "Nieuw", versie: 2 }));
  expect(uitgevoerd).toBe(1);
  const history = await lijstAdminAudit(db, { doelId: id });
  expect(history.totaal).toBe(1);
  expect(history.items[0]).not.toHaveProperty("voor");
  expect(history.items[0]).not.toHaveProperty("sessieId");
  await expect(voerAdminMutatieUit(db, actor, { ...invoer, payload: { naam: "Anders" } }, async () => ({})))
    .rejects.toMatchObject({ statusCode: 409 });
});

test("audit failure rolls back the business row and retry receipt", async () => {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: "Voor", email: `${id}@voorbeeld.be` });
  const invoer = { mutatieId: crypto.randomUUID(), actie: "gebruiker.naam", doel: { type: "gebruiker" as const, id, organisatieId: null, projectId: null }, payload: {} };
  await expect(voerAdminMutatieUit(db, actor, invoer, async (tx) => {
    await tx.update(user).set({ name: "Mag niet blijven" }).where(eq(user.id, id));
    await tx.execute(sql`insert into admin_audit (actor_id) values (null)`);
    return {};
  })).rejects.toThrow();
  expect((await db.select().from(user).where(eq(user.id, id)))[0]!.name).toBe("Voor");
  expect(await voerAdminMutatieUit(db, actor, invoer, async () => ({ hersteld: true }))).toEqual({ hersteld: true });
});
