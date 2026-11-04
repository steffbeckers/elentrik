import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AdminCorrectie } from "../../shared/admin/projecten";
import type { Db } from "../db";
import { adminCorrecties, projecten } from "../db/schema";
import { maakFout, nietGevondenFout } from "../fouten";
import { schrijfAdminAudit } from "./audit";
import { parseAdmin, RedenSchema } from "./invoer";
import { voerAdminMutatieUit } from "./mutaties";
import type { AdminActor } from "./toegang";

export const StartCorrectieSchema = z.object({ mutatieId: z.uuid(), reden: RedenSchema }).strict();
type Rij = typeof adminCorrecties.$inferSelect;
function dto(r: Rij): AdminCorrectie {
  return { id: r.id, projectId: r.projectId, organisatieId: r.organisatieId, reden: r.reden,
    gestart: r.gestart.toISOString(), verloopt: r.verloopt.toISOString(), beeindigd: r.beeindigd?.toISOString() ?? null };
}
export async function levendAdminProject(db: Db, id: string, slot?: "update" | "share") {
  if (!z.uuid().safeParse(id).success) throw nietGevondenFout();
  const q = db.select({ id: projecten.id, organisatieId: projecten.organisatieId }).from(projecten)
    .where(and(eq(projecten.id, id), isNull(projecten.verwijderd), isNotNull(projecten.organisatieId)));
  const [r] = await (slot ? q.for(slot) : q);
  if (!r?.organisatieId) throw nietGevondenFout();
  return { id: r.id, organisatieId: r.organisatieId };
}
export async function startCorrectie(db: Db, actor: AdminActor, projectId: string, invoer: unknown, nu = new Date()): Promise<AdminCorrectie> {
  const i = parseAdmin(StartCorrectieSchema, invoer);
  if (!z.uuid().safeParse(projectId).success) throw nietGevondenFout();
  const actie = "correctie.gestart";
  return voerAdminMutatieUit(db, actor, { mutatieId: i.mutatieId, actie, doel: { type: "project", id: projectId, projectId, organisatieId: null }, payload: { ...i, sessieId: actor.sessieId } }, async (tx) => {
    const project = await levendAdminProject(tx, projectId, "share");
    const [r] = await tx.insert(adminCorrecties).values({ projectId, organisatieId: project.organisatieId,
      actorId: actor.id, sessieId: actor.sessieId, reden: i.reden, gestart: nu, verloopt: new Date(nu.getTime() + 8 * 3600000) }).returning();
    const resultaat = dto(r!);
    await schrijfAdminAudit(tx, actor, { doel: { type: "project", id: projectId, projectId, organisatieId: project.organisatieId },
      actie, reden: i.reden, voor: null, na: resultaat, correctieId: r!.id });
    return resultaat;
  });
}
async function vergrendelCorrectie(db: Db, actor: AdminActor, id: string): Promise<Rij> {
  if (!z.uuid().safeParse(id).success) throw nietGevondenFout();
  const [r] = await db.select().from(adminCorrecties).where(eq(adminCorrecties.id, id)).for("update");
  if (!r || r.actorId !== actor.id || r.sessieId !== actor.sessieId) throw maakFout(403, "Deze correctiesessie is niet geldig", "ADMIN_CORRECTIE_ONGELDIG");
  return r;
}
/** Aanroepen binnen de schrijftransactie: dit slot serialiseert bewaren, uploaden en afronden. */
export async function vereisCorrectie(db: Db, actor: AdminActor, id: string, projectId: string, nu?: Date): Promise<AdminCorrectie> {
  const r = await vergrendelCorrectie(db, actor, id);
  if (r.projectId !== projectId || r.beeindigd || r.verloopt <= (nu ?? new Date())) throw maakFout(403, "Deze correctiesessie is verlopen of afgerond", "ADMIN_CORRECTIE_ONGELDIG");
  return dto(r);
}
export async function rondCorrectieAf(db: Db, actor: AdminActor, id: string, mutatieId: string): Promise<AdminCorrectie> {
  parseAdmin(z.uuid(), mutatieId);
  return db.transaction(async (tx) => {
    const r = await vergrendelCorrectie(tx, actor, id);
    const actie = "correctie.afgerond";
    const doel = { type: "project" as const, id: r.projectId, projectId: r.projectId, organisatieId: r.organisatieId };
    return voerAdminMutatieUit(tx, actor, { mutatieId, actie, doel, payload: { correctieId: id, sessieId: actor.sessieId } }, async (werk) => {
      if (r.beeindigd) return dto(r);
      const [na] = await werk.update(adminCorrecties).set({ beeindigd: new Date() }).where(eq(adminCorrecties.id, id)).returning();
      await schrijfAdminAudit(werk, actor, { doel, actie, reden: r.reden, voor: dto(r), na: dto(na!), correctieId: id });
      return dto(na!);
    });
  });
}
