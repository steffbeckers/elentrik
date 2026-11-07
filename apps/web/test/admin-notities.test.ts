import { beforeAll, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../server/db";
import { organization, user } from "../server/db/schema";
import { maakNotitie, wijzigNotitie, lijstNotities } from "../server/admin/notities";
import { adminOverzicht } from "../server/admin/overzicht";
import { lijstAdminAudit } from "../server/admin/audit";
import { haalProject, maakProject } from "../server/projecten/repo";
import { haalBedrijf } from "../server/bedrijf/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";
let db: Db;
const actor = { id: "admin-a", naam: "Auteur", sessieId: "s-a" };
const ander = { id: "admin-b", naam: "Bewerker", sessieId: "s-b" };
beforeAll(async () => { db = await maakTestDb(); });
test("plain-text notes validate length, dates and explicit live company/project relationship", async () => {
  const org = await maakTestOrganisatie(db);
  const anderOrg = await maakTestOrganisatie(db);
  const project = await maakProject(db, anderOrg, { naam: "Ander project", klantnaam: "Klant", stroomtype: "3N400V" });
  const input = { mutatieId: crypto.randomUUID(), organisatieId: org, projectId: null, tekst: "  <script>privé</script>  ", opvolgdatum: null };
  for (const extra of [{ tekst: " " }, { tekst: "x".repeat(5001) }, { opvolgdatum: "2027-02-29" }, { organisatieId: "ontbreekt" }, { projectId: project.id }]) {
    await expect(maakNotitie(db, actor, { ...input, ...extra })).rejects.toMatchObject({ statusCode: expect.any(Number) });
  }
  const note = await maakNotitie(db, actor, input);
  expect(note.tekst).toBe("<script>privé</script>");
  expect(await maakNotitie(db, actor, input)).toEqual(note);
  expect((await lijstNotities(db, { organisatieId: org })).totaal).toBe(1);
  expect(await haalBedrijf(db, org)).not.toHaveProperty("notities");
  expect(await haalProject(db, anderOrg, project.id)).not.toHaveProperty("notities");
  await expect(lijstNotities(db, { organisatieId: org, perPagina: 101 })).rejects.toMatchObject({ statusCode: 400 });
});
test("another administrator edits and archives while preserving creator and stale protection", async () => {
  const org = await maakTestOrganisatie(db);
  const note = await maakNotitie(db, actor, { mutatieId: crypto.randomUUID(), organisatieId: org, projectId: null, tekst: "Origineel", opvolgdatum: null });
  const input = { mutatieId: crypto.randomUUID(), reden: "Afgehandeld", verwacht: note.verwacht, gegevens: { tekst: "Opgelost", opvolgdatum: null, gearchiveerd: true } };
  const result = await wijzigNotitie(db, ander, note.id, input);
  expect(result.auteur).toEqual(note.auteur);
  expect(result.gearchiveerd).not.toBeNull();
  expect(await wijzigNotitie(db, ander, note.id, input)).toEqual(result);
  expect((await lijstNotities(db, { organisatieId: org })).items).toEqual([]);
  expect((await lijstNotities(db, { organisatieId: org, gearchiveerd: "true" })).items[0]?.id).toBe(note.id);
  await expect(wijzigNotitie(db, ander, note.id, { ...input, mutatieId: crypto.randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  const audit = await lijstAdminAudit(db, { doelId: note.id });
  expect(audit.totaal).toBe(2);
  expect(audit.items[0]?.actor).toEqual({ id: ander.id, naam: ander.naam });
  await db.delete(organization).where(eq(organization.id, org));
  expect((await lijstNotities(db, { organisatieId: org, gearchiveerd: true })).totaal).toBe(1);
});
test("follow-up enters at Brussels midnight and disappears after date clearing or archive", async () => {
  const org = await maakTestOrganisatie(db);
  const note = await maakNotitie(db, actor, { mutatieId: crypto.randomUUID(), organisatieId: org, projectId: null, tekst: "Terugbellen", opvolgdatum: "2027-03-29" });
  const overview = (date: string) => adminOverzicht(db, { ingeschakeld: false, limieten: { kringen: 5, situatieschemas: 1 } }, new Date(date));
  expect((await overview("2027-03-28T21:59:59Z")).opvolging.items).toEqual([]);
  expect((await overview("2027-03-28T22:00:00Z")).opvolging.items[0]?.id).toBe(note.id);
  const cleared = await wijzigNotitie(db, actor, note.id, { mutatieId: crypto.randomUUID(), reden: "Geen opvolging nodig", verwacht: note.verwacht, gegevens: { tekst: note.tekst, opvolgdatum: null, gearchiveerd: false } });
  expect((await overview("2027-03-28T22:00:00Z")).opvolging.items).toEqual([]);
  await wijzigNotitie(db, actor, note.id, { mutatieId: crypto.randomUUID(), reden: "Afsluiten", verwacht: cleared.verwacht, gegevens: { tekst: note.tekst, opvolgdatum: "2027-03-29", gearchiveerd: true } });
  expect((await overview("2027-03-29T22:00:00Z")).opvolging.items).toEqual([]);
});
test("a failed audit rolls back a new note and its receipt", async () => {
  const org = await maakTestOrganisatie(db);
  await db.execute(sql`create function reject_note_audit() returns trigger language plpgsql as $$ begin raise exception 'forced'; end $$`);
  await db.execute(sql`create trigger reject_note_audit before insert on admin_audit for each row execute function reject_note_audit()`);
  const input = { mutatieId: crypto.randomUUID(), organisatieId: org, projectId: null, tekst: "Voor later", opvolgdatum: null };
  try { await expect(maakNotitie(db, actor, input)).rejects.toThrow(); }
  finally { await db.execute(sql`drop trigger reject_note_audit on admin_audit`); }
  expect((await lijstNotities(db, { organisatieId: org })).totaal).toBe(0);
  await maakNotitie(db, actor, input);
  expect((await lijstNotities(db, { organisatieId: org })).totaal).toBe(1);
});
