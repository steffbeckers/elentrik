import { count, desc } from "drizzle-orm";
import { z } from "zod";
import type { AdminPagina } from "../../shared/admin/basis";
import type { AdminInstance } from "../../shared/admin/instances";
import type { Db } from "../db";
import { instanceMeldingen } from "../db/schema";
import { parseAdmin } from "./invoer";

const PER_PAGINA = 50;
const STIL_NA_MS = 7 * 24 * 60 * 60 * 1000;
const QuerySchema = z.object({ pagina: z.coerce.number().int().min(1).max(1_000_000).default(1) });

export async function lijstInstances(db: Db, nu: Date, invoer: Record<string, unknown> = {}): Promise<AdminPagina<AdminInstance>> {
  const { pagina } = parseAdmin(QuerySchema, invoer);
  const [totaal] = await db.select({ n: count() }).from(instanceMeldingen);
  const rijen = await db.select().from(instanceMeldingen)
    .orderBy(desc(instanceMeldingen.laatsteMeldingOp), desc(instanceMeldingen.instanceId))
    .limit(PER_PAGINA).offset((pagina - 1) * PER_PAGINA);
  const items = rijen.map((r): AdminInstance => ({
    instanceId: r.instanceId, host: r.host, versie: r.versie, abonnementenAan: r.abonnementenAan,
    aantalOrganisaties: r.aantalOrganisaties, aantalGebruikers: r.aantalGebruikers,
    eersteMeldingOp: r.eersteMeldingOp.toISOString(), laatsteMeldingOp: r.laatsteMeldingOp.toISOString(),
    aantalMeldingen: r.aantalMeldingen, laatsteIp: r.laatsteIp, stil: nu.getTime() - r.laatsteMeldingOp.getTime() > STIL_NA_MS,
  }));
  return { items, totaal: totaal!.n, pagina, perPagina: PER_PAGINA };
}
