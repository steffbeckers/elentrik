// Betalen per project (spec 4.5): een eigenaar geeft één project vrij met een eenmalige
// Checkout-betaling. `startProjectaankoop` maakt de sessie, `verwerkProjectsessie` verwerkt de
// uitkomst (vanuit de webhook en vanuit /vrijgave/synchroniseer) en zet `projecten.gekocht_op`.
// Stripe is de bron van waarheid: alleen een sessie met `payment_status = paid` koopt een project.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { and, eq, isNull, sql } from "drizzle-orm";
import type { H3Event } from "h3";
import { z } from "zod";
import { PROJECT_AL_GEKOCHT, VRIJGAVE_LOOPT, VRIJGEVEN_NIET_NODIG } from "../../shared/abonnement";
import type { Taal } from "../../shared/taal";
import { basisUrl } from "../auth/oorsprong";
import { gebruikDb, type Db } from "../db";
import { abonnementen, organization, projectaankopen, projecten } from "../db/schema";
import { maakFout, nietGevondenFout } from "../fouten";
import { leesGebruikerstaal } from "../gebruikers/taal";
import { leesBody, projectId as projectIdUit } from "../utils/projecten";
import { vereisLid, vereisProjecttoegang } from "../utils/toegang";
import { maakKlantOfZoek } from "./beheer";
import { gebruikAbonnementen, type AbonnementConfig } from "./config";
import { toegangVoor } from "./repo";
import type { Betaalstatus, StripeCheckout, StripePoort } from "./stripe";

export type Projectuitkomst = "betaald" | "mislukt" | "vervallen";

export type Projectsessie = Pick<StripeCheckout, "id" | "metadata" | "betaalstatus">;

/** Alleen bij deze `payment_status` is er betaald (`no_payment_required`: een kortingscode van 100%). */
const BETAALD: ReadonlySet<Betaalstatus | null> = new Set<Betaalstatus | null>(["paid", "no_payment_required"]);

export function isBetaald(betaalstatus: Betaalstatus | null): boolean {
  return BETAALD.has(betaalstatus);
}

/** De project-id uit de metadata gaat naar een uuid-kolom: een andere vorm wordt genegeerd, geen 500. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function vergrendelProject(db: Db, projectId: string) {
  return db.execute(sql`select pg_advisory_xact_lock(hashtext(${"projectaankoop:" + projectId}))`);
}

/**
 * Verwerkt de uitkomst van een Checkout-sessie voor een project. Idempotent: een herhaling (de
 * webhook na /synchroniseer, of een herhaald event) verandert niets meer.
 *
 * - `betaald` (alleen met `payment_status` `paid` of `no_payment_required`): de aankoop wordt
 *   `betaald` en `projecten.gekocht_op` wordt gezet als die nog leeg is, in één transactie. Betaald
 *   wint altijd, ook van een aankoop die intussen vervallen of mislukt heette: wie betaald heeft,
 *   krijgt zijn project. Ontbreekt de rij (een start die na de Stripe-aanroep mislukte), dan komt
 *   ze er alsnog.
 * - `mislukt` of `vervallen`: alleen een `open` aankoop verandert; een betaalde nooit.
 *
 * Een sessie zonder `soort = "project"`, of waarvan het project niet (meer) bij de organisatie uit
 * de metadata hoort, wordt genegeerd.
 */
export async function verwerkProjectsessie(
  db: Db,
  sessie: Projectsessie,
  uitkomst: Projectuitkomst,
  nu: Date = new Date(),
): Promise<"verwerkt" | "genegeerd"> {
  const { organisatieId, projectId, soort } = sessie.metadata;
  if (soort !== "project" || !organisatieId || !projectId || !UUID.test(projectId)) return "genegeerd";
  if (uitkomst === "betaald" && !isBetaald(sessie.betaalstatus)) return "genegeerd";

  return db.transaction(async (tx) => {
    // Hetzelfde lock als de start: een betaling en een nieuwe start van hetzelfde project lopen na elkaar.
    await vergrendelProject(tx, projectId);
    const [project] = await tx
      .select({ organisatieId: projecten.organisatieId })
      .from(projecten)
      .where(eq(projecten.id, projectId));
    if (!project || project.organisatieId !== organisatieId) return "genegeerd";

    const [aankoop] = await tx.select().from(projectaankopen).where(eq(projectaankopen.checkoutSessie, sessie.id));
    if (aankoop && (aankoop.projectId !== projectId || aankoop.organisatieId !== organisatieId)) return "genegeerd";

    if (uitkomst !== "betaald") {
      if (aankoop?.status === "open") {
        await tx.update(projectaankopen).set({ status: uitkomst }).where(eq(projectaankopen.id, aankoop.id));
      }
      return "verwerkt";
    }

    if (!aankoop) {
      await tx
        .insert(projectaankopen)
        .values({ organisatieId, projectId, checkoutSessie: sessie.id, status: "betaald", aangemaakt: nu, betaaldOp: nu });
    } else if (aankoop.status !== "betaald") {
      await tx
        .update(projectaankopen)
        .set({ status: "betaald", betaaldOp: nu })
        .where(eq(projectaankopen.id, aankoop.id));
    }
    await tx
      .update(projecten)
      .set({ gekochtOp: nu })
      .where(and(eq(projecten.id, projectId), isNull(projecten.gekochtOp)));
    return "verwerkt";
  });
}

