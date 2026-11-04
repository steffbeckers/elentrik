import { eq } from "drizzle-orm";
import { beforeAll, expect, test } from "vitest";
import type { Db } from "../server/db";
import { user } from "../server/db/schema";
import { schrijfAdminAudit, lijstAdminAudit, haalAdminAudit } from "../server/admin/audit";
import { maakTestDb } from "./db";

let db: Db;
beforeAll(async () => { db = await maakTestDb(); });

test("actor and target deletion preserve history and its before/after evidence", async () => {
  const actor = { id: crypto.randomUUID(), naam: "Beheerder", sessieId: "secret-session" };
  await db.insert(user).values({ id: actor.id, name: actor.naam, email: `${actor.id}@voorbeeld.be` });
  const doel = { type: "gebruiker" as const, id: actor.id, organisatieId: null, projectId: null };
  const id = await db.transaction((tx) => schrijfAdminAudit(tx, actor, { doel, actie: "gebruiker.naam", reden: "Correctie", voor: { naam: "Voor" }, na: { naam: "Na" } }));
  await db.delete(user).where(eq(user.id, actor.id));
  const detail = await haalAdminAudit(db, id);
  expect(detail.actor).toEqual({ id: actor.id, naam: "Beheerder" });
  expect(detail.voor).toEqual({ naam: "Voor" });
  expect(detail.na).toEqual({ naam: "Na" });
  expect(JSON.stringify(detail)).not.toContain("secret-session");
  expect((await lijstAdminAudit(db, { actorId: actor.id })).totaal).toBe(1);
  await expect(haalAdminAudit(db, crypto.randomUUID())).rejects.toMatchObject({ statusCode: 404 });
});

test("audit pagination is bounded and filters do not change the total", async () => {
  await expect(lijstAdminAudit(db, { perPagina: 101 })).rejects.toMatchObject({ statusCode: 400 });
  await expect(lijstAdminAudit(db, { pagina: 0 })).rejects.toMatchObject({ statusCode: 400 });
  const list = await lijstAdminAudit(db, { perPagina: 1, pagina: 2 });
  expect(list.items).toEqual([]);
  expect(list.totaal).toBe(1);
});
