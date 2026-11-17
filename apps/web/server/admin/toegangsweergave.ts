import { sql } from "drizzle-orm";
import type { Bedrijfsniveau, ToegangReden } from "../../shared/abonnement";
import type { AdminToegangsverklaring, AdminToegangGroep } from "../../shared/admin/toegang";
import { ACHTERSTALLIG_DAGEN, achterstalligTot, bepaalBedrijfsniveau, type ToegangInvoer } from "../abonnementen/toegang";
import type { AbonnementConfig } from "../abonnementen/config";
import { abonnementen, organization } from "../db/schema";

export function verklaarToegang(invoer: ToegangInvoer): AdminToegangsverklaring {
  return { ...bepaalBedrijfsniveau(invoer), proefEinde: invoer.proefEinde.toISOString(),
    achterstalligTot: achterstalligTot(invoer.abonnement)?.toISOString() ?? null,
    beoordeeldOp: invoer.nu.toISOString(), vrijgesteld: invoer.vrijgesteld, onderwijs: invoer.onderwijs,
    ingeschakeld: invoer.ingeschakeld };
}

/** De groep in het beheerscherm bij een uitkomst van `bepaalBedrijfsniveau`. */
export function groepVoor(t: { niveau: Bedrijfsniveau; reden: ToegangReden }): AdminToegangGroep {
  if (t.niveau !== "abonnement") return t.niveau;
  if (t.reden === "betaling-mislukt") return "betalingsgratie";
  if (t.reden === "proef") return "proef";
  return "abonnement";
}

/**
 * Aggregaties/filtering: dezelfde volgorde als `bepaalBedrijfsniveau` met `groepVoor`, door de
 * pariteitstest in test/admin-toegangsweergave.test.ts bewaakt.
 */
export function toegangGroepSql(config: AbonnementConfig, nu: Date) {
  if (!config.ingeschakeld) return sql<AdminToegangGroep>`'uit'`;
  return sql<AdminToegangGroep>`case
    when ${organization.vrijgesteld} then 'vrijgesteld'
    when ${organization.onderwijs} then 'onderwijs'
    when ${abonnementen.status} in ('active', 'trialing') then 'abonnement'
    when ${abonnementen.status} = 'past_due' and (${abonnementen.achterstalligSinds} is null or
      ${abonnementen.achterstalligSinds} > ${new Date(nu.getTime() - ACHTERSTALLIG_DAGEN * 86400000).toISOString()}::timestamptz) then 'betalingsgratie'
    when ${organization.proefEinde} > ${nu.toISOString()}::timestamptz then 'proef'
    else 'gratis' end`;
}
