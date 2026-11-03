import { and, asc, count, desc, eq, exists, gte, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { AdminLijstQuery, AdminPagina } from "../../shared/admin/basis";
import type { AdminGebruiker, AdminGebruikerDetail, AdminOrganisatie, AdminOrganisatieDetail, AdminProject } from "../../shared/admin/records";
import { gebruikAbonnementen, type AbonnementConfig } from "../abonnementen/config";
import { leesStatus } from "../abonnementen/repo";
import { haalBedrijf } from "../bedrijf/repo";
import type { Db } from "../db";
import { abonnementen, member, organization, projecten, user } from "../db/schema";
import { nietGevondenFout } from "../fouten";
import { PagineringSchema, parseAdmin } from "./invoer";
import { versieToken } from "./mutaties";
import { stripeBeheerLinks } from "./stripe-links";
import { toegangGroepSql, verklaarToegang } from "./toegangsweergave";

const QuerySchema = PagineringSchema.extend({
  zoek: z.string().trim().max(200).default(""), exactId: z.string().max(200).optional(),
  organisatieId: z.string().max(200).optional(), gebruikerId: z.string().max(200).optional(),
  verwijderd: z.enum(["nee", "ja", "exact"]).default("nee"),
  toegang: z.enum(["uit", "vrijgesteld", "abonnement", "betalingsgratie", "proef", "alleenLezen"]).optional(),
  status: z.string().max(50).optional(), aandacht: z.enum(["proef", "betaling"]).optional(),
  volgorde: z.enum(["naam", "gewijzigd"]).default("naam"),
});
export function leesAdminQuery(query: Record<string, unknown>): AdminLijstQuery { return parseAdmin(QuerySchema, query); }
function query(query: Record<string, unknown>) { return parseAdmin(QuerySchema, query); }
export function zoekPatroon(zoek: string): string { return `%${zoek.replace(/[\\%_]/g, "\\$&")}%`; }
const rang = (kolom: typeof user.id | typeof user.email | typeof organization.id | typeof projecten.id, tekst: string) =>
  sql`case when lower(cast(${kolom} as text)) = ${tekst.toLowerCase()} then 0 else 1 end`;
const iso = (datum: Date | null | undefined) => datum?.toISOString() ?? null;

const gebruikerKolommen = {
  id: user.id, naam: user.name, email: user.email, aangemaakt: user.createdAt,
  bedrijven: sql<number>`(select count(distinct organization_id)::int from member where user_id = ${user.id})`,
};
export async function lijstAdminGebruikers(db: Db, invoer: Record<string, unknown> = {}): Promise<AdminPagina<AdminGebruiker>> {
  const q = query(invoer);
  const filter = and(q.exactId ? eq(user.id, q.exactId) : undefined,
    q.organisatieId ? exists(db.select({ id: member.id }).from(member).where(and(eq(member.userId, user.id), eq(member.organizationId, q.organisatieId)))) : undefined,
    q.zoek ? or(ilike(user.name, zoekPatroon(q.zoek)), ilike(user.email, zoekPatroon(q.zoek)), eq(user.id, q.zoek)) : undefined);
  const [total] = await db.select({ n: count() }).from(user).where(filter);
  const rows = await db.select(gebruikerKolommen).from(user).where(filter)
    .orderBy(rang(user.id, q.zoek), rang(user.email, q.zoek), asc(user.name), asc(user.id))
    .limit(q.perPagina).offset((q.pagina - 1) * q.perPagina);
  return { items: rows.map((r) => ({ ...r, aangemaakt: r.aangemaakt.toISOString(), bedrijven: Number(r.bedrijven) })),
    totaal: total!.n, pagina: q.pagina, perPagina: q.perPagina };
}

const organisatieKolommen = {
  id: organization.id, naam: organization.name, aangemaakt: organization.createdAt,
  proefEinde: organization.proefEinde, vrijgesteld: organization.vrijgesteld,
  status: abonnementen.status, achterstalligSinds: abonnementen.achterstalligSinds,
  leden: sql<number>`(select count(*)::int from member where organization_id = ${organization.id})`,
  projecten: sql<number>`(select count(*)::int from projecten where organisatie_id = ${organization.id} and verwijderd is null)`,
  eigenaren: sql<AdminOrganisatie["eigenaren"]>`coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'naam', u.name, 'email', u.email) order by u.name, u.id)
    from member m join "user" u on u.id = m.user_id where m.organization_id = ${organization.id} and elentrik_is_eigenaar(m.role)), '[]'::jsonb)`,
};
export async function lijstAdminOrganisaties(db: Db, invoer: Record<string, unknown> = {}, config = gebruikAbonnementen().config, nu = new Date()): Promise<AdminPagina<AdminOrganisatie>> {
  const q = query(invoer);
  const groep = toegangGroepSql(config, nu);
  const filter = and(q.exactId ? eq(organization.id, q.exactId) : undefined,
    q.gebruikerId ? exists(db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, organization.id), eq(member.userId, q.gebruikerId)))) : undefined,
    q.zoek ? or(ilike(organization.name, zoekPatroon(q.zoek)), eq(organization.id, q.zoek),
      sql`exists(select 1 from member m join "user" u on u.id = m.user_id where m.organization_id = ${organization.id} and elentrik_is_eigenaar(m.role) and u.email ilike ${zoekPatroon(q.zoek)})`) : undefined,
    q.toegang ? eq(groep, q.toegang) : undefined, q.status ? eq(abonnementen.status, q.status) : undefined,
    q.aandacht === "proef" ? and(eq(groep, "proef"), gte(organization.proefEinde, nu), lte(organization.proefEinde, new Date(nu.getTime() + 7 * 86400000))) : undefined,
    q.aandacht === "betaling" ? sql`${abonnementen.status} in ('past_due', 'unpaid', 'incomplete')` : undefined);
  const [total] = await db.select({ n: count() }).from(organization).leftJoin(abonnementen, eq(abonnementen.organisatieId, organization.id)).where(filter);
  const rows = await db.select({ ...organisatieKolommen, groep }).from(organization)
    .leftJoin(abonnementen, eq(abonnementen.organisatieId, organization.id)).where(filter)
    .orderBy(rang(organization.id, q.zoek), asc(organization.name), asc(organization.id)).limit(q.perPagina).offset((q.pagina - 1) * q.perPagina);
  return { items: rows.map((r) => {
    const status = leesStatus(r.status);
    return { id: r.id, naam: r.naam, aangemaakt: r.aangemaakt.toISOString(), leden: Number(r.leden), projecten: Number(r.projecten),
      eigenaren: r.eigenaren, status: r.status, groep: r.groep,
      toegang: verklaarToegang({ nu, ingeschakeld: config.ingeschakeld, proefEinde: r.proefEinde, vrijgesteld: r.vrijgesteld,
        abonnement: status ? { status, achterstalligSinds: r.achterstalligSinds } : null }) };
  }), totaal: total!.n, pagina: q.pagina, perPagina: q.perPagina };
}

