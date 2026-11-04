import { beforeAll, expect, test } from "vitest";
import type { Db } from "../server/db";
import { user } from "../server/db/schema";
import { zoekAdmin } from "../server/admin/zoeken";
import { maakProject, verwijderProject } from "../server/projecten/repo";
import { maakTestDb, maakTestOrganisatie } from "./db";
let db: Db;
beforeAll(async () => { db = await maakTestDb(); });
test("literal special characters and case-insensitive exact email match", async () => {
  await db.insert(user).values([
    { id: "special", name: "100%_\\klaar", email: "match@test.be" },
    { id: "other", name: "100xYklaar", email: "other@test.be" },
    { id: "name-match", name: "match@test.be", email: "third@test.be" },
  ]);
  expect((await zoekAdmin(db, "%_\\")).gebruikers.items.map((i) => i.id)).toEqual(["special"]);
  expect((await zoekAdmin(db, "MATCH@TEST.BE")).gebruikers.items[0]?.id).toBe("special");
  await expect(zoekAdmin(db, "x")).rejects.toMatchObject({ statusCode: 400 });
  await expect(zoekAdmin(db, "x".repeat(201))).rejects.toMatchObject({ statusCode: 400 });
});
test("search groups cap at five and exact ID can find a retained deleted project", async () => {
  const org = await maakTestOrganisatie(db);
  for (let i = 0; i < 7; i++) await maakProject(db, org, { naam: `Zoekwerk ${i}`, klantnaam: "Klant", stroomtype: "3N400V" });
  const list = await zoekAdmin(db, "Zoekwerk");
  expect(list.projecten.items).toHaveLength(5);
  expect(list.projecten.meer).toBe(true);
  const id = list.projecten.items[0]!.id;
  await verwijderProject(db, org, id);
  expect((await zoekAdmin(db, id)).projecten.items[0]).toMatchObject({ id, verwijderd: true });
  expect((await zoekAdmin(db, "Zoekwerk")).projecten.items.some((p) => p.id === id)).toBe(false);
});
