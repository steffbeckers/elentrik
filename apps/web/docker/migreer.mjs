// Voert de Drizzle-migraties uit (apps/web/server/db/migraties) tegen DATABASE_URL, met dezelfde
// `postgres`-driver als de app. Draait vóór de server (start.sh); bij een fout is de exitcode 1.
// Drizzle voert alle openstaande migraties uit in één transactie: een falende migratie laat de
// database zoals ze was.
//
// De uitvoer noemt nooit de URL of het wachtwoord. Het wachtwoord staat bij voorkeur niet in de URL
// maar in PGPASSWORD (postgres-js leest die zelf; zie deploy/nas/compose.yaml). Een ongeldige URL
// meldt alleen haar foutcode: de fout van Node draagt de hele URL mee in `input`.
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Migreren mislukt: DATABASE_URL ontbreekt (zie .env.voorbeeld).");
  process.exit(1);
}

/** Haalt elk bekend wachtwoord uit een tekst, voor het geval een foutmelding het toch noemt. */
function zonderWachtwoord(tekst) {
  const geheimen = [process.env.PGPASSWORD];
  try {
    geheimen.push(decodeURIComponent(new URL(url).password));
  } catch {
    // Een ongeldige URL: de code van de fout is genoeg.
  }
  let schoon = tekst;
  for (const geheim of geheimen) if (geheim) schoon = schoon.split(geheim).join("***");
  return schoon;
}

let sql;
let code = 0;
try {
  sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), {
    migrationsFolder: fileURLToPath(new URL("./migraties", import.meta.url)),
  });
  console.log("Migraties uitgevoerd.");
} catch (fout) {
  const oorzaak = fout instanceof Error && fout.cause instanceof Error ? fout.cause : fout;
  const foutCode = oorzaak && typeof oorzaak === "object" && "code" in oorzaak ? String(oorzaak.code) : undefined;
  if (foutCode === "ERR_INVALID_URL") {
    console.error("Migreren mislukt (ERR_INVALID_URL): DATABASE_URL is geen geldige URL. Zet het wachtwoord in PGPASSWORD.");
  } else {
    const boodschap = oorzaak instanceof Error ? oorzaak.message : String(oorzaak);
    console.error(`Migreren mislukt${foutCode ? ` (${foutCode})` : ""}: ${zonderWachtwoord(boodschap)}`);
  }
  code = 1;
} finally {
  await sql?.end({ timeout: 5 });
}
process.exit(code);
