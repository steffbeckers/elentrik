// De eenmalige overname van de lokale gegevens van vóór het inloggen door de eerste organisatie.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db";
import { bedrijfsinstellingen, bestanden, projecten } from "../db/schema";

/** De rij met de bedrijfsgegevens van vóór de organisaties. */
export const LEGACY_BEDRIJF_ID = 1;

export interface OvernameOpties {
  /**
   * Alleen voor tests: loopt binnen de transactie, nadat de projecten gekoppeld zijn en vóór de
   * bedrijfsgegevens. Een fout hier rolt de hele overname terug.
   */
  tussenstap?: (tx: Db) => Promise<void>;
}

export interface Overname {
  projecten: number;
  bedrijfsgegevens: boolean;
}

/**
 * Koppelt in één transactie alle projecten zonder organisatie, en de bedrijfsgegevens van vóór
 * de organisaties (rij `id = 1` zonder organisatie) met hun logo, aan `organisatieId`. Snapshots,
 * exports en plan- en exportbestanden volgen via hun project. De bedrijfsgegevens zelf blijven
 * ongewijzigd (spec 5b.6).
 *
 * Idempotent: wat al een organisatie heeft, blijft staan; een tweede aanroep geeft
 * `{ projecten: 0, bedrijfsgegevens: false }`.
 */
export async function neemBestaandeGegevensOver(
  db: Db,
  organisatieId: string,
  opties: OvernameOpties = {},
): Promise<Overname> {
  return db.transaction(async (tx) => {
    // Twee gelijktijdige overnames lopen na elkaar; de tweede vindt dan niets meer.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('elentrik:overname'))`);

    const gekoppeld = await tx
      .update(projecten)
      .set({ organisatieId })
      .where(isNull(projecten.organisatieId))
      .returning({ id: projecten.id });

    await opties.tussenstap?.(tx);

    // Heeft de organisatie al eigen bedrijfsgegevens, dan blijft de legacy-rij staan (de unieke
    // sleutel laat geen tweede rij per organisatie toe).
    const [eigen] = await tx
      .select({ id: bedrijfsinstellingen.id })
      .from(bedrijfsinstellingen)
      .where(eq(bedrijfsinstellingen.organisatieId, organisatieId));
    const [legacy] = eigen
      ? []
      : await tx
          .update(bedrijfsinstellingen)
          .set({ organisatieId })
          .where(and(eq(bedrijfsinstellingen.id, LEGACY_BEDRIJF_ID), isNull(bedrijfsinstellingen.organisatieId)))
          .returning({ installateur: bedrijfsinstellingen.installateur });

    const logoId = legacy?.installateur.logoBestandId;
    if (logoId) {
      await tx
        .update(bestanden)
        .set({ organisatieId })
        .where(and(eq(bestanden.id, logoId), eq(bestanden.soort, "logo"), isNull(bestanden.organisatieId)));
    }

    return { projecten: gekoppeld.length, bedrijfsgegevens: legacy !== undefined };
  });
}
