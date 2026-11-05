import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Db } from "../server/db";
import { adminRevisies, bestanden, projecten, user } from "../server/db/schema";
import { maakLokaleOpslag, type BestandOpslag } from "../server/bestanden/opslag";
import { ruimOp } from "../server/bestanden/opruimen";
import { gebruikteOpslag } from "../server/bestanden/opslagruimte";
import { auditBestandVerwijzingen, haalAdminRevisie } from "../server/admin/revisies";
import { bewaarAdminProject, haalAdminDocument } from "../server/admin/projecten";
import { startCorrectie } from "../server/admin/correcties";
import { haalAdminBestand } from "../server/admin/bestanden";
import { haalProject, maakProject } from "../server/projecten/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";
let db: Db; let opslag: BestandOpslag; let map: string;
const actor = { id: "audit-actor", naam: "Historische auteur", sessieId: "sessie" };
const oud = new Date("2026-01-01");
beforeAll(async () => { db = await maakTestDb(); map = await mkdtemp(join(tmpdir(), "admin-revisions-")); opslag = maakLokaleOpslag(map); });
afterAll(async () => { vi.restoreAllMocks(); await rm(map, { recursive: true, force: true }); });
test("audit revisions preserve old plans after project deletion, count bytes once and remain inspectable", async () => {
  const org = await maakTestOrganisatie(db);
  await db.insert(user).values({ id: actor.id, name: actor.naam, email: "audit@test.be" });
  const p = await maakProject(db, org, { naam: "Bewijs", klantnaam: "Klant", stroomtype: "3N400V" });
  const id = crypto.randomUUID(); const sleutel = `${p.id}/${id}`;
  await opslag.schrijf(sleutel, new Uint8Array([1, 2, 3])); await utimes(join(map, sleutel), oud, oud);
  await db.insert(bestanden).values({ id, projectId: p.id, soort: "plan-origineel", mime: "image/png", grootte: 3, sleutel, aangemaakt: oud });
  const project = (await haalProject(db, org, p.id))!;
  const document = structuredClone(project.document);
  document.situatie.paginas = [{ id: "pagina1", titel: "Plan", plaatsingen: [], achtergrond: { origineelBestandId: id, rasterBestandId: id, breedte_px: 10, hoogte_px: 10 } }];
  // The old plan was in the customer document before support removed it.
  await db.update(projecten).set({ document }).where(eq(projecten.id, p.id));
  const c = await startCorrectie(db, actor, p.id, { mutatieId: crypto.randomUUID(), reden: "Oud plan vervangen" });
  await bewaarAdminProject(db, actor, p.id, 1, { mutatieId: crypto.randomUUID(), correctieId: c.id, document: project.document });
  expect(await gebruikteOpslag(db, org)).toBe(3);
  const [revision] = await db.select().from(adminRevisies).where(eq(adminRevisies.projectId, p.id));
  const verwijzers = await auditBestandVerwijzingen(db);
  expect([...verwijzers.get(id)!].every((r) => r !== p.id)).toBe(true);
  await db.update(projecten).set({ verwijderd: oud }).where(eq(projecten.id, p.id));
  await db.delete(user).where(eq(user.id, actor.id));
  expect(await gebruikteOpslag(db, org)).toBe(3);
  const live = await maakProject(db, org, { naam: "Zonder bewijs", klantnaam: "Klant", stroomtype: "3N400V" });
  const orphan = crypto.randomUUID(); const orphanKey = `${live.id}/${orphan}`;
  await opslag.schrijf(orphanKey, new Uint8Array([4])); await utimes(join(map, orphanKey), oud, oud);
  await db.insert(bestanden).values({ id: orphan, projectId: live.id, soort: "plan-raster", mime: "image/png", grootte: 1, sleutel: orphanKey, aangemaakt: oud });
  const result = await ruimOp({ db, opslag, nu: new Date("2027-01-01"), metLock: async (werk) => { await werk(); return true; } });
  expect(result).toMatchObject({ geblokkeerd: 1, projecten: 0, planbestanden: 1 });
  expect(await opslag.bestaat(sleutel)).toBe(true);
  expect(await opslag.bestaat(orphanKey)).toBe(false);
  expect((await haalAdminRevisie(db, revision!.id)).voor.document).toEqual(document);
  expect((await haalAdminBestand(db, id)).projectVerwijderd).toBe(true);
  await expect(haalAdminDocument(db, p.id)).rejects.toMatchObject({ statusCode: 404 });
  expect(await gebruikteOpslag(db, org)).toBe(3);
});
test("a revision committed after the cleanup reference scan still protects its plan", async () => {
  const org = await maakTestOrganisatie(db);
  const p = await maakProject(db, org, { naam: "Gelijktijdig", klantnaam: "Klant", stroomtype: "3N400V" });
  const id = crypto.randomUUID(); const sleutel = `${p.id}/${id}`;
  await opslag.schrijf(sleutel, new Uint8Array([7])); await utimes(join(map, sleutel), oud, oud);
  await db.insert(bestanden).values({ id, projectId: p.id, soort: "plan-origineel", mime: "image/png", grootte: 1, sleutel, aangemaakt: oud });
  const project = (await haalProject(db, org, p.id))!;
  const document = structuredClone(project.document);
  document.situatie.paginas = [{ id: "p1", titel: "Plan", plaatsingen: [], achtergrond: { origineelBestandId: id, rasterBestandId: id, breedte_px: 10, hoogte_px: 10 } }];
  const c = await startCorrectie(db, actor, p.id, { mutatieId: crypto.randomUUID(), reden: "Plan terugplaatsen" });
  const transaction = db.transaction.bind(db);
  let saved = false;
  const spy = vi.spyOn(db, "transaction").mockImplementation(async (werk, config) => {
    if (!saved) {
      saved = true;
      await bewaarAdminProject(db, actor, p.id, 1, { mutatieId: crypto.randomUUID(), correctieId: c.id, document });
    }
    return transaction(werk, config);
  });
  try {
    await ruimOp({ db, opslag, nu: new Date("2027-01-01"), metLock: async (werk) => { await werk(); return true; } });
    expect(saved).toBe(true);
    expect(await opslag.bestaat(sleutel)).toBe(true);
    expect((await haalAdminBestand(db, id)).projectId).toBe(p.id);
  } finally { spy.mockRestore(); }
});
