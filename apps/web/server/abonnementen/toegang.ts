// De toegangsbeslissing voor abonnementen: pure functies zonder database of Stripe.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import type { AbonnementStatus, ToegangReden } from "../../shared/abonnement";

/** Proefperiode voor het eerste bedrijf dat iemand zelf aanmaakt. */
export const PROEF_DAGEN = 30;
/** Schrijfrecht tot zoveel dagen na de eerste `past_due`. */
export const ACHTERSTALLIG_DAGEN = 14;

const DAG_MS = 24 * 3600 * 1000;

export interface ToegangInvoer {
  nu: Date;
  /** Onwaar als Stripe niet is ingesteld: dan gelden geen beperkingen. */
  ingeschakeld: boolean;
  proefEinde: Date;
  vrijgesteld: boolean;
  /** Het gevolgde abonnement (zie `kiesGevolgdAbonnement`), of null. */
  abonnement: { status: AbonnementStatus; achterstalligSinds: Date | null } | null;
}

/**
 * Mag deze organisatie schrijven? De regels in volgorde (spec 4.2):
 * 1. abonnementen uit, 2. vrijgesteld, 3. `active` of `trialing`, 4. `past_due` binnen 14 dagen
 * na de eerste keer, 5. de proefperiode loopt, 6. anders alleen-lezen met de reden daarvan.
 */
export function bepaalToegang(i: ToegangInvoer): { schrijven: boolean; reden: ToegangReden } {
  if (!i.ingeschakeld) return { schrijven: true, reden: "uit" };
  if (i.vrijgesteld) return { schrijven: true, reden: "vrijgesteld" };
  const status = i.abonnement?.status;
  if (status === "active" || status === "trialing") return { schrijven: true, reden: "actief" };
  if (status === "past_due") {
    // Zonder bekend begin van de achterstal telt nu als begin: nooit onterecht blokkeren.
    const sinds = i.abonnement?.achterstalligSinds ?? i.nu;
    if (i.nu.getTime() < sinds.getTime() + ACHTERSTALLIG_DAGEN * DAG_MS) {
      return { schrijven: true, reden: "betaling-mislukt" };
    }
  }
  if (i.nu.getTime() < i.proefEinde.getTime()) return { schrijven: true, reden: "proef" };
  if (status === "past_due" || status === "unpaid") return { schrijven: false, reden: "betaling-mislukt" };
  if (status === "canceled" || status === "incomplete_expired" || status === "paused") {
    return { schrijven: false, reden: "beeindigd" };
  }
  return { schrijven: false, reden: "proef-voorbij" };
}

/** Van levendigst naar minst levendig. */
const VOLGORDE: readonly AbonnementStatus[] = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
  "canceled",
  "incomplete_expired",
];

const LEVEND: ReadonlySet<AbonnementStatus> = new Set(["active", "trialing", "past_due"]);

/**
 * Kiest het abonnement dat Elentrik volgt: het levendigste, en bij een gelijke status het
 * nieuwste. `dubbel` is waar als er twee of meer levende abonnementen zijn (`active`, `trialing`
 * of `past_due`): de klant betaalt dan mogelijk dubbel.
 */
export function kiesGevolgdAbonnement<T extends { status: AbonnementStatus; aangemaakt: Date }>(
  lijst: T[],
): { gevolgd: T | null; dubbel: boolean } {
  let gevolgd: T | null = null;
  for (const kandidaat of lijst) {
    if (!gevolgd) {
      gevolgd = kandidaat;
      continue;
    }
    const verschil = VOLGORDE.indexOf(kandidaat.status) - VOLGORDE.indexOf(gevolgd.status);
    if (verschil < 0 || (verschil === 0 && kandidaat.aangemaakt.getTime() > gevolgd.aangemaakt.getTime())) {
      gevolgd = kandidaat;
    }
  }
  const dubbel = lijst.filter((a) => LEVEND.has(a.status)).length >= 2;
  return { gevolgd, dubbel };
}
