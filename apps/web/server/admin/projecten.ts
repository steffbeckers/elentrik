import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db } from "../db";
import { adminRevisies } from "../db/schema";
import { haalProject, bewaarProject } from "../projecten/repo";
import { nietGevondenFout } from "../fouten";
import { BewaarProjectSchema, metProjectFouten } from "../utils/projecten";
import { schrijfAdminAudit } from "./audit";
import { levendAdminProject, vereisCorrectie } from "./correcties";
import { parseAdmin } from "./invoer";
import { voerAdminMutatieUit } from "./mutaties";
import type { AdminActor } from "./toegang";
import { vergrendelAuditBestanden } from "./revisies";

export const BewaarAdminProjectSchema = BewaarProjectSchema.extend({ correctieId: z.uuid(), mutatieId: z.uuid() }).strict();
export async function haalAdminDocument(db: Db, id: string) {
  const project = await levendAdminProject(db, id);
  const result = await haalProject(db, project.organisatieId, id);
  if (!result) throw nietGevondenFout();
  return result;
}
export async function bewaarAdminProject(db: Db, actor: AdminActor, projectId: string, versie: number, invoer: unknown): Promise<{ versie: number }> {
  const i = parseAdmin(BewaarAdminProjectSchema, invoer);
  parseAdmin(z.number().int().min(0).max(2147483647), versie);
  return db.transaction(async (tx) => {
    const correctie = await vereisCorrectie(tx, actor, i.correctieId, projectId);
    const doel = { type: "project" as const, id: projectId, projectId, organisatieId: correctie.organisatieId };
    const actie = "project.bewaard";
    return voerAdminMutatieUit(tx, actor, { mutatieId: i.mutatieId, actie, doel, payload: { ...i, versie } }, async (werk) => {
      await vergrendelAuditBestanden(werk);
      return metProjectFouten(() => bewaarProject(werk, correctie.organisatieId, projectId, versie, i, async (auditTx, voor, na) => {
        const revisieId = randomUUID();
        const auditId = await schrijfAdminAudit(auditTx, actor, { doel, actie, reden: correctie.reden, correctieId: correctie.id,
          voor: { naam: voor.naam, versie: voor.versie, revisieId }, na: { naam: na.naam, versie: na.versie, revisieId } });
        await auditTx.insert(adminRevisies).values({ id: revisieId, projectId, organisatieId: correctie.organisatieId, correctieId: correctie.id, auditId, voor, na });
      }));
    });
  });
}
