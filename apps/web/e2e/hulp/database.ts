// Rechtstreeks in de e2e-database werken (opzetten van testgegevens, een sessie laten verdwijnen).
// Altijd langs de bewaker van `omgeving.ts`: een andere database wordt geweigerd.
import postgres from "postgres";
import { eisE2eDatabase } from "./../omgeving";

export type Sql = postgres.Sql;

/** Voert `werk` uit met een verbinding met `elentrik_e2e` en sluit ze daarna. */
export async function metE2eDatabase<T>(werk: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = postgres(eisE2eDatabase(), { max: 1, onnotice: () => {} });
  try {
    return await werk(sql);
  } finally {
    await sql.end();
  }
}
