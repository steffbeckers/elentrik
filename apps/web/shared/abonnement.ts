// Gedeelde types en foutcodes voor abonnementen, voor server en client.

export type Formule = "maand" | "jaar";

/** De Stripe-status van een abonnement, zoals Stripe ze geeft. */
export type AbonnementStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

/** Waarom een organisatie wel of niet mag schrijven. */
export type ToegangReden =
  | "uit"
  | "vrijgesteld"
  | "actief"
  | "betaling-mislukt"
  | "proef"
  | "proef-voorbij"
  | "beeindigd";

export type Toegang = { schrijven: boolean; reden: ToegangReden; proefEinde: string | null };

// Foutcodes in `data.code`.
export const ABONNEMENT_VEREIST = "ABONNEMENT_VEREIST";
export const ABONNEMENT_BESTAAT = "ABONNEMENT_BESTAAT";
export const GEEN_KLANT = "GEEN_KLANT";
export const ABONNEMENTEN_UIT = "ABONNEMENTEN_UIT";
