// Verwerkt een Stripe-gebeurtenis: synchroniseert de abonnementsrij met wat Stripe zegt, beeindigt
// een abonnement waarvan de eerste betaling mislukte en stuurt betaalde facturen door naar de
// boekhouding. Elke stap is idempotent: Stripe stuurt events opnieuw bij een fout.
//
// Er wordt niets uit de payload of de configuratie gelogd, alleen het type van een genegeerd event.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { eq } from "drizzle-orm";
import { createError, getRequestHeader, readRawBody, type H3Event } from "h3";
import { gebruikDb, type Db } from "../db";
import { abonnementen, stripeEvents } from "../db/schema";
import { stuurFactuurDoor } from "./boekhouding";
import { gebruikAbonnementen, type AbonnementConfig } from "./config";
import { leesWebhook, type Gebeurtenis, type StripePoort } from "./stripe";
import { synchroniseerKlant } from "./synchronisatie";

type Ingeschakeld = Extract<AbonnementConfig, { ingeschakeld: true }>;

const SYNCHRONISEER: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "checkout.session.async_payment_failed",
]);

/**
 * Een eerste betaling die mislukte: een SEPA-abonnement is bij Stripe al `active` terwijl de
 * betaling nog loopt, en zou zonder deze stap gratis gebruik tot de volgende verlenging geven.
 */
function mislukteEersteBetaling(g: Gebeurtenis): boolean {
  return (
    g.type === "checkout.session.async_payment_failed" ||
    (g.type === "invoice.payment_failed" && g.reden === "subscription_create")
  );
}

/** Een abonnement dat Stripe al beeindigd heeft, hoeft niet nog eens (dat gaf bij Stripe een fout). */
const AL_BEEINDIGD: ReadonlySet<string> = new Set(["canceled", "incomplete_expired"]);

async function klantBekend(db: Db, klantId: string): Promise<boolean> {
  const [rij] = await db
    .select({ id: abonnementen.id })
    .from(abonnementen)
    .where(eq(abonnementen.stripeKlantId, klantId));
  return rij !== undefined;
}

async function beeindig(stripe: StripePoort, klantId: string | null, abonnementId: string): Promise<void> {
  if (klantId) {
    const bestaand = (await stripe.abonnementenVanKlant(klantId)).find((a) => a.id === abonnementId);
    if (bestaand && AL_BEEINDIGD.has(bestaand.status)) return;
  }
  await stripe.beeindigAbonnement(abonnementId);
}

export async function verwerkGebeurtenis(
  db: Db,
  stripe: StripePoort,
  config: Ingeschakeld,
  g: Gebeurtenis,
): Promise<void> {
  if (!SYNCHRONISEER.has(g.type)) {
    console.info("Stripe-webhook: onbekend type genegeerd", { type: g.type });
    return;
  }

  // Alleen een klant die bij een organisatie hoort, is van Elentrik: voor een onbekende of
  // ontbrekende klant gebeurt er niets (200, genegeerd), ook geen doorsturen van de factuur.
  if (!g.klantId) {
    console.info("Stripe-webhook: event zonder klant genegeerd", { type: g.type });
    return;
  }
  if (mislukteEersteBetaling(g) && g.abonnementId && (await klantBekend(db, g.klantId))) {
    await beeindig(stripe, g.klantId, g.abonnementId);
  }
  const resultaat = await synchroniseerKlant(db, stripe, config.prijzen, g.klantId);
  if (resultaat === "onbekend") {
    console.info("Stripe-webhook: onbekende klant genegeerd", { type: g.type });
    return;
  }

  if (g.type === "invoice.paid" && g.objectId) {
    await stuurFactuurDoor(db, stripe, config.boekhoudingInbox, g.objectId);
  }
}

function httpFout(statusCode: number, statusMessage: string) {
  return createError({ statusCode, statusMessage });
}

/**
 * `POST /api/stripe/webhook`. Leest de ruwe body (de handtekening geldt voor de exacte bytes) en
 * controleert die met STRIPE_WEBHOOK_GEHEIM: ongeldig is 400 en er verandert niets. Een event-id dat
 * al verwerkt is, krijgt 200. Anders wordt het verwerkt en pas daarna vastgelegd; een fout geeft 500
 * zonder vastlegging, zodat Stripe het event opnieuw stuurt. Abonnementen uit, of zonder
 * webhookgeheim: 404.
 *
 * Nergens komt de payload, het geheim of het inboxadres in een log of foutmelding terecht: ook een
 * fout van de SMTP-server kan het adres bevatten, dus bij een fout loggen we alleen type en id.
 */
export async function webhookRoute(event: H3Event): Promise<{ ontvangen: true }> {
  const { config, stripe } = gebruikAbonnementen();
  if (!config.ingeschakeld || !stripe || !config.webhookGeheim) throw httpFout(404, "Niet gevonden");

  const handtekening = getRequestHeader(event, "stripe-signature");
  const rauw = await readRawBody(event, "utf8");
  if (!handtekening || !rauw) throw httpFout(400, "Ongeldige handtekening");

  let g: Gebeurtenis;
  try {
    g = leesWebhook(rauw, handtekening, config.webhookGeheim);
  } catch {
    throw httpFout(400, "Ongeldige handtekening");
  }

  const db = gebruikDb();
  const [gezien] = await db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.id, g.id));
  if (gezien) return { ontvangen: true };

  try {
    await verwerkGebeurtenis(db, stripe, config, g);
    await db.insert(stripeEvents).values({ id: g.id }).onConflictDoNothing();
  } catch (oorzaak) {
    console.error("Stripe-webhook: verwerken mislukt", {
      type: g.type,
      id: g.id,
      soort: oorzaak instanceof Error ? oorzaak.name : typeof oorzaak,
    });
    throw httpFout(500, "Verwerken mislukt");
  }
  return { ontvangen: true };
}
