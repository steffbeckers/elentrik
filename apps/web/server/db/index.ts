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
let huidigeClient: postgres.Sql | undefined;

/**
 * Opent de postgres-js-client. Een ongeldige URL gooit bij postgres-js een fout die de hele URL
 * (met wachtwoord) in zijn `input` meedraagt, en Node toont die in de log. Daarom een eigen fout
 * met alleen de code. Het wachtwoord hoort bij voorkeur niet in de URL maar in PGPASSWORD
 * (postgres-js leest die zelf; zie deploy/nas/compose.yaml).
 */
function openClient(url: string): postgres.Sql {
  try {
    return postgres(url);
  } catch (fout) {
    const code = fout && typeof fout === "object" && "code" in fout ? String(fout.code) : "onbekend";
    throw new Error(`DATABASE_URL is ongeldig (${code}); zie apps/web/.env.example`);
  }
}

export function gebruikDb(): Db {
  if (!huidige) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL ontbreekt; zie apps/web/.env.example");
    }
    huidigeClient = openClient(url);
    huidige = drizzle(huidigeClient, { schema });
  }
  return huidige;
}

/** De postgres-js-client onder `gebruikDb()`, voor wat Drizzle niet kan (een gereserveerde verbinding). */
export function gebruikPostgres(): postgres.Sql {
  gebruikDb();
  if (!huidigeClient) throw new Error("De database is niet via DATABASE_URL geopend");
  return huidigeClient;
}

/** Alleen voor tests: vervangt de database die `gebruikDb()` teruggeeft. */
export function zetDb(db: Db): void {
  huidige = db;
  huidigeClient = undefined;
}
