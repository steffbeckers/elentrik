// Voert de Drizzle-migraties uit (apps/web/server/db/migraties) tegen DATABASE_URL, met dezelfde
// `postgres`-driver als de app. Draait vóór de server (start.sh); bij een fout is de exitcode 1.
// Drizzle voert alle openstaande migraties uit in één transactie: een falende migratie laat de
// database zoals ze was. De uitvoer noemt nooit de URL of het wachtwoord.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Migreren mislukt: DATABASE_URL ontbreekt (zie .env.voorbeeld).");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
let code = 0;
try {
  await migrate(drizzle(sql), {
    migrationsFolder: fileURLToPath(new URL("./migraties", import.meta.url)),
  });
  console.log("Migraties uitgevoerd.");
} catch (fout) {
  // Alleen de boodschap en de code van Postgres; een connectiefout noemt het wachtwoord niet.
  const oorzaak = fout instanceof Error && fout.cause instanceof Error ? fout.cause : fout;
  const boodschap = oorzaak instanceof Error ? oorzaak.message : String(oorzaak);
  const pgCode = oorzaak && typeof oorzaak === "object" && "code" in oorzaak ? ` (${String(oorzaak.code)})` : "";
  console.error(`Migreren mislukt${pgCode}: ${boodschap}`);
  code = 1;
} finally {
  await sql.end({ timeout: 5 });
}
process.exit(code);
