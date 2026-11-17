// Gedeelde types en foutcodes voor abonnementen, voor server en client.
import type { Limieten } from "@elentrik/model";

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

/**
 * Het niveau van een bedrijf (spec 4.3): wat het met zijn projecten mag. `abonnement` is volledige
 * toegang, ook tijdens de overgangsproef en de betalingsgratie; `gratis` heeft de limiet en het
 * watermerk; `onderwijs` heeft geen limiet, wel een watermerk.
 */
export type Bedrijfsniveau = "uit" | "vrijgesteld" | "onderwijs" | "abonnement" | "gratis";

/** Waarom een bedrijf op zijn niveau staat. */
export type ToegangReden =
  | "uit"
  | "vrijgesteld"
  | "onderwijs"
  | "actief"
  | "betaling-mislukt"
  | "proef"
  | "gratis"
  | "beeindigd";

export type Toegang = {
  niveau: Bedrijfsniveau;
  reden: ToegangReden;
  proefEinde: string | null;
  /** ISO-tijdstip waarop de volledige toegang bij een mislukte betaling (`past_due`) vervalt; anders null. */
  achterstalligTot: string | null;
};

/** Het watermerk van een versie in de export, of null. */
export type Watermerk = "gratis" | "onderwijs" | null;

/** Wat een bedrijf met één project mag (spec 4.3). */
export type Projecttoegang = {
  bewerken: boolean;
  /** Waar als de server de limieten afdwingt bij het bewaren. */
  limiet: boolean;
  watermerk: Watermerk;
  gekocht: boolean;
  gestempeld: boolean;
};

/**
 * Een prijs van Stripe: het bedrag in de kleinste munteenheid (cent). `eenmalig` is een prijs zonder
 * herhaling (de projectprijs).
 */
export type Prijs = { bedrag: number; munt: string; interval: "month" | "year" | "eenmalig" };

/** Wat de client over het abonnement van de actieve organisatie mag weten (geen Stripe-id's). */
export type AbonnementOverzicht = {
  ingeschakeld: boolean;
  niveau: Bedrijfsniveau;
  reden: ToegangReden;
  proefEinde: string | null;
  /** Zie `Toegang.achterstalligTot`. */
  achterstalligTot: string | null;
  status: AbonnementStatus | null;
  formule: Formule | null;
  periodeEinde: string | null;
  opgezegd: boolean;
  heeftKlant: boolean;
  /**
   * Null als Stripe de prijzen niet geeft (of abonnementen uit zijn). `project` is null zonder
   * `STRIPE_PRIJS_PROJECT`.
   */
  prijzen: { maand: Prijs; jaar: Prijs; project: Prijs | null } | null;
  /** De limieten van de gratis versie; null als abonnementen uit staan. */
  limieten: Limieten | null;
};

// Foutcodes in `data.code`.
export const ABONNEMENT_VEREIST = "ABONNEMENT_VEREIST";
export const ABONNEMENT_BESTAAT = "ABONNEMENT_BESTAAT";
export const GEEN_KLANT = "GEEN_KLANT";
export const ABONNEMENTEN_UIT = "ABONNEMENTEN_UIT";
/** 402: het project is alleen-lezen (gestempeld en niet gekocht, zonder abonnement). */
export const PROJECT_ALLEEN_LEZEN = "PROJECT_ALLEEN_LEZEN";
/** 402: het bewaren zou een limiet van de gratis versie overschrijden. */
export const PROJECT_LIMIET = "PROJECT_LIMIET";
/** 409: het project is al gekocht. */
export const PROJECT_AL_GEKOCHT = "PROJECT_AL_GEKOCHT";
/** 409: het project hoeft niet vrijgegeven te worden (of er is geen projectprijs). */
export const VRIJGEVEN_NIET_NODIG = "VRIJGEVEN_NIET_NODIG";
/** 409: een uitgestelde betaling (SEPA, Bancontact) voor dit project loopt nog; een tweede zou dubbel laten betalen. */
export const VRIJGAVE_LOOPT = "VRIJGAVE_LOOPT";
