// De logica achter /api/abonnement: het overzicht, een Checkout-sessie starten, het klantenportaal
// openen en na Checkout synchroniseren. Stripe is de bron van waarheid; de routes zelf zijn dun.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { eq, sql } from "drizzle-orm";
import { createError, type H3Event } from "h3";
import { z } from "zod";
import {
  ABONNEMENT_BESTAAT,
  ABONNEMENTEN_UIT,
  GEEN_KLANT,
  type AbonnementOverzicht,
  type AbonnementStatus,
  type Formule,
  type Prijs,
} from "../../shared/abonnement";
import type { Foutcode } from "../../shared/foutcodes";
import type { Taal } from "../../shared/taal";
import { basisUrl } from "../auth/oorsprong";
import { gebruikDb, type Db } from "../db";
import { nietGevondenFout } from "../fouten";
import { abonnementen, organization } from "../db/schema";
import { leesGebruikerstaal } from "../gebruikers/taal";
import { leesBody } from "../utils/projecten";
import { vereisLid } from "../utils/toegang";
import { gebruikAbonnementen, type AbonnementConfig } from "./config";
import { haalAbonnementRij, leesStatus, toegangVoor } from "./repo";
import type { StripePoort } from "./stripe";
import { synchroniseerKlant } from "./synchronisatie";

/** `trial_end` alleen als de proefperiode nog meer dan zoveel uur loopt (Stripe eist een marge). */
export const TRIAL_MARGE_UUR = 48;
/** Hoe lang een prijs uit Stripe in het geheugen blijft. */
export const PRIJS_CACHE_MS = 600_000;

const UUR_MS = 3600 * 1000;

