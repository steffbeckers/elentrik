// De ontvangende kant van de instance-ping (alleen op elentrik.app): de limiet per sleutel, het
// opslaan met een dagplafond en het opruimen na een jaar.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { count, eq, gte, lt, sql } from "drizzle-orm";
import type { InstanceMelding } from "../../shared/instance";
import type { Db } from "../db";
import { instanceMeldingen } from "../db/schema";

/** Het aantal nieuwe instance-id's per UTC-dag dat we opslaan. */
export const DAGPLAFOND = 100;
/** Een rij blijft zo veel dagen na de laatste melding bewaard. */
export const BEWAARDAGEN = 365;

const DAG_MS = 24 * 3600 * 1000;

/** `true` betekent toegelaten. */
export type Limiet = (sleutel: string, nu: number) => boolean;

/** Het hoogste aantal sleutels dat de limiet tegelijk bijhoudt; daarboven weigert ze een nieuwe sleutel. */
export const MAX_SLEUTELS = 10_000;
const OPRUIMING_MS = 60_000;

/**
 * Een schuivend venster per sleutel: hooguit `max` toegelaten aanroepen per `vensterMs`. Elke
 * aanroep wist alleen de oude tijdstippen van de eigen sleutel; de hele map wordt hooguit eens per
 * minuut geveegd. Met `MAX_SLEUTELS` sleutels in de map krijgt een nieuwe sleutel `false`.
 */
export function maakLimiet(max = 10, vensterMs = 3_600_000): Limiet {
  const tijdstippen = new Map<string, number[]>();
  let laatsteVeeg = -Infinity;
  return (sleutel, nu) => {
    if (nu - laatsteVeeg >= OPRUIMING_MS) {
      laatsteVeeg = nu;
      for (const [s, lijst] of tijdstippen) {
        if (lijst[lijst.length - 1]! <= nu - vensterMs) tijdstippen.delete(s);
      }
    }
    const bestaand = tijdstippen.get(sleutel);
    if (!bestaand && tijdstippen.size >= MAX_SLEUTELS) return false;
    const lijst = (bestaand ?? []).filter((t) => t > nu - vensterMs);
    if (lijst.length >= max) {
      tijdstippen.set(sleutel, lijst);
      return false;
    }
    lijst.push(nu);
    tijdstippen.set(sleutel, lijst);
    return true;
  };
}

// De dag (UTC) waarvoor al een waarschuwing over het plafond gelogd is.
let gewaarschuwdOp: string | null = null;

function beginVanUtcDag(nu: Date): Date {
  return new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate()));
}

/**
 * Slaat een melding op. Een bekende id wordt altijd bijgewerkt; een nieuwe id alleen als er op de
 * UTC-dag van `nu` nog geen `DAGPLAFOND` nieuwe id's bijkwamen (anders `plafond`).
 */
export async function slaMeldingOp(
  db: Db,
  melding: InstanceMelding,
  ip: string | null,
  nu: Date,
): Promise<"nieuw" | "bijgewerkt" | "plafond"> {
  const velden = {
    host: melding.host,
    versie: melding.versie,
    abonnementenAan: melding.abonnementenAan,
    aantalOrganisaties: melding.aantalOrganisaties,
    aantalGebruikers: melding.aantalGebruikers,
    laatsteMeldingOp: nu,
    laatsteIp: ip,
  };
  return db.transaction(async (tx) => {
    const bijgewerkt = await tx
      .update(instanceMeldingen)
      .set({ ...velden, aantalMeldingen: sql`${instanceMeldingen.aantalMeldingen} + 1` })
      .where(eq(instanceMeldingen.instanceId, melding.instanceId))
      .returning({ id: instanceMeldingen.instanceId });
    if (bijgewerkt.length > 0) return "bijgewerkt";

    const [teller] = await tx
      .select({ aantal: count() })
      .from(instanceMeldingen)
      .where(gte(instanceMeldingen.eersteMeldingOp, beginVanUtcDag(nu)));
    if ((teller?.aantal ?? 0) >= DAGPLAFOND) {
      const dag = nu.toISOString().slice(0, 10);
      if (gewaarschuwdOp !== dag) {
        gewaarschuwdOp = dag;
        console.warn(`Instance-ping: het dagplafond van ${DAGPLAFOND} nieuwe instances is bereikt (${dag}).`);
      }
      return "plafond";
    }

    // Een gelijktijdige melding met dezelfde nieuwe id geeft hier geen fout: ze werkt de rij bij.
    const [rij] = await tx
      .insert(instanceMeldingen)
      .values({ instanceId: melding.instanceId, ...velden, eersteMeldingOp: nu })
      .onConflictDoUpdate({
        target: instanceMeldingen.instanceId,
        set: { ...velden, aantalMeldingen: sql`${instanceMeldingen.aantalMeldingen} + 1` },
      })
      .returning({ aantal: instanceMeldingen.aantalMeldingen });
    return rij?.aantal === 1 ? "nieuw" : "bijgewerkt";
  });
}

/** Wist de meldingen waarvan de laatste ouder is dan `BEWAARDAGEN`; geeft het aantal gewiste rijen. */
export async function ruimInstanceMeldingenOp(db: Db, nu: Date): Promise<number> {
  const grens = new Date(nu.getTime() - BEWAARDAGEN * DAG_MS);
  const gewist = await db
    .delete(instanceMeldingen)
    .where(lt(instanceMeldingen.laatsteMeldingOp, grens))
    .returning({ id: instanceMeldingen.instanceId });
  return gewist.length;
}
