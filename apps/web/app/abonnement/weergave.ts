// Pure helpers voor de abonnementspagina en de banner: prijzen, korting, welke banner en welke
// tekst bij een situatie hoort. Geen Nuxt, geen i18n: de sleutels staan in nl.json; bedragen en
// datums krijgen de taal mee.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import {
  ABONNEMENT_VEREIST,
  type AbonnementOverzicht,
  type AbonnementStatus,
  type Formule,
  type Prijs,
  type Toegang,
} from "../../shared/abonnement";
import { LOCALES, type Taal } from "../../shared/taal";
import { foutCode, foutStatus } from "../sessie/fouten";
import type { Rol } from "../stores/sessie";

const DAG_MS = 24 * 3600 * 1000;
/** Het btw-tarief dat de pagina ter info toont. */
const BTW = 121;
/** De banner voor de proefperiode verschijnt in de laatste zoveel dagen. */
const PROEF_BANNER_DAGEN = 7;

/** Het bedrag excl. btw en ter info incl. 21 % btw (afgerond op een cent), in de locale van de taal. */
export function prijsTekst(p: Prijs, taal: Taal): { excl: string; incl: string } {
  const formaat = new Intl.NumberFormat(LOCALES[taal], { style: "currency", currency: p.munt.toUpperCase() });
  return {
    excl: formaat.format(p.bedrag / 100),
    incl: formaat.format(Math.round((p.bedrag * BTW) / 100) / 100),
  };
}

/** De korting van het jaarabonnement t.o.v. twaalf maanden, als afgerond percentage. */
export function jaarKorting(maand: Prijs, jaar: Prijs): number {
  return Math.round((1 - jaar.bedrag / (12 * maand.bedrag)) * 100);
}

/** Het aantal dagen tot `einde`, naar boven afgerond. */
export function dagenTot(einde: string, nu: Date): number {
  return Math.ceil((new Date(einde).getTime() - nu.getTime()) / DAG_MS);
}

