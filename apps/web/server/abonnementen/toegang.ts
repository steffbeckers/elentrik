// De toegangsbeslissing voor abonnementen: pure functies zonder database of Stripe.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import type {
  AbonnementStatus,
  Bedrijfsniveau,
  Projecttoegang,
  ToegangReden,
} from "../../shared/abonnement";

/** Volledige toegang tot zoveel dagen na de eerste `past_due`. */
export const ACHTERSTALLIG_DAGEN = 14;

const DAG_MS = 24 * 3600 * 1000;

export interface ToegangInvoer {
  nu: Date;
  /** Onwaar als Stripe niet is ingesteld: dan gelden geen beperkingen. */
  ingeschakeld: boolean;
  /** Einde van de overgangsproef (spec 4.8); voor nieuwe bedrijven het moment van aanmaken. */
  proefEinde: Date;
  vrijgesteld: boolean;
  onderwijs: boolean;
  /** Het gevolgde abonnement (zie `kiesGevolgdAbonnement`), of null. */
  abonnement: { status: AbonnementStatus; achterstalligSinds: Date | null } | null;
}

/**
 * Het niveau van een bedrijf (spec 4.3), in volgorde:
 * 1. abonnementen uit, 2. vrijgesteld, 3. onderwijs, 4. `active` of `trialing`, `past_due` binnen
 * 14 dagen na de eerste keer, of de overgangsproef loopt: `abonnement`, 5. anders `gratis`, met
 * als reden een mislukte betaling, een beëindigd abonnement of gewoon `gratis`.
 */
export function bepaalBedrijfsniveau(i: ToegangInvoer): { niveau: Bedrijfsniveau; reden: ToegangReden } {
  if (!i.ingeschakeld) return { niveau: "uit", reden: "uit" };
  if (i.vrijgesteld) return { niveau: "vrijgesteld", reden: "vrijgesteld" };
  if (i.onderwijs) return { niveau: "onderwijs", reden: "onderwijs" };
  const status = i.abonnement?.status;
  if (status === "active" || status === "trialing") return { niveau: "abonnement", reden: "actief" };
  if (status === "past_due") {
    // Zonder bekend begin van de achterstal telt nu als begin: nooit onterecht terugzetten.
    const sinds = i.abonnement?.achterstalligSinds ?? i.nu;
    if (i.nu.getTime() < sinds.getTime() + ACHTERSTALLIG_DAGEN * DAG_MS) {
      return { niveau: "abonnement", reden: "betaling-mislukt" };
    }
  }
  if (i.nu.getTime() < i.proefEinde.getTime()) return { niveau: "abonnement", reden: "proef" };
  if (status === "past_due" || status === "unpaid") return { niveau: "gratis", reden: "betaling-mislukt" };
  if (status === "canceled" || status === "incomplete_expired" || status === "paused") {
    return { niveau: "gratis", reden: "beeindigd" };
  }
  return { niveau: "gratis", reden: "gratis" };
}

/**
 * Wat een bedrijf op `niveau` met één project mag (de tabel in spec 4.3). Gekocht of gestempeld
 * gaat vóór onderwijs: een eerder betaald of gestempeld dossier krijgt nooit een watermerk.
 */
export function bepaalProjecttoegang(
  niveau: Bedrijfsniveau,
  p: { gekocht: boolean; gestempeld: boolean },
): Projecttoegang {
  const { gekocht, gestempeld } = p;
  const vrij: Projecttoegang = { bewerken: true, limiet: false, watermerk: null, gekocht, gestempeld };
  if (niveau === "uit" || niveau === "vrijgesteld" || niveau === "abonnement") return vrij;
  if (gekocht) return vrij;
  if (gestempeld) return { bewerken: false, limiet: false, watermerk: null, gekocht, gestempeld };
  if (niveau === "onderwijs") return { bewerken: true, limiet: false, watermerk: "onderwijs", gekocht, gestempeld };
  return { bewerken: true, limiet: true, watermerk: "gratis", gekocht, gestempeld };
}

/**
 * Tot wanneer een organisatie met een mislukte betaling (`past_due`) nog volledige toegang heeft: de eerste
 * `past_due` plus `ACHTERSTALLIG_DAGEN`. Null bij een andere status of zonder bekend begin.
 */
export function achterstalligTot(abonnement: ToegangInvoer["abonnement"]): Date | null {
  if (abonnement?.status !== "past_due" || !abonnement.achterstalligSinds) return null;
  return new Date(abonnement.achterstalligSinds.getTime() + ACHTERSTALLIG_DAGEN * DAG_MS);
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

/** De plaats in de volgorde; een onbekende status (nieuw bij Stripe) komt achter alle bekende. */
function rang(status: AbonnementStatus): number {
  const plaats = VOLGORDE.indexOf(status);
  return plaats === -1 ? VOLGORDE.length : plaats;
}

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
    const verschil = rang(kandidaat.status) - rang(gevolgd.status);
    if (verschil < 0 || (verschil === 0 && kandidaat.aangemaakt.getTime() > gevolgd.aangemaakt.getTime())) {
      gevolgd = kandidaat;
    }
  }
  const dubbel = lijst.filter((a) => LEVEND.has(a.status)).length >= 2;
  return { gevolgd, dubbel };
}
