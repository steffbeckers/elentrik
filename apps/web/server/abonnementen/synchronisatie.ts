// Synchroniseert de abonnementsrij van een Stripe-klant met wat Stripe zegt. Stripe is de bron
// van waarheid: bij elke aanroep wordt de toestand opnieuw gelezen, zodat volgorde en herhaling
// van events er niet toe doen.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { abonnementen } from "../db/schema";
import { leesStatus } from "./repo";
import type { StripePoort } from "./stripe";
import { kiesGevolgdAbonnement } from "./toegang";

/**
 * Leest de abonnementen van de klant bij Stripe, kiest het levendigste (`kiesGevolgdAbonnement`)
 * en schrijft het weg. `"onbekend"` als de klant bij geen organisatie hoort (dan gebeurt er niets).
 * `achterstalligSinds` wordt `nu` bij de eerste `past_due` en blijft staan zolang die status duurt;
 * bij elke andere status is het null.
 */
export async function synchroniseerKlant(
  db: Db,
  stripe: StripePoort,
  prijzen: { maand: string; jaar: string },
  klantId: string,
  nu: Date = new Date(),
): Promise<"bijgewerkt" | "onbekend"> {
  const [bekend] = await db
    .select({ id: abonnementen.id })
    .from(abonnementen)
    .where(eq(abonnementen.stripeKlantId, klantId));
  if (!bekend) return "onbekend";

  // De rij vergrendelen en pas daarna bij Stripe lezen: overlappende synchronisaties van één klant
  // lopen zo na elkaar en de laatste leest de laatste stand (ook zetten ze `achterstalligSinds`
  // niet allebei). Binnen een transactie van de aanroeper (startCheckout) is dit een savepoint.
  return db.transaction(async (tx) => {
    const [rij] = await tx.select().from(abonnementen).where(eq(abonnementen.id, bekend.id)).for("update");
    if (!rij) return "onbekend";
    const { gevolgd, dubbel } = kiesGevolgdAbonnement(await stripe.abonnementenVanKlant(klantId));
    if (dubbel) console.warn("dubbel abonnement", { organisatieId: rij.organisatieId });

    const achterstallig = gevolgd?.status === "past_due";
    const blijft = achterstallig && leesStatus(rij.status) === "past_due" && rij.achterstalligSinds !== null;
    await tx
      .update(abonnementen)
      .set({
        stripeAbonnementId: gevolgd?.id ?? null,
        status: gevolgd?.status ?? null,
        formule:
          gevolgd?.prijsId === prijzen.maand ? "maand" : gevolgd?.prijsId === prijzen.jaar ? "jaar" : null,
        periodeEinde: gevolgd?.periodeEinde ?? null,
        opgezegdOpPeriodeEinde: gevolgd?.opgezegdOpPeriodeEinde ?? false,
        achterstalligSinds: achterstallig ? (blijft ? rij.achterstalligSinds : nu) : null,
        bijgewerkt: nu,
      })
      .where(eq(abonnementen.id, rij.id));
    return "bijgewerkt";
  });
}
