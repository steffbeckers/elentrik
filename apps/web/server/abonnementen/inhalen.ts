// De uurlijkse inhaaltaak: wat Stripe-webhooks gemist hebben, alsnog binnenhalen.
//
// 1. Abonnementsrijen met status active, trialing of past_due waarvan de periode meer dan 1 dag
//    voorbij is, of die langer dan 24 uur niet bijgewerkt zijn, worden opnieuw gesynchroniseerd.
// 2. Betaalde facturen van de laatste 7 dagen die nog niet naar de boekhouding gingen, worden
//    alsnog doorgestuurd (`stuurFactuurDoor` is idempotent).
//
// Dubbel werk is ongevaarlijk (beide stappen zijn idempotent), maar twee instanties tegelijk
// zouden dezelfde Stripe-aanroepen dubbel doen. Daarom neemt de run een advisory lock.
//
// Keuze van het lock: `pg_try_advisory_xact_lock` binnen een transactie die de hele run omvat. Een
// sessielock (`pg_try_advisory_lock`) hoort bij één databaseverbinding, en postgres-js geeft elke
// query aan een willekeurige verbinding uit de pool: lock en unlock konden zo op verschillende
// verbindingen belanden en het lock bleef dan hangen. Een transactie zit vast aan één verbinding en
// het lock valt automatisch weg bij commit, rollback of een gestorven proces. De werkzaamheden
// lopen daarom op de transactie (`tx`): de rijlocks van `synchroniseerKlant` blijven tot het einde
// van de run staan, wat voor een uurlijkse taak met een handvol klanten volstaat.
//
// Er komt niets uit de configuratie of uit foutmeldingen in de logs: alleen klant- of factuur-id's
// en de soort fout.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { and, inArray, lt, or, sql } from "drizzle-orm";
import type { Db, Tx } from "../db";
import { abonnementen } from "../db/schema";
import { stuurFactuurDoor } from "./boekhouding";
import type { AbonnementConfig } from "./config";
import type { StripePoort } from "./stripe";
import { synchroniseerKlant } from "./synchronisatie";

const DAG_MS = 24 * 3600 * 1000;

/** Hoe ver terug betaalde facturen alsnog doorgestuurd worden. */
const FACTUREN_TERUG_MS = 7 * DAG_MS;

const STATUSSEN = ["active", "trialing", "past_due"];

export type InhaalResultaat = { gesynchroniseerd: number; doorgestuurd: number };

/** Neemt het lock voor de inhaaltaak tot het einde van de transactie; `false` als het bezet is. */
export async function neemInhaalLock(tx: Tx): Promise<boolean> {
  const antwoord: unknown = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext('abonnementen:inhalen')) as genomen`);
  // postgres-js geeft de rijen zelf, PGlite een object met `rows`.
  const rijen = (Array.isArray(antwoord) ? antwoord : (antwoord as { rows: unknown[] }).rows) as { genomen: boolean }[];
  return rijen[0]?.genomen === true;
}

function soort(fout: unknown): string {
  return fout instanceof Error ? fout.name : "onbekend";
}

async function synchroniseerAchterstallige(
  tx: Tx,
  stripe: StripePoort,
  prijzen: { maand: string; jaar: string },
  nu: Date,
): Promise<number> {
  const rijen = await tx
    .select({ klantId: abonnementen.stripeKlantId })
    .from(abonnementen)
    .where(
      and(
        inArray(abonnementen.status, STATUSSEN),
        or(
          lt(abonnementen.periodeEinde, new Date(nu.getTime() - DAG_MS)),
          lt(abonnementen.bijgewerkt, new Date(nu.getTime() - DAG_MS)),
        ),
      ),
    );

  let gesynchroniseerd = 0;
  for (const { klantId } of rijen) {
    try {
      if ((await synchroniseerKlant(tx, stripe, prijzen, klantId, nu)) === "bijgewerkt") gesynchroniseerd++;
    } catch (fout) {
      console.error("Inhaaltaak: synchroniseren mislukt", { klantId, fout: soort(fout) });
    }
  }
  return gesynchroniseerd;
}

async function stuurGemisteFacturen(
  tx: Tx,
  stripe: StripePoort,
  inbox: string,
  nu: Date,
): Promise<number> {
  let facturen;
  try {
    facturen = await stripe.betaaldeFacturen(new Date(nu.getTime() - FACTUREN_TERUG_MS));
  } catch (fout) {
    console.error("Inhaaltaak: facturen ophalen mislukt", { fout: soort(fout) });
    return 0;
  }
  if (facturen.length === 0) return 0;

  // Alleen facturen van klanten van Elentrik (een rij in `abonnementen`) gaan naar de boekhouding;
  // de webhook doet dezelfde controle, `stuurFactuurDoor` zelf niet.
  const klanten = [...new Set(facturen.map((f) => f.klantId).filter((k) => k !== ""))];
  if (klanten.length === 0) return 0;
  const bekend = new Set(
    (
      await tx
        .select({ klantId: abonnementen.stripeKlantId })
        .from(abonnementen)
        .where(inArray(abonnementen.stripeKlantId, klanten))
    ).map((r) => r.klantId),
  );

  let doorgestuurd = 0;
  for (const factuur of facturen) {
    if (!bekend.has(factuur.klantId)) continue;
    try {
      if ((await stuurFactuurDoor(tx, stripe, inbox, factuur.id)) === "verstuurd") doorgestuurd++;
    } catch (fout) {
      console.error("Inhaaltaak: factuur doorsturen mislukt", { factuurId: factuur.id, fout: soort(fout) });
    }
  }
  return doorgestuurd;
}

/**
 * Haalt gemiste meldingen in. Zonder abonnementen, of als een andere run het lock heeft:
 * `{ gesynchroniseerd: 0, doorgestuurd: 0 }` zonder werk of Stripe-aanroepen. Een fout bij een
 * klant of factuur wordt gelogd en stopt de rest niet; de volgende run probeert het opnieuw.
 *
 * `lock` is alleen voor tests: PGlite heeft één sessie, waarin een advisory lock altijd opnieuw
 * te nemen is, dus een bezet lock is er niet echt na te bootsen.
 */
export async function haalGemisteMeldingenIn(
  db: Db,
  stripe: StripePoort,
  config: AbonnementConfig,
  nu: Date = new Date(),
  lock: (tx: Tx) => Promise<boolean> = neemInhaalLock,
): Promise<InhaalResultaat> {
  if (!config.ingeschakeld) return { gesynchroniseerd: 0, doorgestuurd: 0 };

  return db.transaction(async (tx) => {
    if (!(await lock(tx))) return { gesynchroniseerd: 0, doorgestuurd: 0 };
    const gesynchroniseerd = await synchroniseerAchterstallige(tx, stripe, config.prijzen, nu);
    const doorgestuurd = config.boekhoudingInbox
      ? await stuurGemisteFacturen(tx, stripe, config.boekhoudingInbox, nu)
      : 0;
    return { gesynchroniseerd, doorgestuurd };
  });
}
