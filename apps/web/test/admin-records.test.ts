import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "../server/db";
import { member, user } from "../server/db/schema";
import { leesAdminQuery, lijstAdminGebruikers, lijstAdminOrganisaties, lijstAdminProjecten, haalAdminGebruiker, haalAdminOrganisatie } from "../server/admin/records";
import { maakProject } from "../server/projecten/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";
let db: Db;
beforeAll(async () => { db = await maakTestDb(); });

test("bounded pagination rejects malformed values", () => {
  expect(leesAdminQuery({})).toMatchObject({ pagina: 1, perPagina: 25, zoek: "" });
  for (const q of [{ pagina: 0 }, { perPagina: 101 }, { perPagina: "abc" }, { zoek: ["x"] }]) expect(() => leesAdminQuery(q)).toThrow();
});

test("multiple owners do not multiply counts and large documents stay outside lists", async () => {
  const org = await maakTestOrganisatie(db, "Zelfde naam");
  await maakTestOrganisatie(db, "Zelfde naam");
  for (const id of ["owner-a", "owner-b"]) {
    await db.insert(user).values({ id, name: "An", email: `${id}@test.be`, emailVerified: true });
    await db.insert(member).values({ id, userId: id, organizationId: org, role: "owner", createdAt: new Date() });
  }
  await maakProject(db, org, { naam: "Woning", klantnaam: "Jan", stroomtype: "3N400V" });
  const companies = await lijstAdminOrganisaties(db, { zoek: "Zelfde naam" });
  expect(companies.totaal).toBe(2);
  expect(companies.items.find((i) => i.id === org)).toMatchObject({ leden: 2, projecten: 1 });
  const users = await lijstAdminGebruikers(db, { organisatieId: org });
  expect(users.totaal).toBe(2);
  expect(users.items[0]).not.toHaveProperty("superuser");
  const projects = await lijstAdminProjecten(db, { organisatieId: org });
  expect(projects.totaal).toBe(1);
  expect(projects.items[0]).not.toHaveProperty("document");
  const detail = await haalAdminOrganisatie(db, org);
  expect(detail.verwacht).toMatch(/^[a-f0-9]{64}$/);
  expect(detail.installateur).toEqual({ naam: "" });
  const person = await haalAdminGebruiker(db, "owner-a");
  expect(person.organisaties.items[0]?.id).toBe(org);
  await db.update(user).set({ name: "Anders" }).where(eq(user.id, "owner-a"));
  expect((await haalAdminGebruiker(db, "owner-a")).verwacht).not.toBe(person.verwacht);
});
