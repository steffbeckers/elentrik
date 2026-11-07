import { migreer } from "@elentrik/model";
import { eq, gt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { AdminRevisie } from "../../shared/admin/projecten";
import type { Db } from "../db";
import { adminRevisies } from "../db/schema";
import { nietGevondenFout } from "../fouten";

/** Zelfde conservatieve UUID-scan als de bestaande opruimtaak; hoogstens 100 revisies tegelijk. */
export async function auditBestandVerwijzingen(
  db: Db,
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  let na: string | undefined;
  for (;;) {
    const rows: Array<
      Pick<typeof adminRevisies.$inferSelect, "id" | "voor" | "na">
    > = await db
      .select({
        id: adminRevisies.id,
        voor: adminRevisies.voor,
        na: adminRevisies.na,
      })
      .from(adminRevisies)
      .where(na ? gt(adminRevisies.id, na) : undefined)
      .orderBy(adminRevisies.id)
      .limit(100);
    for (const r of rows)
      for (const id of JSON.stringify([r.voor, r.na]).matchAll(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      )) {
        const sleutel = id[0].toLowerCase();
        const refs = result.get(sleutel) ?? new Set<string>();
        refs.add(`audit:${r.id}`);
        result.set(sleutel, refs);
      }
    if (rows.length < 100) return result;
    na = rows.at(-1)!.id;
  }
}

/** Verwijzingstest zonder documentpayload naar de caller te sturen; een bestand telt slechts één keer. */
export function isAuditBestand(id: AnyPgColumn) {
  return sql<boolean>`exists(select 1 from ${adminRevisies} where
    lower(${adminRevisies.voor}::text || ${adminRevisies.na}::text) like ('%' || lower(${id}::text) || '%'))`;
}
/** Alleen bij het vastleggen van revisies en de laatste, destructieve opruimstap. */
export async function vergrendelAuditBestanden(db: Db): Promise<void> {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('admin:revisiebestanden'))`,
  );
}
export async function haalAdminRevisie(
  db: Db,
  id: string,
): Promise<AdminRevisie> {
  if (!z.uuid().safeParse(id).success) throw nietGevondenFout();
  const [r] = await db
    .select()
    .from(adminRevisies)
    .where(eq(adminRevisies.id, id));
  if (!r) throw nietGevondenFout();
  // Read a migrated copy; the original historical JSON remains authoritative evidence.
  return {
    ...r,
    voor: { ...r.voor, document: migreer(r.voor.document) },
    na: { ...r.na, document: migreer(r.na.document) },
    tijd: r.tijd.toISOString(),
  };
}
