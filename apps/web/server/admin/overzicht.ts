import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import type { AdminOverzicht } from "../../shared/admin/records";
import type { AbonnementConfig } from "../abonnementen/config";
import type { Db } from "../db";
import { abonnementen, organization, projecten, user } from "../db/schema";
import { lijstAdminAudit } from "./audit";
import { lijstAdminOrganisaties, lijstAdminProjecten } from "./records";
import { toegangGroepSql } from "./toegangsweergave";
import { lijstOpvolging } from "./notities";

export async function adminOverzicht(db: Db, config: AbonnementConfig, nu: Date): Promise<AdminOverzicht> {
  const sinds = new Date(nu.getTime() - 30 * 86400000);
  const [[personen], [bedrijven], [werk], [nieuw], [nieuweBedrijven], [gewijzigd]] = await Promise.all([
    db.select({ n: count() }).from(user), db.select({ n: count() }).from(organization),
    db.select({ n: count() }).from(projecten).where(isNull(projecten.verwijderd)),
    db.select({ n: count() }).from(user).where(gte(user.createdAt, sinds)),
    db.select({ n: count() }).from(organization).where(gte(organization.createdAt, sinds)),
    db.select({ n: count() }).from(projecten).where(and(isNull(projecten.verwijderd), gte(projecten.gewijzigd, sinds))),
  ]);
  const toegang: AdminOverzicht["toegang"] = { uit: 0, vrijgesteld: 0, onderwijs: 0, abonnement: 0, betalingsgratie: 0, proef: 0, gratis: 0 };
  const groep = toegangGroepSql(config, nu);
  const groepen = await db.select({ groep: groep.as("groep"), n: count() }).from(organization)
    .leftJoin(abonnementen, eq(abonnementen.organisatieId, organization.id)).groupBy(sql`"groep"`);
  for (const r of groepen) toegang[r.groep] = r.n;
  const leeg = { items: [], totaal: 0, pagina: 1, perPagina: 5 };
  const [proefEindigt, betaling, gratis, recenteProjecten, recenteCorrecties] = await Promise.all([
    config.ingeschakeld ? lijstAdminOrganisaties(db, { aandacht: "proef", perPagina: 5 }, config, nu) : leeg,
    config.ingeschakeld ? lijstAdminOrganisaties(db, { aandacht: "betaling", perPagina: 5 }, config, nu) : leeg,
    config.ingeschakeld ? lijstAdminOrganisaties(db, { toegang: "gratis", perPagina: 5 }, config, nu) : leeg,
    lijstAdminProjecten(db, { volgorde: "gewijzigd", perPagina: 5 }), lijstAdminAudit(db, { perPagina: 5 }),
  ]);
  return { beoordeeldOp: nu.toISOString(), billing: config.ingeschakeld,
    aantallen: { gebruikers: personen!.n, organisaties: bedrijven!.n, projecten: werk!.n,
      nieuweGebruikers: nieuw!.n, nieuweOrganisaties: nieuweBedrijven!.n, gewijzigdeProjecten: gewijzigd!.n },
    toegang, aandacht: { proefEindigt, betaling, gratis }, recenteProjecten: recenteProjecten.items, recenteCorrecties: recenteCorrecties.items,
    opvolging: await lijstOpvolging(db, nu, { perPagina: 5 }) };
}
