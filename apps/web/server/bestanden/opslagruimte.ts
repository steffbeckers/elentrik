// De opslaglimiet per bedrijf (plan 12, punt 2): hoeveel bytes een organisatie aan bestanden mag
// bewaren. Het telt de bestanden van de levende projecten (plannen en exports) plus de logo's van
// het bedrijf; de prullenbak telt niet mee. De controle gebeurt vóór er iets geschreven wordt.
// Twee gelijktijdige uploads kunnen de limiet kort overschrijden; dat is aanvaard, er is geen lock.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { createError } from "h3";
import type { Db } from "../db";
import { bestanden, projecten } from "../db/schema";

/** De standaardlimiet: 5 GB per bedrijf. */
export const STANDAARD_OPSLAG_MB = 5120;

const BYTES_PER_MB = 1024 * 1024;

/**
 * De limiet in bytes: `ELENTRIK_OPSLAG_PER_BEDRIJF_MB` (een positief geheel aantal megabytes), of
 * 5 GB als de variabele ontbreekt of leeg is. Een andere waarde (0, negatief, geen geheel getal, te
 * groot voor een veilig geheel getal aan bytes) gooit een `Error` die alleen de naam van de variabele
 * noemt; de opstartcontrole (server/config/controle.ts) meldt die naam.
 */
export function opslagLimietBytes(env: Record<string, string | undefined> = process.env): number {
  const waarde = env.ELENTRIK_OPSLAG_PER_BEDRIJF_MB?.trim();
  if (waarde === undefined || waarde === "") return STANDAARD_OPSLAG_MB * BYTES_PER_MB;
  const bytes = /^[1-9]\d*$/.test(waarde) ? Number(waarde) * BYTES_PER_MB : Number.NaN;
  if (!Number.isSafeInteger(bytes)) throw new Error("ELENTRIK_OPSLAG_PER_BEDRIJF_MB is ongeldig");
  return bytes;
}

/**
 * De bytes die een organisatie nu gebruikt: de som van `bestanden.grootte` van de levende projecten
 * (plannen en exports) plus de logo's (bestanden zonder project met `organisatie_id`).
 */
export async function gebruikteOpslag(db: Db, organisatieId: string): Promise<number> {
  const [rij] = await db
    .select({ totaal: sql<string | number | bigint>`coalesce(sum(${bestanden.grootte}), 0)` })
    .from(bestanden)
    .leftJoin(projecten, eq(projecten.id, bestanden.projectId))
    .where(
      or(
        and(eq(projecten.organisatieId, organisatieId), isNull(projecten.verwijderd)),
        and(isNull(bestanden.projectId), eq(bestanden.organisatieId, organisatieId)),
      ),
    );
  return Number(rij?.totaal ?? 0);
}

/** Gooit 413 `OPSLAG_VOL` als `extraBytes` het bedrijf boven de limiet zou brengen. */
export async function controleerOpslagruimte(
  db: Db,
  organisatieId: string,
  extraBytes: number,
  limiet: number = opslagLimietBytes(),
): Promise<void> {
  if ((await gebruikteOpslag(db, organisatieId)) + extraBytes > limiet) {
    throw createError({ statusCode: 413, statusMessage: "Opslag vol", data: { code: "OPSLAG_VOL" } });
  }
}
