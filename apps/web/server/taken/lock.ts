// Wat de geplande taken delen: het lock tegen twee instanties tegelijk en de schakelaar
// `ELENTRIK_GEPLANDE_TAKEN`.
//
// Het lock staat los van het werk. Het is een sessielock (`pg_try_advisory_lock`) op een
// gereserveerde verbinding (`sql.reserve()` van postgres-js): lock en unlock lopen zo gegarandeerd
// op dezelfde verbinding, ook al is er een pool. Het werk loopt op de gewone `db`. Valt de
// gereserveerde verbinding weg, dan laat de server het lock los.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import type postgres from "postgres";

/**
 * Voert `werk` uit terwijl het lock gehouden wordt. Geeft `false` zonder `werk` uit te voeren als
 * een andere run het lock heeft. In tests (PGlite heeft maar een sessie, waarin een advisory lock
 * altijd opnieuw te nemen is) geven de tests hun eigen `MetLock`.
 */
export type MetLock = (werk: () => Promise<void>) => Promise<boolean>;

/** Het echte lock onder de naam `naam`: een sessielock op een gereserveerde verbinding, altijd opgeruimd in `finally`. */
export function maakPostgresLock(client: Pick<postgres.Sql, "reserve">, naam: string): MetLock {
  return async (werk) => {
    const verbinding = await client.reserve();
    try {
      const [genomen] = await verbinding`select pg_try_advisory_lock(hashtext(${naam})) as genomen`;
      if (genomen?.genomen !== true) return false;
      try {
        await werk();
      } finally {
        await verbinding`select pg_advisory_unlock(hashtext(${naam}))`;
      }
      return true;
    } finally {
      verbinding.release();
    }
  };
}

/**
 * In productie draaien de geplande taken standaard; daarbuiten (`nuxt dev`, tests) alleen met
 * `ELENTRIK_GEPLANDE_TAKEN=aan`. `uit` zet ze altijd uit (de e2e-server, een noodstop).
 */
export function geplandeTakenAan(env: Record<string, string | undefined> = process.env): boolean {
  const keuze = env.ELENTRIK_GEPLANDE_TAKEN?.trim().toLowerCase();
  if (keuze === "uit") return false;
  return env.NODE_ENV === "production" || keuze === "aan";
}
