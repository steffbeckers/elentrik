import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Db } from "../server/db";
import { bestanden, user } from "../server/db/schema";
import { maakLokaleOpslag, zetOpslag, type BestandOpslag } from "../server/bestanden/opslag";
import { adminTestServer } from "./admin-hulp";
import { bewaarAdminBestand, haalAdminBestand } from "../server/admin/bestanden";
import { startCorrectie } from "../server/admin/correcties";
import { lijstAdminAudit } from "../server/admin/audit";
import { maakProject } from "../server/projecten/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";
let db: Db; let opslag: BestandOpslag; let map: string;
const actor = { id: "admin", naam: "Support", sessieId: "session" };
const pdf = new TextEncoder().encode("%PDF-1.7\nadmin test\n%%EOF");
beforeAll(async () => { db = await maakTestDb(); map = await mkdtemp(join(tmpdir(), "admin-files-")); opslag = maakLokaleOpslag(map); });
afterAll(async () => { await rm(map, { recursive: true, force: true }); vi.unstubAllEnvs(); });
test("upload derives company, validates data/quota and replays exactly one file/audit", async () => {
  const org = await maakTestOrganisatie(db);
  const p = await maakProject(db, org, { naam: "Project", klantnaam: "Klant", stroomtype: "3N400V" });
  const c = await startCorrectie(db, actor, p.id, { mutatieId: crypto.randomUUID(), reden: "Plan vervangen" });
  const input = { correctieId: c.id, mutatieId: crypto.randomUUID(), soort: "plan-origineel" as const, data: pdf };
  const save = () => bewaarAdminBestand(db, opslag, actor, p.id, input);
  const [a, b] = await Promise.all([save(), save()]);
  expect(a).toEqual(b);
  expect(await db.select().from(bestanden).where(eq(bestanden.projectId, p.id))).toHaveLength(1);
  expect((await lijstAdminAudit(db, { projectId: p.id, actie: "project.plan-opgeladen" })).totaal).toBe(1);
  expect((await haalAdminBestand(db, a.id)).projectId).toBe(p.id);
  await expect(bewaarAdminBestand(db, opslag, actor, crypto.randomUUID(), input)).rejects.toMatchObject({ statusCode: 403 });
  await expect(bewaarAdminBestand(db, opslag, actor, p.id, { ...input, mutatieId: crypto.randomUUID(), data: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({ statusCode: 415 });
  await expect(bewaarAdminBestand(db, opslag, actor, p.id, { ...input, mutatieId: crypto.randomUUID(), ...{ organisatieId: "forged" } })).rejects.toMatchObject({ statusCode: 400 });
  vi.stubEnv("ELENTRIK_OPSLAG_PER_BEDRIJF_MB", "1");
  try {
    const large = new Uint8Array(1024 * 1024 + 1); large.set(pdf);
    await expect(bewaarAdminBestand(db, opslag, actor, p.id, { ...input, mutatieId: crypto.randomUUID(), data: large })).rejects.toMatchObject({ statusCode: 413 });
    expect(await save()).toEqual(a); // a receipt must not consume quota again
  } finally { vi.unstubAllEnvs(); }
  await expect(haalAdminBestand(db, "../../private-key")).rejects.toMatchObject({ statusCode: 404 });
});
test("a failed upload audit leaves no successful file row and a retry can succeed", async () => {
  const org = await maakTestOrganisatie(db);
  const p = await maakProject(db, org, { naam: "Rollback", klantnaam: "Klant", stroomtype: "3N400V" });
  const c = await startCorrectie(db, actor, p.id, { mutatieId: crypto.randomUUID(), reden: "Plan" });
  const input = { correctieId: c.id, mutatieId: crypto.randomUUID(), soort: "plan-origineel", data: pdf };
  await db.execute(sql`create function reject_file_audit() returns trigger language plpgsql as $$ begin raise exception 'forced'; end $$`);
  await db.execute(sql`create trigger reject_file_audit before insert on admin_audit for each row execute function reject_file_audit()`);
  try { await expect(bewaarAdminBestand(db, opslag, actor, p.id, input)).rejects.toThrow(); }
  finally { await db.execute(sql`drop trigger reject_file_audit on admin_audit`); }
  expect(await db.select().from(bestanden).where(eq(bestanden.projectId, p.id))).toEqual([]);
  await bewaarAdminBestand(db, opslag, actor, p.id, input);
  expect(await db.select().from(bestanden).where(eq(bestanden.projectId, p.id))).toHaveLength(1);
});
test("HTTP uploads bind multipart metadata and stored file reads require current admin identity", async () => {
  const h = await adminTestServer();
  zetOpslag(opslag);
  try {
    const a = await h.gebruiker("files-admin");
    const owner = await h.gebruiker("files-owner", "owner");
    await h.db.update(user).set({ superuser: true }).where(eq(user.id, a.id));
    const org = await maakTestOrganisatie(h.db);
    const p = await maakProject(h.db, org, { naam: "Uploads", klantnaam: "Klant", stroomtype: "3N400V" });
    const c = await (await h.stuur(`/api/admin/projecten/${p.id}/correcties`, a.cookie, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mutatieId: crypto.randomUUID(), reden: "Plan" }) })).json();
    const form = new FormData();
    form.set("bestand", new Blob([pdf]), "plan.pdf"); form.set("soort", "plan-origineel"); form.set("correctieId", c.id); form.set("mutatieId", crypto.randomUUID());
    const request = { method: "POST", body: form, headers: { "x-elentrik-gebruiker": a.id } };
    const upload = await h.stuur(`/api/admin/projecten/${p.id}/bestanden`, a.cookie, request);
    expect(upload.status).toBe(200);
    const info = await upload.json();
    expect(await (await h.stuur(`/api/admin/projecten/${p.id}/bestanden`, a.cookie, request)).json()).toEqual(info);
    const path = `/api/admin/bestanden/${info.id}`;
    expect((await h.stuur(path)).status).toBe(401);
    expect((await h.stuur(path, owner.cookie)).status).toBe(403);
    expect((await h.stuur(`${path}?gebruiker=${owner.id}`, a.cookie)).status).toBe(401);
    const response = await h.stuur(`${path}?gebruiker=${a.id}`, a.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
    form.set("organisatieId", "forged");
    expect((await h.stuur(`/api/admin/projecten/${p.id}/bestanden`, a.cookie, request)).status).toBe(400);
  } finally { await h.stop(); }
});
