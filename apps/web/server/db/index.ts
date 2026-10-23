// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** De transactie die `db.transaction(async (tx) => ...)` doorgeeft. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let huidige: Db | undefined;

export function gebruikDb(): Db {
  if (!huidige) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL ontbreekt; zie apps/web/.env.example");
    }
    huidige = drizzle(postgres(url), { schema });
  }
  return huidige;
}

/** Alleen voor tests: vervangt de database die `gebruikDb()` teruggeeft. */
export function zetDb(db: Db): void {
  huidige = db;
}
