// Pure helpers voor de abonnementspagina en de banner: prijzen, korting, welke banner en welke
// tekst bij een situatie hoort. Geen Nuxt, geen i18n: de sleutels staan in nl.json; bedragen en
// datums krijgen de taal mee.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import {
  PROJECT_ALLEEN_LEZEN,
  PROJECT_LIMIET,
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
  soort: "proef" | "betaling";
  dagen?: number;
  /** Bij "betaling": tot wanneer de betaling geregeld moet zijn (ISO), als dat bekend is. */
  tot?: string;
  /** Bij "betaling": de gratie is voorbij en het bedrijf is al teruggevallen op de gratis versie. */
  naGratie?: true;
  knop: boolean;
  /** De i18n-sleutel van de knop (alleen met `knop`). */
  knopSleutel?: "abonnement.banner.kies" | "abonnement.betalingRegelen";
};

const KIES = "abonnement.banner.kies";
const REGELEN = "abonnement.betalingRegelen";

/**
 * Welke banner bovenaan de app past bij de toegang van de actieve organisatie, of null. Alleen een
 * eigenaar:
 * - betaling: bij een mislukte betaling, op elk niveau. Binnen de gratie (niveau abonnement) met de
 *   datum waarvoor ze geregeld moet zijn, als die bekend is; daarna (niveau gratis) zonder datum en
 *   met `naGratie`, want het bedrijf is dan al teruggevallen op de gratis versie;
 * - proef: tijdens de overgangsproef (niveau abonnement), in de laatste 7 dagen.
 * Een gratis bedrijf krijgt verder geen banner: de limieten staan in de editor.
 */
export function bannerVoor(toegang: Toegang, rol: Rol | null, nu: Date): Banner | null {
  if (rol !== "eigenaar") return null;
  if (toegang.reden === "betaling-mislukt") {
    if (toegang.niveau !== "abonnement") return { soort: "betaling", naGratie: true, knop: true, knopSleutel: REGELEN };
    return toegang.achterstalligTot
      ? { soort: "betaling", tot: toegang.achterstalligTot, knop: true, knopSleutel: REGELEN }
      : { soort: "betaling", knop: true, knopSleutel: REGELEN };
  }
  if (toegang.niveau !== "abonnement") return null;
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
      // Binnen de gratie (volledige toegang) en met een bekende einddatum: "... vóór {datum}"; anders alleen de mededeling.
      return o.niveau === "abonnement" && o.achterstalligTot
        ? "abonnement.status.betalingMisluktTot"
        : "abonnement.status.betalingMislukt";
    case "proef":
      return "abonnement.status.proef";
    case "beeindigd":
      return "abonnement.status.beeindigd";
    case "onderwijs":
      return "abonnement.status.onderwijs";
    default:
      return "abonnement.status.gratis";
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
  /** De sleutel van de statusregel; null als de melding al zegt wat er te zeggen valt (abonnementen uit, onderwijs). */
  statusSleutel: string | null;
  /** Wat de pagina in plaats van knoppen zegt: een lid, abonnementen uit, onderwijs, of prijzen die ontbreken. */
  melding: "lid" | "uit" | "prijzen" | "onderwijs" | null;
  blokken: {
    /** De limieten van de gratis versie; null als ze niet gelden (abonnement, onderwijs, vrijgesteld, uit). */
    gratis: { kringen: number; situatieschemas: number } | null;
    /** De projectprijs, uitgelegd vanuit de editor; null zonder gratis blok of zonder projectprijs. */
    project: { prijs: { excl: string; incl: string } } | null;
    /** De kaarten Maandelijks en Jaarlijks, voor een eigenaar zonder lopend abonnement. */
    kaarten: { formule: Formule; prijs: { excl: string; incl: string }; korting: number | null }[];
  };
  /** De sleutel van de beheerknop, voor een eigenaar met een abonnement. */
  beheer: "abonnement.beheren" | "abonnement.betalingRegelen" | null;
};

