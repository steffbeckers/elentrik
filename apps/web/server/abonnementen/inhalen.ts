// De uurlijkse inhaaltaak: wat Stripe-webhooks gemist hebben, alsnog binnenhalen.
//
// 1. Abonnementsrijen met status active, trialing of past_due waarvan de periode meer dan 1 dag
//    voorbij is, of die langer dan 24 uur niet bijgewerkt zijn, worden opnieuw gesynchroniseerd.
// 2. Betaalde facturen van de laatste 7 dagen die nog niet naar de boekhouding gingen, worden
//    alsnog doorgestuurd (`stuurFactuurDoor` is idempotent).
//
// Dubbel werk is ongevaarlijk (beide stappen zijn idempotent), maar twee instanties tegelijk
// zouden dezelfde Stripe-aanroepen dubbel doen. Daarom houdt de run een advisory lock.
//
// Het lock (server/taken/lock.ts) staat los van het werk. Het is een sessielock op een
// gereserveerde verbinding. Het werk loopt op de gewone `db`, dus elke
// `synchroniseerKlant` en elke `stuurFactuurDoor` commit voor zichzelf. Zo is een claim in
// `doorgestuurde_facturen` meteen definitief, ook als de run later sneuvelt (stoppen, herstart,
// verbroken verbinding): een mail die al weg is, gaat nooit een tweede keer, en rijlocks worden
// niet langer vastgehouden dan nodig. Valt de gereserveerde verbinding weg, dan laat de server het
// lock los.
//
// Er komt niets uit de configuratie of uit foutmeldingen in de logs: alleen klant- of factuur-id's
// en de soort fout.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { and, inArray, lt, or } from "drizzle-orm";
import type postgres from "postgres";
import { gebruikPostgres, type Db } from "../db";
import { abonnementen } from "../db/schema";
import { geplandeTakenAan, maakPostgresLock, type MetLock } from "../taken/lock";
import { stuurFactuurDoor } from "./boekhouding";
import type { AbonnementConfig } from "./config";
import type { StripePoort } from "./stripe";
import { synchroniseerKlant } from "./synchronisatie";

const DAG_MS = 24 * 3600 * 1000;

/** Hoe ver terug betaalde facturen alsnog doorgestuurd worden. */
const FACTUREN_TERUG_MS = 7 * DAG_MS;

const STATUSSEN = ["active", "trialing", "past_due"];

export type InhaalResultaat = { gesynchroniseerd: number; doorgestuurd: number };

const LOCK = "abonnementen:inhalen";

/** Het lock van de inhaaltaak; zie server/taken/lock.ts. */
export function postgresLock(client: Pick<postgres.Sql, "reserve">): MetLock {
  return maakPostgresLock(client, LOCK);
}

export { geplandeTakenAan, type MetLock };

function soort(fout: unknown): string {
  return fout instanceof Error ? fout.name : "onbekend";
}

async function synchroniseerAchterstallige(
  db: Db,
  stripe: StripePoort,
  prijzen: { maand: string; jaar: string },
  nu: Date,
): Promise<number> {
  const rijen = await db
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
      if ((await synchroniseerKlant(db, stripe, prijzen, klantId, nu)) === "bijgewerkt") gesynchroniseerd++;
    } catch (fout) {
      console.error("Inhaaltaak: synchroniseren mislukt", { klantId, fout: soort(fout) });
    }
  }
  return gesynchroniseerd;
}

async function stuurGemisteFacturen(
  db: Db,
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
      await db
        .select({ klantId: abonnementen.stripeKlantId })
        .from(abonnementen)
        .where(inArray(abonnementen.stripeKlantId, klanten))
    ).map((r) => r.klantId),
  );

  let doorgestuurd = 0;
  for (const factuur of facturen) {
    if (!bekend.has(factuur.klantId)) continue;
    try {
      if ((await stuurFactuurDoor(db, stripe, inbox, factuur.id)) === "verstuurd") doorgestuurd++;
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
 * Een fout in de lockverbinding zelf gooit; wat dan al klaar was, is al vastgelegd.
 */
export async function haalGemisteMeldingenIn(
  db: Db,
  stripe: StripePoort,
  config: AbonnementConfig,
  nu: Date = new Date(),
  metLock: MetLock = (werk) => postgresLock(gebruikPostgres())(werk),
): Promise<InhaalResultaat> {
  if (!config.ingeschakeld) return { gesynchroniseerd: 0, doorgestuurd: 0 };

  const resultaat: InhaalResultaat = { gesynchroniseerd: 0, doorgestuurd: 0 };
  const uitgevoerd = await metLock(async () => {
    resultaat.gesynchroniseerd = await synchroniseerAchterstallige(db, stripe, config.prijzen, nu);
    if (config.boekhoudingInbox) {
      resultaat.doorgestuurd = await stuurGemisteFacturen(db, stripe, config.boekhoudingInbox, nu);
    }
  });
  return uitgevoerd ? resultaat : { gesynchroniseerd: 0, doorgestuurd: 0 };
}