/** Bij deze statussen bestaat er al een abonnement: een nieuwe Checkout zou dubbel laten betalen. */
const BLOKKEERT_CHECKOUT: ReadonlySet<AbonnementStatus> = new Set([
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

type Ingeschakeld = { config: Extract<AbonnementConfig, { ingeschakeld: true }>; stripe: StripePoort };

/** Een h3-fout met altijd een code uit FOUTCODES (test/foutcodes.test.ts dwingt het af). */
function fout(statusCode: number, statusMessage: string, code: Foutcode) {
  return createError({ statusCode, statusMessage, data: { code } });
}

/** De configuratie en Stripe-poort, of 409 `ABONNEMENTEN_UIT`. */
function eisIngeschakeld(): Ingeschakeld {
  const { config, stripe } = gebruikAbonnementen();
  if (!config.ingeschakeld || !stripe) throw fout(409, "Betalen is nog niet ingesteld", ABONNEMENTEN_UIT);
  return { config, stripe };
}

// --- Prijzen ---------------------------------------------------------------------------------

// Per Stripe-poort, zodat een andere poort (een test) nooit prijzen van een vorige overneemt.
const prijsCaches = new WeakMap<StripePoort, Map<string, { prijs: Prijs; tot: number }>>();

async function haalPrijs(stripe: StripePoort, prijsId: string, nu: number): Promise<Prijs> {
  let cache = prijsCaches.get(stripe);
  if (!cache) prijsCaches.set(stripe, (cache = new Map()));
  const bewaard = cache.get(prijsId);
  if (bewaard && nu < bewaard.tot) return bewaard.prijs;
  const { bedrag, munt, interval } = await stripe.haalPrijs(prijsId);
  const prijs: Prijs = { bedrag, munt, interval };
  cache.set(prijsId, { prijs, tot: nu + PRIJS_CACHE_MS });
  return prijs;
}

/** De prijzen van beide formules, of null als Stripe ze niet geeft: de pagina blijft dan werken. */
async function haalPrijzen(
  { config, stripe }: Ingeschakeld,
  nu: number,
): Promise<{ maand: Prijs; jaar: Prijs } | null> {
  try {
    const [maand, jaar] = await Promise.all([
      haalPrijs(stripe, config.prijzen.maand, nu),
      haalPrijs(stripe, config.prijzen.jaar, nu),
    ]);
    return { maand, jaar };
  } catch {
    return null;
  }
}

// --- Overzicht -------------------------------------------------------------------------------

/** Het overzicht van een organisatie, zonder Stripe-id's. */
export async function maakOverzicht(
  db: Db,
  organisatieId: string,
  stand: { config: AbonnementConfig; stripe: StripePoort | null },
  nu: Date = new Date(),
): Promise<AbonnementOverzicht> {
  const { config, stripe } = stand;
  const toegang = await toegangVoor(db, organisatieId, config, nu);
  if (!config.ingeschakeld || !stripe) {
    return {
      ingeschakeld: false,
      ...toegang,
      status: null,
      formule: null,
      periodeEinde: null,
      opgezegd: false,
      heeftKlant: false,
      prijzen: null,
    };
  }
  const rij = await haalAbonnementRij(db, organisatieId);
  return {
    ingeschakeld: true,
    ...toegang,
    status: leesStatus(rij?.status),
    formule: rij?.formule ?? null,
    periodeEinde: rij?.periodeEinde?.toISOString() ?? null,
    opgezegd: rij?.opgezegdOpPeriodeEinde ?? false,
    heeftKlant: rij !== null,
    prijzen: await haalPrijzen({ config, stripe }, nu.getTime()),
  };
}

/** `GET /api/abonnement`: elk lid van de actieve organisatie. */
export async function abonnementOverzicht(event: H3Event): Promise<AbonnementOverzicht> {
  const { organisatieId } = await vereisLid(event);
  return maakOverzicht(gebruikDb(), organisatieId, gebruikAbonnementen());
}

// --- Checkout --------------------------------------------------------------------------------

const CheckoutSchema = z.object({ formule: z.enum(["maand", "jaar"]) });

/** `trial_end` voor Stripe: het einde van de proefperiode, maar alleen ver genoeg in de toekomst. */
export function trialEindeVoor(proefEinde: Date, nu: Date): Date | null {
  return proefEinde.getTime() > nu.getTime() + TRIAL_MARGE_UUR * UUR_MS ? proefEinde : null;
}

/**
 * Start een Checkout-sessie voor de organisatie. Alles gebeurt achter een advisory lock per
 * organisatie, zodat twee gelijktijdige klikken één klant en hoogstens één open sessie geven:
 * de rij lezen, een voltooide vorige sessie synchroniseren, de klant maken, de vorige sessie
 * laten vervallen, de nieuwe maken en bewaren.
 */
export async function startCheckout(
  db: Db,
  stripe: StripePoort,
  prijzen: { maand: string; jaar: string },
  i: { organisatieId: string; formule: Formule; eigenaarEmail: string; locale: Taal },
  nu: Date = new Date(),
): Promise<{ url: string }> {
  const basis = basisUrl();
  const resultaat = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"abonnement:" + i.organisatieId}))`);
    const [org] = await tx
      .select({ naam: organization.name, proefEinde: organization.proefEinde })
      .from(organization)
      .where(eq(organization.id, i.organisatieId));
    if (!org) throw nietGevondenFout();
    const leesRij = async () =>
      (await tx.select().from(abonnementen).where(eq(abonnementen.organisatieId, i.organisatieId)))[0];
    const blokkeert = (r: Awaited<ReturnType<typeof leesRij>>) => {
      const status = leesStatus(r?.status);
      return status !== null && BLOKKEERT_CHECKOUT.has(status);
    };

    let rij = await leesRij();
    if (blokkeert(rij)) return "bestaat";

    if (rij?.openCheckoutSessie) {
      // De rij loopt achter tot de webhook of /synchroniseer komt. Is de vorige sessie al
      // voltooid, dan eerst de toestand van Stripe ophalen: expire werkt niet meer op een
      // voltooide sessie, en een tweede sessie zou dubbel laten betalen. `tx` in plaats van `db`:
      // de synchronisatie loopt dan als savepoint in dezelfde transactie, zonder tweede
      // verbinding die op deze transactie moet wachten.
      const vorige = await stripe.haalCheckout(rij.openCheckoutSessie);
      if (vorige?.abonnementId) {
        await synchroniseerKlant(tx, stripe, prijzen, rij.stripeKlantId, nu);
        rij = await leesRij();
        // Geen throw: dat zou de synchronisatie terugdraaien.
        if (blokkeert(rij)) return "bestaat";
      } else if (vorige) {
        await stripe.laatCheckoutVervallen(rij.openCheckoutSessie);
      }
    }

    let klantId = rij?.stripeKlantId;
    if (!klantId) {
      klantId = (await stripe.maakKlant({ organisatieId: i.organisatieId, email: i.eigenaarEmail, naam: org.naam })).id;
      await tx.insert(abonnementen).values({ organisatieId: i.organisatieId, stripeKlantId: klantId });
    }

    const sessie = await stripe.maakCheckout({
      klantId,
      prijsId: prijzen[i.formule],
      organisatieId: i.organisatieId,
      trialEinde: trialEindeVoor(org.proefEinde, nu),
      succesUrl: `${basis}/abonnement?terug={CHECKOUT_SESSION_ID}`,
      annuleerUrl: `${basis}/abonnement`,
      locale: i.locale,
    });
    await tx
      .update(abonnementen)
      .set({ openCheckoutSessie: sessie.id, bijgewerkt: nu })
      .where(eq(abonnementen.organisatieId, i.organisatieId));
    return { url: sessie.url };
  });
  if (resultaat === "bestaat") throw fout(409, "Deze organisatie heeft al een abonnement", ABONNEMENT_BESTAAT);
  return resultaat;
}

/** `POST /api/abonnement/checkout`: alleen een eigenaar. Stripe toont Checkout in zijn taal. */
export async function checkoutRoute(event: H3Event): Promise<{ url: string }> {
  const { organisatieId, gebruiker } = await vereisLid(event, { rol: "eigenaar" });
  const { config, stripe } = eisIngeschakeld();
  const { formule } = await leesBody(event, CheckoutSchema);
  const db = gebruikDb();
  return startCheckout(db, stripe, config.prijzen, {
    organisatieId,
    formule,
    eigenaarEmail: gebruiker.email,
    locale: await leesGebruikerstaal(db, gebruiker.id),
  });
}

// --- Portaal en synchronisatie ---------------------------------------------------------------

/** `POST /api/abonnement/portaal`: alleen een eigenaar; 409 `GEEN_KLANT` zonder klant. */
export async function portaalRoute(event: H3Event): Promise<{ url: string }> {
  const { organisatieId, gebruiker } = await vereisLid(event, { rol: "eigenaar" });
  const { stripe } = eisIngeschakeld();
  const db = gebruikDb();
  const rij = await haalAbonnementRij(db, organisatieId);
  if (!rij) throw fout(409, "Er is nog geen klant bij Stripe", GEEN_KLANT);
  return stripe.maakPortaal({
    klantId: rij.stripeKlantId,
    terugUrl: `${basisUrl()}/abonnement`,
    locale: await leesGebruikerstaal(db, gebruiker.id),
  });
}

const SynchroniseerSchema = z.object({ sessie: z.string().min(1) });

/**
 * `POST /api/abonnement/synchroniseer`: alleen een eigenaar. Na Checkout haalt de pagina met de
 * sessie uit de terug-URL de toestand op, zonder op de webhook te wachten. Hoort de sessie bij
 * een andere klant dan die van deze organisatie (of bestaat ze niet), dan 404.
 */
export async function synchroniseerRoute(event: H3Event): Promise<AbonnementOverzicht> {
  const { organisatieId } = await vereisLid(event, { rol: "eigenaar" });
  const stand = eisIngeschakeld();
  const { sessie } = await leesBody(event, SynchroniseerSchema);
  const db = gebruikDb();
  const rij = await haalAbonnementRij(db, organisatieId);
  const checkout = await stand.stripe.haalCheckout(sessie);
  if (!rij || !checkout || checkout.klantId !== rij.stripeKlantId) throw nietGevondenFout();
  await synchroniseerKlant(db, stand.stripe, stand.config.prijzen, rij.stripeKlantId);
  return maakOverzicht(db, organisatieId, stand);
}
