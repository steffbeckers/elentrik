import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import type { AdminAuditDetail, AdminAuditDoel, AdminAuditItem } from "../../shared/admin/audit";
import type { AdminPagina } from "../../shared/admin/basis";
import type { Db, Tx } from "../db";
import { adminAudit } from "../db/schema";
import { nietGevondenFout } from "../fouten";
import { PagineringSchema, parseAdmin } from "./invoer";
import type { AdminActor } from "./toegang";

export async function schrijfAdminAudit(tx: Tx, actor: AdminActor, invoer: {
  doel: AdminAuditDoel; actie: string; reden: string; voor: unknown; na: unknown; correctieId?: string;
}): Promise<string> {
  const [rij] = await tx.insert(adminAudit).values({ actorId: actor.id, actorNaam: actor.naam,
    doelType: invoer.doel.type, doelId: invoer.doel.id, organisatieId: invoer.doel.organisatieId,
    projectId: invoer.doel.projectId, actie: invoer.actie, reden: invoer.reden, voor: invoer.voor, na: invoer.na,
    correctieId: invoer.correctieId ?? null }).returning({ id: adminAudit.id });
  return rij!.id;
}

const kolommen = {
  id: adminAudit.id, actorId: adminAudit.actorId, actorNaam: adminAudit.actorNaam,
  doelType: adminAudit.doelType, doelId: adminAudit.doelId, organisatieId: adminAudit.organisatieId,
  projectId: adminAudit.projectId, actie: adminAudit.actie, reden: adminAudit.reden,
  tijd: adminAudit.tijd, correctieId: adminAudit.correctieId,
};
function naarItem(rij: Omit<typeof adminAudit.$inferSelect, "voor" | "na">): AdminAuditItem {
  return { id: rij.id, actor: { id: rij.actorId, naam: rij.actorNaam },
    doel: { type: rij.doelType, id: rij.doelId, organisatieId: rij.organisatieId, projectId: rij.projectId },
    actie: rij.actie, reden: rij.reden, tijd: rij.tijd.toISOString(), correctieId: rij.correctieId };
}
const QuerySchema = PagineringSchema.extend({
  doelId: z.string().max(200).optional(), actorId: z.string().max(200).optional(),
  organisatieId: z.string().max(200).optional(), projectId: z.uuid().optional(),
  actie: z.string().max(100).optional(), correctieId: z.uuid().optional(),
  vanaf: z.iso.datetime().optional(), tot: z.iso.datetime().optional(),
});

export async function lijstAdminAudit(db: Db, query: Record<string, unknown> = {}): Promise<AdminPagina<AdminAuditItem>> {
  const q = parseAdmin(QuerySchema, query);
  const filter = and(q.doelId ? eq(adminAudit.doelId, q.doelId) : undefined,
    q.actorId ? eq(adminAudit.actorId, q.actorId) : undefined,
    q.organisatieId ? eq(adminAudit.organisatieId, q.organisatieId) : undefined,
    q.projectId ? eq(adminAudit.projectId, q.projectId) : undefined,
    q.actie ? eq(adminAudit.actie, q.actie) : undefined,
    q.correctieId ? eq(adminAudit.correctieId, q.correctieId) : undefined,
    q.vanaf ? gte(adminAudit.tijd, new Date(q.vanaf)) : undefined,
    q.tot ? lte(adminAudit.tijd, new Date(q.tot)) : undefined);
  const [totalen] = await db.select({ n: count() }).from(adminAudit).where(filter);
  const rijen = await db.select(kolommen).from(adminAudit).where(filter)
    .orderBy(desc(adminAudit.tijd), desc(adminAudit.id)).limit(q.perPagina).offset((q.pagina - 1) * q.perPagina);
  return { items: rijen.map(naarItem), totaal: Number(totalen!.n), pagina: q.pagina, perPagina: q.perPagina };
}

export async function haalAdminAudit(db: Db, id: string): Promise<AdminAuditDetail> {
  if (!z.uuid().safeParse(id).success) throw nietGevondenFout();
  const [rij] = await db.select().from(adminAudit).where(eq(adminAudit.id, id));
  if (!rij) throw nietGevondenFout();
  return { ...naarItem(rij), voor: rij.voor, na: rij.na };
}
