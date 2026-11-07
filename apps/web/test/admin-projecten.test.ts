import { beforeAll, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../server/db";
import { adminRevisies, bestanden, organization, projecten, projectaankopen, user } from "../server/db/schema";
import { adminTestServer } from "./admin-hulp";
import { bewaarAdminProject } from "../server/admin/projecten";
import { startCorrectie, rondCorrectieAf } from "../server/admin/correcties";
import { haalAdminProject } from "../server/admin/records";
import { lijstAdminAudit, haalAdminAudit } from "../server/admin/audit";
import { bewaarProject, haalProject, maakProject, verwijderProject } from "../server/projecten/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";
let db: Db;
const actor = { id: "support", naam: "Support", sessieId: "session" };
beforeAll(async () => { db = await maakTestDb(); });
async function fixture() {
  const org = await maakTestOrganisatie(db);
  await db.update(organization).set({ proefEinde: new Date("2000-01-01") }).where(eq(organization.id, org));
  const p = await maakProject(db, org, { naam: "Before", klantnaam: "Client", stroomtype: "3N400V" });
  const project = (await haalProject(db, org, p.id))!;
  const correctie = await startCorrectie(db, actor, p.id, { mutatieId: crypto.randomUUID(), reden: "Support correctie" });
  const document = structuredClone(project.document); document.meta.klant.naam = "Corrected";
  const input = { mutatieId: crypto.randomUUID(), correctieId: correctie.id, naam: "After", document };
  return { org, project, correctie, input };
}
test("retry and concurrent retry increment once and keep immutable before/after revisions", async () => {
  const f = await fixture();
  const save = () => bewaarAdminProject(db, actor, f.project.id, 1, f.input);
  expect(await Promise.all([save(), save()])).toEqual([{ versie: 2 }, { versie: 2 }]);
  expect((await haalProject(db, f.org, f.project.id))?.document.meta.klant.naam).toBe("Corrected");
  const rows = await db.select().from(adminRevisies).where(eq(adminRevisies.projectId, f.project.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ voor: { naam: "Before", versie: 1, document: f.project.document }, na: { naam: "After", versie: 2, document: f.input.document } });
  const audit = await lijstAdminAudit(db, { projectId: f.project.id, actie: "project.bewaard" });
  expect(audit.totaal).toBe(1);
  expect(JSON.stringify(audit)).not.toContain('"document"');
  expect((await haalAdminAudit(db, audit.items[0]!.id)).na).toMatchObject({ versie: 2, revisieId: rows[0]!.id });
  await expect(bewaarAdminProject(db, { ...actor, sessieId: "other-login" }, f.project.id, 1, f.input)).rejects.toMatchObject({ statusCode: 403 });
  await expect(bewaarAdminProject(db, actor, f.project.id, 1, { ...f.input, naam: "Changed retry" })).rejects.toMatchObject({ statusCode: 409 });
});
test("customer version wins and support cannot overwrite, use invalid documents or add foreign plans", async () => {
  const f = await fixture();
  await bewaarProject(db, f.org, f.project.id, 1, { naam: "Customer change", document: f.project.document });
  await expect(bewaarAdminProject(db, actor, f.project.id, 1, f.input)).rejects.toMatchObject({ statusCode: 409 });
  await expect(bewaarAdminProject(db, actor, f.project.id, 2, { ...f.input, document: {} })).rejects.toMatchObject({ statusCode: 422 });
  const document = structuredClone(f.input.document);
  const id = crypto.randomUUID();
  const ander = await maakProject(db, f.org, { naam: "Ander project", klantnaam: "Klant", stroomtype: "3N400V" });
  await db.insert(bestanden).values({ id, projectId: ander.id, soort: "plan-origineel", mime: "application/pdf", grootte: 30, sleutel: `${ander.id}/${id}` });
  document.situatie.paginas = [{ id: "p1", titel: "Plan", plaatsingen: [], achtergrond: { origineelBestandId: id, rasterBestandId: id, breedte_px: 10, hoogte_px: 10 } }];
  await expect(bewaarAdminProject(db, actor, f.project.id, 2, { ...f.input, document })).rejects.toMatchObject({ statusCode: 422, data: { code: "PLANBESTAND_ONBEKEND" } });
  await verwijderProject(db, f.org, f.project.id);
  await expect(bewaarAdminProject(db, actor, f.project.id, 2, f.input)).rejects.toMatchObject({ statusCode: 404 });
});
test("audit failure rolls back document version, revision and receipt", async () => {
  const f = await fixture();
  await db.execute(sql`create function reject_project_audit() returns trigger language plpgsql as $$ begin raise exception 'forced'; end $$`);
  await db.execute(sql`create trigger reject_project_audit before insert on admin_audit for each row execute function reject_project_audit()`);
  try { await expect(bewaarAdminProject(db, actor, f.project.id, 1, f.input)).rejects.toThrow(); }
  finally { await db.execute(sql`drop trigger reject_project_audit on admin_audit`); }
  expect((await haalProject(db, f.org, f.project.id))?.versie).toBe(1);
  expect(await db.select().from(adminRevisies).where(eq(adminRevisies.projectId, f.project.id))).toEqual([]);
  expect(await bewaarAdminProject(db, actor, f.project.id, 1, f.input)).toEqual({ versie: 2 });
});
test("concurrent completion and save serialize; completion prevents every later save", async () => {
  const f = await fixture();
  const outcomes = await Promise.allSettled([bewaarAdminProject(db, actor, f.project.id, 1, f.input), rondCorrectieAf(db, actor, f.correctie.id, crypto.randomUUID())]);
  expect(outcomes[1]!.status).toBe("fulfilled");
  const version = (await haalProject(db, f.org, f.project.id))!.versie;
  expect(version).toBe(outcomes[0]!.status === "fulfilled" ? 2 : 1);
  await expect(bewaarAdminProject(db, actor, f.project.id, version, { ...f.input, mutatieId: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 403 });
});
test("HTTP validates If-Match/body and revocation before reading project, file or retry receipt", async () => {
  const h = await adminTestServer();
  try {
    const a = await h.gebruiker("support-http");
    await h.db.update(user).set({ superuser: true }).where(eq(user.id, a.id));
    const org = await maakTestOrganisatie(h.db);
    const p = await maakProject(h.db, org, { naam: "HTTP", klantnaam: "Klant", stroomtype: "3N400V" });
    const path = `/api/admin/projecten/${p.id}`;
    const headers = { "content-type": "application/json", "x-elentrik-gebruiker": a.id };
    const cResponse = await h.stuur(`${path}/correcties`, a.cookie, { method: "POST", headers, body: JSON.stringify({ mutatieId: crypto.randomUUID(), reden: "Controle" }) });
    expect(cResponse.status).toBe(200);
    const c = await cResponse.json();
    const document = await (await h.stuur(`${path}/document`, a.cookie)).json();
    const body = { mutatieId: crypto.randomUUID(), correctieId: c.id, document: document.document };
    const request = { method: "PUT", headers, body: JSON.stringify(body) };
    expect((await h.stuur(`${path}/document`, a.cookie, request)).status).toBe(428);
    const save = { ...request, headers: { ...headers, "if-match": "1" } };
    expect((await h.stuur(`${path}/document`, a.cookie, { ...save, body: JSON.stringify({ ...body, organisatieId: org }) })).status).toBe(400);
    expect((await h.stuur(`${path}/document`, a.cookie, save)).status).toBe(200);
    expect((await h.stuur(`${path}/exports`, a.cookie)).status).toBe(200);
    await h.db.update(user).set({ superuser: false }).where(eq(user.id, a.id));
    expect((await h.stuur(`${path}/document`, a.cookie, save)).status).toBe(403);
    expect((await h.stuur(`${path}/document`, a.cookie)).status).toBe(403);
    expect((await h.stuur(`/api/admin/bestanden/${crypto.randomUUID()}`, a.cookie)).status).toBe(403);
  } finally { await h.stop(); }
});
test("projectdetails tonen gekocht en stempel", async () => {
  const org = await maakTestOrganisatie(db);
  const p = await maakProject(db, org, { naam: "Gekocht", klantnaam: "Client", stroomtype: "3N400V" });
  const leeg = await haalAdminProject(db, p.id);
  expect(leeg).toMatchObject({ gekochtOp: null, abonnementStempelOp: null, projectaankopen: [] });
  const gekocht = new Date("2026-10-01T10:00:00Z");
  await db.update(projecten).set({ gekochtOp: gekocht, abonnementStempelOp: gekocht }).where(eq(projecten.id, p.id));
  await db.insert(projectaankopen).values({ organisatieId: org, projectId: p.id, checkoutSessie: "cs_oud", status: "vervallen" });
  await db.insert(projectaankopen).values({ organisatieId: org, projectId: p.id, checkoutSessie: "cs_betaald", status: "betaald", betaaldOp: gekocht });
  const detail = await haalAdminProject(db, p.id);
  expect(detail.gekochtOp).toBe(gekocht.toISOString());
  expect(detail.abonnementStempelOp).toBe(gekocht.toISOString());
  expect(detail.projectaankopen.map((a) => a.status).sort()).toEqual(["betaald", "vervallen"]);
  expect(detail.projectaankopen.find((a) => a.status === "betaald")).toMatchObject({ betaaldOp: gekocht.toISOString() });
});
