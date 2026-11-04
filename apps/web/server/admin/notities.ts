import { and, count, desc, eq, isNotNull, isNull, lte, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { AdminPagina } from "../../shared/admin/basis";
import type { AdminNotitie } from "../../shared/admin/notities";
import type { Db } from "../db";
import { adminNotities, organization, projecten } from "../db/schema";
import { nietGevondenFout } from "../fouten";
import { schrijfAdminAudit } from "./audit";
import { brusselseDatum, eisKalenderdatum } from "./datum";
import { MutatieBasisSchema, PagineringSchema, parseAdmin } from "./invoer";
import { eisAdminVersie, versieToken, voerAdminMutatieUit } from "./mutaties";
import type { AdminActor } from "./toegang";

const DatumSchema = z.string().transform(eisKalenderdatum).nullable();
const InhoudSchema = z.object({ tekst: z.string().trim().min(1).max(5000), opvolgdatum: DatumSchema });
const NieuwSchema = InhoudSchema.extend({ mutatieId: z.uuid(), organisatieId: z.string().min(1).max(200), projectId: z.uuid().nullable() }).strict();
const WijzigSchema = MutatieBasisSchema.extend({ gegevens: InhoudSchema.extend({ gearchiveerd: z.boolean() }).strict() }).strict();
const QuerySchema = PagineringSchema.extend({ organisatieId: z.string().min(1).max(200), projectId: z.uuid().optional(),
  gearchiveerd: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).default(false) });
type Rij = typeof adminNotities.$inferSelect;
const staat = (r: Rij) => ({ tekst: r.tekst, opvolgdatum: r.opvolgdatum, gearchiveerd: !!r.gearchiveerd, gewijzigd: r.gewijzigd.toISOString() });
function dto(r: Rij): AdminNotitie {
  return { id: r.id, organisatieId: r.organisatieId, projectId: r.projectId, tekst: r.tekst, opvolgdatum: r.opvolgdatum,
    auteur: { id: r.auteurId, naam: r.auteurNaam }, aangemaakt: r.aangemaakt.toISOString(), gewijzigd: r.gewijzigd.toISOString(),
    gearchiveerd: r.gearchiveerd?.toISOString() ?? null, verwacht: versieToken(staat(r)) };
}
const doelVoor = (r: Pick<Rij, "id" | "organisatieId" | "projectId">) => ({ type: "notitie" as const, id: r.id, organisatieId: r.organisatieId, projectId: r.projectId });
async function lijst(db: Db, filter: SQL | undefined, pagina: number, perPagina: number): Promise<AdminPagina<AdminNotitie>> {
  const [total] = await db.select({ n: count() }).from(adminNotities).where(filter);
  const rows = await db.select().from(adminNotities).where(filter).orderBy(desc(adminNotities.aangemaakt), desc(adminNotities.id)).limit(perPagina).offset((pagina - 1) * perPagina);
  return { items: rows.map(dto), totaal: total!.n, pagina, perPagina };
}
export async function lijstNotities(db: Db, invoer: Record<string, unknown>): Promise<AdminPagina<AdminNotitie>> {
  const q = parseAdmin(QuerySchema, invoer);
  return lijst(db, and(eq(adminNotities.organisatieId, q.organisatieId), q.projectId ? eq(adminNotities.projectId, q.projectId) : undefined,
    q.gearchiveerd ? isNotNull(adminNotities.gearchiveerd) : isNull(adminNotities.gearchiveerd)), q.pagina, q.perPagina);
}
export function lijstOpvolging(db: Db, nu: Date, invoer: Record<string, unknown> = {}): Promise<AdminPagina<AdminNotitie>> {
  const q = parseAdmin(PagineringSchema, invoer);
  return lijst(db, and(isNull(adminNotities.gearchiveerd), lte(adminNotities.opvolgdatum, brusselseDatum(nu))), q.pagina, q.perPagina);
}
export async function maakNotitie(db: Db, actor: AdminActor, invoer: unknown): Promise<AdminNotitie> {
  const i = parseAdmin(NieuwSchema, invoer);
  const actie = "notitie.aangemaakt";
  return voerAdminMutatieUit(db, actor, { mutatieId: i.mutatieId, actie, doel: doelVoor({ ...i, id: i.organisatieId }), payload: i }, async (tx) => {
    const [org] = await tx.select({ id: organization.id }).from(organization).where(eq(organization.id, i.organisatieId)).for("share");
    if (!org) throw nietGevondenFout();
    if (i.projectId) {
      const [project] = await tx.select({ id: projecten.id }).from(projecten)
        .where(and(eq(projecten.id, i.projectId), eq(projecten.organisatieId, i.organisatieId), isNull(projecten.verwijderd))).for("share");
      if (!project) throw nietGevondenFout();
    }
    const [rij] = await tx.insert(adminNotities).values({ organisatieId: i.organisatieId, projectId: i.projectId,
      tekst: i.tekst, opvolgdatum: i.opvolgdatum, auteurId: actor.id, auteurNaam: actor.naam }).returning();
    await schrijfAdminAudit(tx, actor, { doel: doelVoor(rij!), actie, reden: i.tekst, voor: null, na: staat(rij!) });
    return dto(rij!);
  });
}
export async function wijzigNotitie(db: Db, actor: AdminActor, id: string, invoer: unknown): Promise<AdminNotitie> {
  if (!z.uuid().safeParse(id).success) throw nietGevondenFout();
  const i = parseAdmin(WijzigSchema, invoer);
  const actie = "notitie.gewijzigd";
  return voerAdminMutatieUit(db, actor, { mutatieId: i.mutatieId, actie, doel: { type: "notitie", id, organisatieId: null, projectId: null }, payload: i }, async (tx) => {
    const [rij] = await tx.select().from(adminNotities).where(eq(adminNotities.id, id)).for("update");
    if (!rij) throw nietGevondenFout();
    const voor = staat(rij);
    eisAdminVersie(i.verwacht, voor);
    const { gewijzigd: _tijd, ...inhoud } = voor;
    if (versieToken(inhoud) === versieToken(i.gegevens)) return dto(rij);
    const nu = new Date();
    const [na] = await tx.update(adminNotities).set({ tekst: i.gegevens.tekst, opvolgdatum: i.gegevens.opvolgdatum,
      gearchiveerd: i.gegevens.gearchiveerd ? rij.gearchiveerd ?? nu : null, gewijzigd: nu }).where(eq(adminNotities.id, id)).returning();
    await schrijfAdminAudit(tx, actor, { doel: doelVoor(rij), actie, reden: i.reden, voor, na: staat(na!) });
    return dto(na!);
  });
}