const projectKolommen = {
  id: projecten.id, naam: projecten.naam, klantnaam: projecten.klantnaam,
  organisatieId: projecten.organisatieId, organisatieNaam: organization.name,
  versie: projecten.versie, aangemaakt: projecten.aangemaakt, gewijzigd: projecten.gewijzigd, verwijderd: projecten.verwijderd,
};
export async function lijstAdminProjecten(db: Db, invoer: Record<string, unknown> = {}): Promise<AdminPagina<AdminProject>> {
  const q = query(invoer);
  const exact = z.uuid().safeParse(q.exactId ?? q.zoek);
  if (q.exactId && !exact.success) throw nietGevondenFout();
  const filter = and(q.exactId ? eq(projecten.id, q.exactId) : undefined,
    q.organisatieId ? eq(projecten.organisatieId, q.organisatieId) : undefined,
    q.verwijderd === "ja" ? isNotNull(projecten.verwijderd) : q.verwijderd === "exact" && exact.success ? undefined : isNull(projecten.verwijderd),
    q.zoek ? or(ilike(projecten.naam, zoekPatroon(q.zoek)), ilike(projecten.klantnaam, zoekPatroon(q.zoek)),
      ilike(organization.name, zoekPatroon(q.zoek)), exact.success ? eq(projecten.id, exact.data) : undefined) : undefined);
  const [total] = await db.select({ n: count() }).from(projecten).leftJoin(organization, eq(organization.id, projecten.organisatieId)).where(filter);
  const rows = await db.select(projectKolommen).from(projecten).leftJoin(organization, eq(organization.id, projecten.organisatieId)).where(filter)
    .orderBy(rang(projecten.id, q.zoek), ...(q.volgorde === "gewijzigd" ? [desc(projecten.gewijzigd)] : [asc(projecten.naam)]), asc(projecten.id))
    .limit(q.perPagina).offset((q.pagina - 1) * q.perPagina);
  return { items: rows.map((r) => ({ ...r, aangemaakt: r.aangemaakt.toISOString(), gewijzigd: r.gewijzigd.toISOString(), verwijderd: iso(r.verwijderd) })),
    totaal: total!.n, pagina: q.pagina, perPagina: q.perPagina };
}

