import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../server/db";
import { projecten } from "../server/db/schema";
import { startCorrectie, vereisCorrectie, rondCorrectieAf } from "../server/admin/correcties";
import { maakProject, verwijderProject } from "../server/projecten/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";
let db: Db;
const actor = { id: "admin", naam: "Support", sessieId: "sessie" };
beforeAll(async () => { db = await maakTestDb(); });
test("correction is reason-bound and tied to exact actor, sign-in, project and eight-hour expiry", async () => {
  const org = await maakTestOrganisatie(db);
  const project = await maakProject(db, org, { naam: "Project", klantnaam: "Klant", stroomtype: "3N400V" });
  const nu = new Date("2026-11-03T12:00:00Z");
  const input = { mutatieId: crypto.randomUUID(), reden: "  Aansluiting verbeteren  " };
  const correction = await startCorrectie(db, actor, project.id, input, nu);
  expect(correction).toMatchObject({ projectId: project.id, organisatieId: org, reden: "Aansluiting verbeteren", verloopt: "2026-11-03T20:00:00.000Z" });
  expect(await startCorrectie(db, actor, project.id, input, nu)).toEqual(correction);
  expect(await vereisCorrectie(db, actor, correction.id, project.id, new Date("2026-11-03T19:59:59Z"))).toEqual(correction);
  for (const [a, p, now] of [
    [{ ...actor, id: "ander" }, project.id, nu], [{ ...actor, sessieId: "nieuwe-login" }, project.id, nu],
    [actor, crypto.randomUUID(), nu], [actor, project.id, new Date("2026-11-03T20:00:00Z")],
  ] as const) await expect(vereisCorrectie(db, a, correction.id, p, now)).rejects.toMatchObject({ statusCode: 403 });
});
test("completion stops saves and deleted or unassigned projects cannot start a correction", async () => {
  const org = await maakTestOrganisatie(db);
  const p = await maakProject(db, org, { naam: "Project", klantnaam: "Klant", stroomtype: "3N400V" });
  const start = () => startCorrectie(db, actor, p.id, { mutatieId: crypto.randomUUID(), reden: "Correctie" });
  const c = await start();
  const mutatie = crypto.randomUUID();
  const end = await rondCorrectieAf(db, actor, c.id, mutatie);
  expect(end.beeindigd).not.toBeNull();
  expect(await rondCorrectieAf(db, actor, c.id, mutatie)).toEqual(end);
  await expect(vereisCorrectie(db, actor, c.id, p.id)).rejects.toMatchObject({ statusCode: 403 });
  await verwijderProject(db, org, p.id);
  await expect(start()).rejects.toMatchObject({ statusCode: 404 });
  await db.update(projecten).set({ verwijderd: null, organisatieId: null }).where(eq(projecten.id, p.id));
  await expect(start()).rejects.toMatchObject({ statusCode: 404 });
});