/** Wat /abonnement toont voor dit overzicht en deze rol; de bedragen in de taal. */
export function paginaWeergave(o: AbonnementOverzicht, rol: Rol | null, taal: Taal): PaginaWeergave {
  const geenBlokken = { gratis: null, project: null, kaarten: [] };
  const weergave: PaginaWeergave = {
    statusSleutel: statusTekstSleutel(o),
    melding: null,
    blokken: geenBlokken,
    beheer: null,
  };
  // "Betalen is nog niet ingesteld." staat één keer: in de melding, niet ook in de statusregel.
  if (!o.ingeschakeld) return { ...weergave, statusSleutel: null, melding: "uit" };
  // Een onderwijsbedrijf heeft niets te kiezen; de melding zegt alles.
  if (o.niveau === "onderwijs") return { ...weergave, statusSleutel: null, melding: "onderwijs" };
  // De gratis versie en de projectprijs gelden zolang het bedrijf geen abonnement heeft.
  const toonGratis = (o.niveau === "gratis" || o.reden === "proef") && o.limieten !== null;
  const gratis = toonGratis ? o.limieten : null;
  const project = toonGratis && o.prijzen?.project ? { prijs: prijsTekst(o.prijzen.project, taal) } : null;
  if (rol !== "eigenaar") return { ...weergave, melding: "lid", blokken: { gratis, project, kaarten: [] } };
  if (o.status !== null && LOPEND.has(o.status)) {
    const betalingRegelen = o.status === "past_due" || o.status === "unpaid";
    const beheer = betalingRegelen ? "abonnement.betalingRegelen" : "abonnement.beheren";
    // Voorbij de gratie (past_due of unpaid, niveau gratis) gelden de gratis versie en de projectprijs
    // weer: dezelfde blokken als een lid ziet, zonder kaarten (het abonnement loopt nog via het portaal).
    if (o.niveau === "gratis") return { ...weergave, beheer, blokken: { gratis, project, kaarten: [] } };
    return { ...weergave, beheer };
  }
  // Een vrijgesteld bedrijf hoeft niets te kiezen: alleen de status, geen kaarten en geen prijzenmelding.
  if (o.reden === "vrijgesteld") return weergave;
  if (!o.prijzen) return { ...weergave, melding: "prijzen", blokken: { gratis, project: null, kaarten: [] } };
  const { maand, jaar } = o.prijzen;
  return {
    ...weergave,
    blokken: {
      gratis,
      project,
      kaarten: [
        { formule: "maand", prijs: prijsTekst(maand, taal), korting: null },
        { formule: "jaar", prijs: prijsTekst(jaar, taal), korting: jaarKorting(maand, jaar) },
      ],
    },
  };
}

/**
 * Was de fout een 402 van de projecttoegang?
 * - `PROJECT_LIMIET` (het bewaren overschrijdt de gratis limiet): "limiet"; de aanroeper toont het
 *   limietvenster of een melding;
 * - `PROJECT_ALLEEN_LEZEN` (het project is gestempeld en niet vrijgegeven): "alleen-lezen"; de sessie
 *   wordt opnieuw gelezen, want het niveau van het bedrijf kan intussen veranderd zijn. Een mislukte
 *   `laad` verandert daar niets aan.
 * Een andere fout: false.
 */
export async function behandelSchrijfweigering(
  fout: unknown,
  laad: () => Promise<void>,
): Promise<"limiet" | "alleen-lezen" | false> {
  if (foutStatus(fout) !== 402) return false;
  const code = foutCode(fout);
  if (code === PROJECT_LIMIET) return "limiet";
  if (code !== PROJECT_ALLEEN_LEZEN) return false;
  try {
    await laad();
  } catch {
    // De melding volstaat; de volgende navigatie leest de sessie opnieuw.
  }
  return "alleen-lezen";
}
