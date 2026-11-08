// Lezen van de abonnementsrij en de toegang van een organisatie.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { abonnementen, organization, projecten } from "../db/schema";
import type { AbonnementStatus, Bedrijfsniveau, Projecttoegang, Toegang } from "../../shared/abonnement";
import type { AbonnementConfig } from "./config";
import { achterstalligTot, bepaalBedrijfsniveau, bepaalProjecttoegang } from "./toegang";

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
 * De toegang van een organisatie: leest `proefEinde`, `vrijgesteld`, `onderwijs` en de
 * abonnementsrij en beslist met `bepaalBedrijfsniveau`. Met abonnementen uit is het niveau `uit`.
 * Een organisatie die niet bestaat staat op `gratis`: nooit meer dan de gratis versie.
 */
export async function toegangVoor(
  db: Db,
  organisatieId: string,
  config: AbonnementConfig,
  nu: Date = new Date(),
): Promise<Toegang> {
  if (!config.ingeschakeld) return { niveau: "uit", reden: "uit", proefEinde: null, achterstalligTot: null };
  const [org] = await db
    .select({ proefEinde: organization.proefEinde, vrijgesteld: organization.vrijgesteld, onderwijs: organization.onderwijs })
    .from(organization)
    .where(eq(organization.id, organisatieId));
  if (!org) return { niveau: "gratis", reden: "gratis", proefEinde: null, achterstalligTot: null };
  const rij = await haalAbonnementRij(db, organisatieId);
  const status = leesStatus(rij?.status);
  const abonnement = status ? { status, achterstalligSinds: rij?.achterstalligSinds ?? null } : null;
  const { niveau, reden } = bepaalBedrijfsniveau({
    nu,
    ingeschakeld: true,
    proefEinde: org.proefEinde,
    vrijgesteld: org.vrijgesteld,
    onderwijs: org.onderwijs,
    abonnement,
  });
  return {
    niveau,
    reden,
    proefEinde: org.proefEinde.toISOString(),
    achterstalligTot: achterstalligTot(abonnement)?.toISOString() ?? null,
  };
}

/**
 * De toegang tot één project: het niveau van zijn organisatie en `bepaalProjecttoegang` met
 * `gekocht_op` en `abonnement_stempel_op`. Null als het project niet bestaat of geen organisatie
 * heeft. Een verwijderd project telt mee: de route beslist zelf wat ze daarmee doet.
 */
export async function projecttoegangVoor(
  db: Db,
  projectId: string,
  config: AbonnementConfig,
  nu: Date = new Date(),
): Promise<{ toegang: Projecttoegang; niveau: Bedrijfsniveau; organisatieId: string } | null> {
  const [project] = await db
    .select({
      organisatieId: projecten.organisatieId,
      gekochtOp: projecten.gekochtOp,
      stempelOp: projecten.abonnementStempelOp,
    })
    .from(projecten)
    .where(eq(projecten.id, projectId));
  if (!project?.organisatieId) return null;
  const { niveau } = await toegangVoor(db, project.organisatieId, config, nu);
  const toegang = bepaalProjecttoegang(niveau, {
    gekocht: project.gekochtOp !== null,
    gestempeld: project.stempelOp !== null,
  });
  return { toegang, niveau, organisatieId: project.organisatieId };
}