/**
 * Start de aankoop van één project, achter een advisory lock per project (twee klikken geven
 * hoogstens één open aankoop):
 *
 * 1. Al gekocht: 409 `PROJECT_AL_GEKOCHT`. Staat het bedrijf niet op `gratis` (abonnement, ook in
 *    de betalingsgratie of de overgangsproef; onderwijs; vrijgesteld; abonnementen uit), of is er
 *    geen projectprijs: 409 `VRIJGEVEN_NIET_NODIG`.
 * 2. Een open aankoop, volgens haar sessie bij Stripe (nooit een tweede sessie zolang er betaald
 *    kan zijn: een project wordt nooit twee keer betaald):
 *    - betaald (de webhook loopt achter): eerst verwerken, dan `PROJECT_AL_GEKOCHT`;
 *    - `complete` maar nog niet betaald (een uitgestelde betaling, SEPA of Bancontact): de rij
 *      blijft `open` en 409 `VRIJGAVE_LOOPT`; de webhook beslist later;
 *    - `open`: laten vervallen bij Stripe en hier;
 *    - vervallen of onbekend bij Stripe: hier vervallen.
 * 3. De Stripe-klant via dezelfde weg als `startCheckout` (onder het lock per organisatie): de
 *    bestaande rij in `abonnementen`, anders zoeken of maken en een rij toevoegen, zodat de webhook
 *    de klant herkent.
 * 4. De sessie maken en de aankoop als `open` bewaren.
 */
export async function startProjectaankoop(
  db: Db,
  stripe: StripePoort | null,
  config: AbonnementConfig,
  i: { organisatieId: string; projectId: string; eigenaarEmail: string; locale: Taal },
  nu: Date = new Date(),
): Promise<{ url: string }> {
  const basis = basisUrl();
  const resultaat = await db.transaction(async (tx) => {
    await vergrendelProject(tx, i.projectId);
    const [project] = await tx
      .select({ organisatieId: projecten.organisatieId, gekochtOp: projecten.gekochtOp, verwijderd: projecten.verwijderd })
      .from(projecten)
      .where(eq(projecten.id, i.projectId));
    if (!project || project.organisatieId !== i.organisatieId || project.verwijderd) throw nietGevondenFout();
    if (project.gekochtOp) return "gekocht";

    const { niveau } = await toegangVoor(tx, i.organisatieId, config, nu);
    const prijsId = config.ingeschakeld ? config.prijzen.project : null;
    if (niveau !== "gratis" || !prijsId || !stripe) return "niet-nodig";

    const [open] = await tx
      .select()
      .from(projectaankopen)
      .where(and(eq(projectaankopen.projectId, i.projectId), eq(projectaankopen.status, "open")));
    if (open) {
      let vorige = await stripe.haalCheckout(open.checkoutSessie);
      if (vorige?.status === "open") {
        await stripe.laatCheckoutVervallen(open.checkoutSessie);
        // De klant kan de sessie net vóór het vervallen voltooid hebben (Stripe weigert dan het
        // vervallen, en dat negeren we): opnieuw lezen, zodat er geen tweede betaling volgt.
        vorige = await stripe.haalCheckout(open.checkoutSessie);
      }
      if (vorige && isBetaald(vorige.betaalstatus)) {
        // De metadata van de eigen rij, niet die van Stripe: deze sessie is van dit project.
        const metadata = { organisatieId: open.organisatieId, projectId: open.projectId, soort: "project" };
        await verwerkProjectsessie(tx, { id: open.checkoutSessie, metadata, betaalstatus: vorige.betaalstatus }, "betaald", nu);
        // Geen throw: dat zou de verwerking terugdraaien.
        return "gekocht";
      }
      // Alles behalve een vervallen sessie (of een die Stripe niet meer kent) kan nog betaald
      // worden: `complete` met `unpaid` is een uitgestelde betaling die loopt.
      if (vorige && vorige.status !== "expired") return "loopt";
      await tx.update(projectaankopen).set({ status: "vervallen" }).where(eq(projectaankopen.id, open.id));
    }

    // Hetzelfde lock als `startCheckout`: één klant en één rij in `abonnementen` per organisatie.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"abonnement:" + i.organisatieId}))`);
    const [rij] = await tx
      .select({ klantId: abonnementen.stripeKlantId })
      .from(abonnementen)
      .where(eq(abonnementen.organisatieId, i.organisatieId));
    let klantId = rij?.klantId;
    if (!klantId) {
      const [org] = await tx.select({ naam: organization.name }).from(organization).where(eq(organization.id, i.organisatieId));
      if (!org) throw nietGevondenFout();
      klantId =
        (await stripe.zoekKlant(i.organisatieId))?.id ??
        (await maakKlantOfZoek(stripe, { organisatieId: i.organisatieId, email: i.eigenaarEmail, naam: org.naam }));
      await tx.insert(abonnementen).values({ organisatieId: i.organisatieId, stripeKlantId: klantId });
    }

    const sessie = await stripe.maakProjectCheckout({
      klantId,
      prijsId,
      organisatieId: i.organisatieId,
      projectId: i.projectId,
      succesUrl: `${basis}/projecten/${i.projectId}?vrijgave={CHECKOUT_SESSION_ID}`,
      annuleerUrl: `${basis}/projecten/${i.projectId}`,
      locale: i.locale,
    });
    await tx.insert(projectaankopen).values({
      organisatieId: i.organisatieId,
      projectId: i.projectId,
      checkoutSessie: sessie.id,
      status: "open",
      aangemaakt: nu,
    });
    return { url: sessie.url };
  });
  if (resultaat === "gekocht") throw maakFout(409, "Dit project is al gekocht", PROJECT_AL_GEKOCHT);
  if (resultaat === "loopt") throw maakFout(409, "De betaling voor dit project loopt nog", VRIJGAVE_LOOPT);
  if (resultaat === "niet-nodig") throw maakFout(409, "Dit project hoeft niet vrijgegeven te worden", VRIJGEVEN_NIET_NODIG);
  return resultaat;
}

