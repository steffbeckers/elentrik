import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { AdminAuditDoel } from "../../shared/admin/audit";
import type { Db, Tx } from "../db";
import { adminMutaties } from "../db/schema";
import { maakFout } from "../fouten";
import type { AdminActor } from "./toegang";

function canoniek(waarde: unknown): unknown {
  if (waarde instanceof Date) return waarde.toISOString();
  if (Array.isArray(waarde)) return waarde.map(canoniek);
  if (waarde !== null && typeof waarde === "object") {
    return Object.fromEntries(Object.entries(waarde).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canoniek(v)]));
  }
  return waarde;
}

export function versieToken(waarde: unknown): string {
  return createHash("sha256").update(JSON.stringify(canoniek(waarde)) ?? "null").digest("hex");
}

export function eisAdminVersie(verwacht: string, huidig: unknown): void {
  if (verwacht !== versieToken(huidig)) throw maakFout(409, "De gegevens zijn intussen gewijzigd", "ADMIN_GEWIJZIGD");
}

/** Alleen na vereisSuperuser; ook herhaalde HTTP-verzoeken passeren die actuele controle. */
export async function voerAdminMutatieUit<T>(
  db: Db, actor: AdminActor,
  invoer: { mutatieId: string; actie: string; doel: AdminAuditDoel; payload: unknown },
  werk: (tx: Tx) => Promise<T>,
): Promise<T> {
  const vingerafdruk = versieToken({ actie: invoer.actie, doel: invoer.doel, payload: invoer.payload });
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`admin:${actor.id}:${invoer.mutatieId}`}))`);
    const [vorig] = await tx.select().from(adminMutaties)
      .where(and(eq(adminMutaties.actorId, actor.id), eq(adminMutaties.mutatieId, invoer.mutatieId)));
    if (vorig) {
      if (vorig.vingerafdruk !== vingerafdruk) throw maakFout(409, "Deze wijzigingscode werd al anders gebruikt", "ADMIN_MUTATIE_CONFLICT");
      return vorig.antwoord as T;
    }
    const antwoord = await werk(tx);
    await tx.insert(adminMutaties).values({ actorId: actor.id, mutatieId: invoer.mutatieId,
      actie: invoer.actie, doelId: invoer.doel.id, vingerafdruk, antwoord });
    return antwoord;
  });
}