/** Een datum voor in een zin in de taal, bv. "1 november 2026" of "1 novembre 2026". */
export function datumTekst(iso: string, taal: Taal): string {
  return new Intl.DateTimeFormat(LOCALES[taal], { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

export type Banner = {
  soort: "proef" | "betaling" | "alleen-lezen";
  dagen?: number;
  /** Bij "betaling": tot wanneer de betaling geregeld moet zijn (ISO), als dat bekend is. */
  tot?: string;
  knop: boolean;
  /** De i18n-sleutel van de knop (alleen met `knop`). */
  knopSleutel?: "abonnement.banner.kies" | "abonnement.betalingRegelen";
};

const KIES = "abonnement.banner.kies";
const REGELEN = "abonnement.betalingRegelen";

/**
 * Welke banner bovenaan de app past bij de toegang van de actieve organisatie, of null.
 * - proef: alleen een eigenaar, als de proef nog hoogstens 7 dagen loopt;
 * - betaling: een eigenaar, bij schrijfrecht en een mislukte betaling, met de datum waarvoor ze geregeld moet zijn;
 * - alleen-lezen: iedereen zonder schrijfrecht, met een knop voor een eigenaar.
 */
export function bannerVoor(toegang: Toegang, rol: Rol | null, nu: Date): Banner | null {
  const eigenaar = rol === "eigenaar";
  if (!toegang.schrijven) {
    if (!eigenaar) return { soort: "alleen-lezen", knop: false };
    // Na een mislukte betaling kiest de eigenaar niets nieuws: hij regelt de betaling.
    return { soort: "alleen-lezen", knop: true, knopSleutel: toegang.reden === "betaling-mislukt" ? REGELEN : KIES };
  }
  if (!eigenaar) return null;
  if (toegang.reden === "betaling-mislukt") {
    return toegang.achterstalligTot
      ? { soort: "betaling", tot: toegang.achterstalligTot, knop: true, knopSleutel: REGELEN }
      : { soort: "betaling", knop: true, knopSleutel: REGELEN };
  }
  if (toegang.reden === "proef" && toegang.proefEinde !== null) {
    const dagen = dagenTot(toegang.proefEinde, nu);
    if (dagen >= 1 && dagen <= PROEF_BANNER_DAGEN) return { soort: "proef", dagen, knop: true, knopSleutel: KIES };
  }
  return null;
}

/** Het aantal resterende proefdagen voor de statusregel (ook de meervoudsvorm), nooit negatief. */
export function statusAantal(o: AbonnementOverzicht, nu: Date): number {
  return o.proefEinde ? Math.max(dagenTot(o.proefEinde, nu), 0) : 0;
}

/** De i18n-sleutel voor de statusregel op /abonnement. */
export function statusTekstSleutel(o: AbonnementOverzicht): string {
  if (!o.ingeschakeld || o.reden === "uit") return "abonnement.status.uit";
  switch (o.reden) {
    case "vrijgesteld":
      return "abonnement.status.vrijgesteld";
    case "actief":
      return o.opgezegd ? "abonnement.status.opgezegd" : "abonnement.status.actief";
    case "betaling-mislukt":
      // Met schrijfrecht en een bekende einddatum: "... vóór {datum}"; anders alleen de mededeling.
      return o.schrijven && o.achterstalligTot
        ? "abonnement.status.betalingMisluktTot"
        : "abonnement.status.betalingMislukt";
    case "proef":
      return "abonnement.status.proef";
    case "beeindigd":
      return "abonnement.status.beeindigd";
    default:
      return "abonnement.status.proefVoorbij";
  }
}

/** Heeft de organisatie een abonnement dat de eigenaar via het portaal beheert (en dus geen tweede Checkout)? */
const LOPEND: ReadonlySet<AbonnementStatus> = new Set([
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

export type PaginaWeergave = {
  /** De sleutel van de statusregel; null als de melding al zegt wat er te zeggen valt (abonnementen uit). */
  statusSleutel: string | null;
  /** Wat de pagina in plaats van knoppen zegt: een lid, abonnementen uit, of prijzen die ontbreken. */
  melding: "lid" | "uit" | "prijzen" | null;
  /** De kaarten Maandelijks en Jaarlijks, voor een eigenaar zonder lopend abonnement. */
  kaarten: { formule: Formule; prijs: { excl: string; incl: string }; korting: number | null }[];
  /** De sleutel van de beheerknop, voor een eigenaar met een abonnement. */
  beheer: "abonnement.beheren" | "abonnement.betalingRegelen" | null;
};

/** Wat /abonnement toont voor dit overzicht en deze rol; de bedragen in de taal. */
export function paginaWeergave(o: AbonnementOverzicht, rol: Rol | null, taal: Taal): PaginaWeergave {
  const weergave: PaginaWeergave = { statusSleutel: statusTekstSleutel(o), melding: null, kaarten: [], beheer: null };
  // "Betalen is nog niet ingesteld." staat één keer: in de melding, niet ook in de statusregel.
  if (!o.ingeschakeld) return { ...weergave, statusSleutel: null, melding: "uit" };
  if (rol !== "eigenaar") return { ...weergave, melding: "lid" };
  if (o.status !== null && LOPEND.has(o.status)) {
    const betalingRegelen = o.status === "past_due" || o.status === "unpaid";
    return { ...weergave, beheer: betalingRegelen ? "abonnement.betalingRegelen" : "abonnement.beheren" };
  }
  // Een vrijgesteld bedrijf hoeft niets te kiezen: alleen de status, geen kaarten en geen prijzenmelding.
  if (o.reden === "vrijgesteld") return weergave;
  if (!o.prijzen) return { ...weergave, melding: "prijzen" };
  const { maand, jaar } = o.prijzen;
  return {
    ...weergave,
    kaarten: [
      { formule: "maand", prijs: prijsTekst(maand, taal), korting: null },
      { formule: "jaar", prijs: prijsTekst(jaar, taal), korting: jaarKorting(maand, jaar) },
    ],
  };
}

/**
 * Was de fout een 402 ABONNEMENT_VEREIST (de organisatie mag niet meer schrijven)? Dan de sessie
 * opnieuw lezen, zodat de app alleen-lezen toont, en true teruggeven: de aanroeper toont de
 * alleen-lezenmelding in plaats van een generieke fout. Een mislukte `laad` verandert daar niets
 * aan. Een andere fout: false.
 */
export async function behandelSchrijfweigering(fout: unknown, laad: () => Promise<void>): Promise<boolean> {
  if (foutStatus(fout) !== 402 || foutCode(fout) !== ABONNEMENT_VEREIST) return false;
  try {
    await laad();
  } catch {
    // De melding volstaat; de volgende navigatie leest de sessie opnieuw.
  }
  return true;
}