// --- Routes ----------------------------------------------------------------------------------

/** Toegang tot het project (anders 404) en de rol eigenaar in zijn organisatie (anders 403). */
async function vereisEigenaarVanProject(event: H3Event) {
  const { project } = await vereisProjecttoegang(event, projectIdUit(event));
  const { gebruiker } = await vereisLid(event, { organisatieId: project.organisatieId, rol: "eigenaar" });
  return { project, gebruiker };
}

/** `POST /api/projecten/[id]/vrijgeven`: alleen een eigenaar. Geeft de Checkout-URL. */
export async function vrijgevenRoute(event: H3Event): Promise<{ url: string }> {
  const { project, gebruiker } = await vereisEigenaarVanProject(event);
  const { config, stripe } = gebruikAbonnementen();
  const db = gebruikDb();
  return startProjectaankoop(db, stripe, config, {
    organisatieId: project.organisatieId,
    projectId: project.id,
    eigenaarEmail: gebruiker.email,
    locale: await leesGebruikerstaal(db, gebruiker.id),
  });
}

const SynchroniseerSchema = z.object({ sessie: z.string().min(1).max(255) });

/**
 * `POST /api/projecten/[id]/vrijgave/synchroniseer { sessie }`: alleen een eigenaar. Na Checkout
 * haalt de editor met de sessie uit de terug-URL de toestand op, zonder op de webhook te wachten.
 * Een sessie die niet bestaat, geen projectsessie is, of niet bij deze organisatie en dit project
 * hoort: 404. Is ze betaald, dan wordt het project gekocht.
 */
export async function synchroniseerVrijgaveRoute(event: H3Event): Promise<{ gekocht: boolean }> {
  const { project } = await vereisEigenaarVanProject(event);
  const { sessie } = await leesBody(event, SynchroniseerSchema);
  const { config, stripe } = gebruikAbonnementen();
  if (!config.ingeschakeld || !stripe) throw nietGevondenFout();
  const checkout = await stripe.haalCheckout(sessie);
  if (
    !checkout ||
    checkout.metadata.soort !== "project" ||
    checkout.metadata.organisatieId !== project.organisatieId ||
    checkout.metadata.projectId !== project.id
  ) {
    throw nietGevondenFout();
  }
  const db = gebruikDb();
  if (isBetaald(checkout.betaalstatus)) await verwerkProjectsessie(db, checkout, "betaald");
  const [rij] = await db.select({ gekochtOp: projecten.gekochtOp }).from(projecten).where(eq(projecten.id, project.id));
  return { gekocht: rij?.gekochtOp != null };
}
