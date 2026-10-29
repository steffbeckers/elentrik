// De taal van een gebruiker (`user.taal`): lezen en zetten. Expliciete imports, geen
// Nuxt-auto-imports: Vitest importeert deze module rechtstreeks (ruling E1).
import { eq } from "drizzle-orm";
import { isTaal, type Taal } from "../../shared/taal";
import type { Db } from "../db";
import { user } from "../db/schema";

/** De taal van een gebruiker; nl als de rij ontbreekt of een onbekende waarde heeft. */
export async function leesGebruikerstaal(db: Db, gebruikerId: string): Promise<Taal> {
  const [rij] = await db.select({ taal: user.taal }).from(user).where(eq(user.id, gebruikerId));
  return isTaal(rij?.taal) ? rij.taal : "nl";
}

export async function zetGebruikerstaal(db: Db, gebruikerId: string, taal: Taal): Promise<void> {
  await db.update(user).set({ taal }).where(eq(user.id, gebruikerId));
}
