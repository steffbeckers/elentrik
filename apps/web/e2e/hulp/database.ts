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

/** Zet het einde van de proefperiode van een organisatie, bv. gisteren voor een verlopen proef. */
export async function zetProefEinde(organisatieId: string, datum: Date): Promise<void> {
  await metE2eDatabase(
    (sql) => sql`update organization set proef_einde = ${datum.toISOString()} where id = ${organisatieId}`,
  );
}

/** Maakt een organisatie vrijgesteld: altijd schrijfrecht, ook zonder abonnement of proef. */
export async function zetVrijgesteld(organisatieId: string): Promise<void> {
  await metE2eDatabase((sql) => sql`update organization set vrijgesteld = true where id = ${organisatieId}`);
}

/**
 * Zet of wist de status onderwijs van een organisatie (geen limieten, altijd een watermerk). Een
 * bedrijf is nooit tegelijk vrijgesteld en onderwijs: aanzetten wist dus ook de vrijstelling.
 */
export async function zetOnderwijs(organisatieId: string, aan = true): Promise<void> {
  await metE2eDatabase((sql) =>
    aan
      ? sql`update organization set onderwijs = true, vrijgesteld = false where id = ${organisatieId}`
      : sql`update organization set onderwijs = false where id = ${organisatieId}`,
  );
}

/** Stempelt een project alsof het tijdens een abonnement bewaard werd (`abonnement_stempel_op`). */
export async function stempelProject(projectId: string, datum: Date = new Date()): Promise<void> {
  await metE2eDatabase(
    (sql) => sql`update projecten set abonnement_stempel_op = ${datum.toISOString()} where id = ${projectId}`,
  );
}
