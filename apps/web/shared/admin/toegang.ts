import type { Toegang } from "../abonnement";
export type AdminToegangsverklaring = Toegang & { beoordeeldOp: string; vrijgesteld: boolean; onderwijs: boolean; ingeschakeld: boolean };
export type AdminToegangGroep = "uit" | "vrijgesteld" | "onderwijs" | "abonnement" | "betalingsgratie" | "proef" | "gratis";
export type AdminAbonnement = {
  klantId: string | null; abonnementId: string | null; status: string | null;
  formule: "maand" | "jaar" | null; periodeEinde: string | null; opgezegd: boolean;
  bijgewerkt: string | null; openCheckout: boolean;
  links: { klant: string | null; abonnement: string | null };
};
