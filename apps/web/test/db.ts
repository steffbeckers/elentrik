// PGlite-hulp voor tests: een Postgres in het geheugen met de migraties uit
// server/db/migraties. Expliciete imports, geen Nuxt-auto-imports (ruling E1).
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "../server/db";
import * as schema from "../server/db/schema";

const migratiesMap = join(import.meta.dirname, "..", "server", "db", "migraties");

export async function maakTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: migratiesMap });
  return db;
}

/** Een organisatie zonder leden, rechtstreeks in de tabel: genoeg voor de repo-tests. */
export async function maakTestOrganisatie(db: Db, naam = "Testbedrijf"): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.organization).values({ id, name: naam, slug: `test-${id}`, createdAt: new Date() });
  return id;
}
