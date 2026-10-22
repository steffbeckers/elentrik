// Draait één keer vóór alle e2e-specs: zorgt voor een lege, gemigreerde e2e-database,
// een lege bestandenmap en een lege Mailpit.
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { E2E_BESTANDEN_DIR, E2E_DATABASE_NAAM, MAILPIT_URL, eisE2eDatabase } from "./omgeving";

export default async function globalSetup(): Promise<void> {
  // 1. Veiligheidsnet, vóór er iets gebeurt.
  const url = eisE2eDatabase();

  // 2. De database aanmaken als ze ontbreekt, via de onderhoudsdatabase `postgres`.
  const beheerUrl = new URL(url);
  beheerUrl.pathname = "/postgres";
  const beheer = postgres(beheerUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const bestaat = await beheer`select 1 from pg_database where datname = ${E2E_DATABASE_NAAM}`;
    if (bestaat.length === 0) {
      // Een databasenaam kan geen parameter zijn; de naam is een vaste constante.
      await beheer.unsafe(`create database ${E2E_DATABASE_NAAM}`);
    }
  } finally {
    await beheer.end();
  }

  // 3 en 4. Migreren en alle tabellen leegmaken.
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: fileURLToPath(new URL("../server/db/migraties", import.meta.url)),
    });
    const tabellen = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`;
    if (tabellen.length > 0) {
      const namen = tabellen.map((t) => `"public"."${t.tablename}"`).join(", ");
      await sql.unsafe(`truncate table ${namen} cascade`);
    }
  } finally {
    await sql.end();
  }

  // 5. De bestandenmap van de e2e-server leegmaken.
  const map = resolve(E2E_BESTANDEN_DIR);
  await rm(map, { recursive: true, force: true });
  await mkdir(map, { recursive: true });

  // 6. Alle berichten in Mailpit verwijderen.
  const antwoord = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
  if (!antwoord.ok) {
    throw new Error(`Mailpit leegmaken mislukt (${antwoord.status}); draait ze? Start met pnpm db:up.`);
  }
}
