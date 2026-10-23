// De acties van /abonnement, los van de pagina zodat ze zonder Nuxt te testen zijn: terug uit
// Checkout, een formule kiezen en het portaal openen.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { ABONNEMENT_BESTAAT, GEEN_KLANT, type AbonnementOverzicht, type Formule } from "../../shared/abonnement";
import type { AbonnementApi } from "../composables/useAbonnementApi";
import { foutCode, foutStatus } from "../sessie/fouten";

/**
 * Terug uit Checkout (`?terug=<sessie>`): eerst synchroniseren, dan `terug` uit de URL halen en de
 * sessie opnieuw lezen (de banners en de schrijfrechten volgen). Geeft het nieuwe overzicht, of
 * null zonder `terug` of als synchroniseren mislukte: de pagina haalt het overzicht dan gewoon op
 * (de webhook loopt het bij). `terug` gaat er ook na een mislukking uit, anders blijft elke
 * herlaadbeurt dezelfde fout geven.
 */
export async function verwerkTerug(
  terug: string | undefined,
  opties: {
    api: Pick<AbonnementApi, "synchroniseer">;
    laadSessie: () => Promise<void>;
    verwijderTerug: () => unknown;
  },
): Promise<AbonnementOverzicht | null> {
  if (!terug) return null;
  let overzicht: AbonnementOverzicht | null = null;
  try {
    overzicht = await opties.api.synchroniseer(terug);
  } catch {
    overzicht = null;
  }
  await opties.verwijderTerug();
  try {
    await opties.laadSessie();
  } catch {
    // De sessie wordt bij de volgende navigatie opnieuw gelezen.
  }
  return overzicht;
}

type Doorsturen = {
  /** Naar de (externe) url van Stripe. */
  navigeer: (url: string) => unknown;
  /** Het overzicht opnieuw ophalen. */
  herlaad: () => Promise<unknown>;
};

/**
 * "Kies": naar Checkout. Bestaat er intussen al een abonnement (409 ABONNEMENT_BESTAAT), dan
 * opnieuw laden: de pagina toont dan de beheerknop. Andere fouten gaan naar de aanroeper.
 */
export async function kiesFormule(
  formule: Formule,
  opties: Doorsturen & { api: Pick<AbonnementApi, "checkout"> },
): Promise<"doorgestuurd" | "bestaat"> {
  try {
    const { url } = await opties.api.checkout(formule);
    await opties.navigeer(url);
    return "doorgestuurd";
  } catch (fout) {
    if (foutStatus(fout) === 409 && foutCode(fout) === ABONNEMENT_BESTAAT) {
      await opties.herlaad();
      return "bestaat";
    }
    throw fout;
  }
}

/**
 * "Abonnement beheren": naar het klantenportaal. Is er (nog) geen klant (409 GEEN_KLANT), dan
 * opnieuw laden. Andere fouten gaan naar de aanroeper.
 */
export async function beheerAbonnement(
  opties: Doorsturen & { api: Pick<AbonnementApi, "portaal"> },
): Promise<"doorgestuurd" | "geen-klant"> {
  try {
    const { url } = await opties.api.portaal();
    await opties.navigeer(url);
    return "doorgestuurd";
  } catch (fout) {
    if (foutStatus(fout) === 409 && foutCode(fout) === GEEN_KLANT) {
      await opties.herlaad();
      return "geen-klant";
    }
    throw fout;
  }
}
