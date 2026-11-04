import { sql } from "drizzle-orm";
import type { AdminToegangsverklaring, AdminToegangGroep } from "../../shared/admin/toegang";
import { ACHTERSTALLIG_DAGEN, achterstalligTot, bepaalToegang, type ToegangInvoer } from "../abonnementen/toegang";
import type { AbonnementConfig } from "../abonnementen/config";
import { abonnementen, organization } from "../db/schema";

export function verklaarToegang(invoer: ToegangInvoer): AdminToegangsverklaring {
  return { ...bepaalToegang(invoer), proefEinde: invoer.proefEinde.toISOString(),
    achterstalligTot: achterstalligTot(invoer.abonnement)?.toISOString() ?? null,
    beoordeeldOp: invoer.nu.toISOString(), vrijgesteld: invoer.vrijgesteld, ingeschakeld: invoer.ingeschakeld };
}

/** Aggregaties/filtering: dezelfde volgorde als bepaalToegang, door pariteitstests bewaakt. */
export function toegangGroepSql(config: AbonnementConfig, nu: Date) {
  if (!config.ingeschakeld) return sql<AdminToegangGroep>`'uit'`;
  return sql<AdminToegangGroep>`case
    when ${organization.vrijgesteld} then 'vrijgesteld'
    when ${abonnementen.status} in ('active', 'trialing') then 'abonnement'
    when ${abonnementen.status} = 'past_due' and (${abonnementen.achterstalligSinds} is null or
      ${abonnementen.achterstalligSinds} > ${new Date(nu.getTime() - ACHTERSTALLIG_DAGEN * 86400000).toISOString()}::timestamptz) then 'betalingsgratie'
    when ${organization.proefEinde} > ${nu.toISOString()}::timestamptz then 'proef'
    else 'alleenLezen' end`;
}
