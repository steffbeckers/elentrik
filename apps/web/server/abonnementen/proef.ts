// De proefperiode van een nieuwe organisatie: 30 dagen, maar alleen voor het eerste bedrijf dat
// een gebruiker zelf aanmaakt (`user.proef_gebruikt`). Gebruikt door beide aanmaakpaden: de
// registratie (server/organisaties/registratie.ts) en Better Auth's /organization/create.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { eq } from "drizzle-orm";
import type { Db, Tx } from "../db";
import { organization, user } from "../db/schema";
import { PROEF_DAGEN } from "./toegang";

const DAG_MS = 24 * 3600 * 1000;

/**
 * Zet `organization.proef_einde`: `nu + 30 dagen` als de gebruiker nog geen proefperiode gebruikte
 * (en dan wordt `proef_gebruikt` waar), anders `nu`, dus meteen voorbij. Vergrendelt de
 * gebruikersrij, zodat twee gelijktijdige aanmaken samen één proefperiode geven. Geeft het
 * nieuwe `proef_einde` terug.
 */
export async function kenProefperiodeToe(
  db: Db | Tx,
  i: { organisatieId: string; gebruikerId: string; nu: Date },
): Promise<Date> {
  // Altijd in een transactie (een savepoint als `db` al een transactie is), zodat de vergrendeling
  // blijft staan tot de schrijfacties klaar zijn.
  return db.transaction(async (tx) => {
    const [rij] = await tx
      .select({ gebruikt: user.proefGebruikt })
      .from(user)
      .where(eq(user.id, i.gebruikerId))
      .for("update");
    const nieuweProef = rij !== undefined && !rij.gebruikt;
    const einde = new Date(i.nu.getTime() + (nieuweProef ? PROEF_DAGEN * DAG_MS : 0));
    if (nieuweProef) await tx.update(user).set({ proefGebruikt: true }).where(eq(user.id, i.gebruikerId));
    await tx.update(organization).set({ proefEinde: einde }).where(eq(organization.id, i.organisatieId));
    return einde;
  });
}
