// Lezen van de abonnementsrij en de toegang van een organisatie.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { abonnementen, organization } from "../db/schema";
import type { AbonnementStatus, Toegang } from "../../shared/abonnement";
import type { AbonnementConfig } from "./config";
import { bepaalToegang } from "./toegang";

export type AbonnementRij = typeof abonnementen.$inferSelect;

// Een Record, zodat de compiler een nieuwe status in `AbonnementStatus` afdwingt.
const STATUSSEN: Record<AbonnementStatus, true> = {
  trialing: true,
  active: true,
  past_due: true,
  unpaid: true,
  canceled: true,
  incomplete: true,
  incomplete_expired: true,
  paused: true,
};

/** De kolom `status` is vrije tekst: alleen een bekende Stripe-status telt, anders null. */
export function leesStatus(waarde: string | null | undefined): AbonnementStatus | null {
  return waarde != null && Object.hasOwn(STATUSSEN, waarde) ? (waarde as AbonnementStatus) : null;
}

/** De abonnementsrij van een organisatie, of null als ze nooit naar Checkout ging. */
export async function haalAbonnementRij(db: Db, organisatieId: string): Promise<AbonnementRij | null> {
  const [rij] = await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, organisatieId));
  return rij ?? null;
}

/**
 * De toegang van een organisatie: leest `proefEinde`, `vrijgesteld` en de abonnementsrij en
 * beslist met `bepaalToegang`. Met abonnementen uit mag elke organisatie schrijven (zonder
 * proefperiode). Een organisatie die niet bestaat krijgt nooit schrijfrecht.
 */
export async function toegangVoor(
  db: Db,
  organisatieId: string,
  config: AbonnementConfig,
  nu: Date = new Date(),
): Promise<Toegang> {
  if (!config.ingeschakeld) return { schrijven: true, reden: "uit", proefEinde: null };
  const [org] = await db
    .select({ proefEinde: organization.proefEinde, vrijgesteld: organization.vrijgesteld })
    .from(organization)
    .where(eq(organization.id, organisatieId));
  if (!org) return { schrijven: false, reden: "proef-voorbij", proefEinde: null };
  const rij = await haalAbonnementRij(db, organisatieId);
  const status = leesStatus(rij?.status);
  const { schrijven, reden } = bepaalToegang({
    nu,
    ingeschakeld: true,
    proefEinde: org.proefEinde,
    vrijgesteld: org.vrijgesteld,
    abonnement: status ? { status, achterstalligSinds: rij?.achterstalligSinds ?? null } : null,
  });
  return { schrijven, reden, proefEinde: org.proefEinde.toISOString() };
}