export async function haalAdminGebruiker(db: Db, id: string): Promise<AdminGebruikerDetail> {
  const item = (await lijstAdminGebruikers(db, { exactId: id })).items[0];
  if (!item) throw nietGevondenFout();
  const [persoon] = await db.select({ emailBevestigd: user.emailVerified }).from(user).where(eq(user.id, id));
  return { ...item, emailBevestigd: persoon!.emailBevestigd, verwacht: versieToken({ naam: item.naam }),
    organisaties: await lijstAdminOrganisaties(db, { gebruikerId: id }) };
}

export function bedrijfsrechtenStaat(org: { vrijgesteld: boolean; proefEinde: Date }, abo: typeof abonnementen.$inferSelect | undefined) {
  return { vrijgesteld: org.vrijgesteld, proefEinde: org.proefEinde.toISOString(),
    abonnementId: abo?.stripeAbonnementId ?? null, status: abo?.status ?? null, openCheckout: abo?.openCheckoutSessie ?? null };
}

export async function haalAdminOrganisatie(db: Db, id: string, config: AbonnementConfig = gebruikAbonnementen().config, nu = new Date()): Promise<AdminOrganisatieDetail> {
  const item = (await lijstAdminOrganisaties(db, { exactId: id }, config, nu)).items[0];
  if (!item) throw nietGevondenFout();
  const installateur = await haalBedrijf(db, id);
  const [abo] = await db.select().from(abonnementen).where(eq(abonnementen.organisatieId, id));
  return { ...item, installateur, verwacht: versieToken({ naam: item.naam, installateur }),
    toegangVerwacht: versieToken(bedrijfsrechtenStaat({ vrijgesteld: item.toegang.vrijgesteld, proefEinde: new Date(item.toegang.proefEinde!) }, abo)),
    abonnement: { klantId: abo?.stripeKlantId ?? null, abonnementId: abo?.stripeAbonnementId ?? null, status: abo?.status ?? null,
      formule: abo?.formule ?? null, periodeEinde: iso(abo?.periodeEinde), opgezegd: abo?.opgezegdOpPeriodeEinde ?? false,
      bijgewerkt: iso(abo?.bijgewerkt), openCheckout: !!abo?.openCheckoutSessie,
      links: stripeBeheerLinks(config, { klantId: abo?.stripeKlantId ?? null, abonnementId: abo?.stripeAbonnementId ?? null }) },
    gebruikers: await lijstAdminGebruikers(db, { organisatieId: id }), projectLijst: await lijstAdminProjecten(db, { organisatieId: id }) };
}

export async function haalAdminProject(db: Db, id: string): Promise<AdminProject> {
  const item = (await lijstAdminProjecten(db, { exactId: id, verwijderd: "exact" })).items[0];
  if (!item) throw nietGevondenFout();
  return item;
}
