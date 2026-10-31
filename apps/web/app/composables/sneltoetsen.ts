// Puur en zonder imports uit vue of Nuxt (ruling E1): `sneltoets` vertaalt een toetsaanslag
// naar een editor-actie; de component voert die uit.
import type { Onderdeel } from "@elentrik/model";

export type Richting = "op" | "neer" | "links" | "rechts";

export type Actie =
  | { soort: "kies"; onderdeel: Onderdeel }
  | { soort: "toevoegen" }
  | { soort: "verwijder"; heleTak: boolean }
  | { soort: "ongedaan" }
  | { soort: "opnieuw" }
  | { soort: "navigeer"; richting: Richting }
  | { soort: "wisSelectie" }
  /** Opent het symbolenvenster; ook in alleen-lezen, want bekijken wijzigt niets. */
  | { soort: "symbolen" };

export type Toets = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** Het doel van de toetsaanslag is een tekstveld (input, textarea, select, contenteditable); zie `doelSoort`. */
  doelIsInvoer: boolean;
  /** Het doel van de toetsaanslag is een knop: Enter en spatie blijven dan bij de knop, de rest werkt gewoon. */
  doelIsKnop?: boolean;
  /** De toets blijft ingedrukt (`event.repeat`): verwijderen en toevoegen gebeuren dan niet nog eens. */
  herhaald?: boolean;
  /**
   * De editor is alleen-lezen (geen abonnement): alles wat het document wijzigt (toevoegen,
   * verwijderen, ongedaan maken, opnieuw) geeft `null`. Kiezen, navigeren, de selectie wissen en het
   * symbolenvenster openen blijven.
   */
  alleenLezen?: boolean;
};

/** Elementen waarin toetsen voor de widget zelf zijn (menu's, dialogen, lijsten, tabbladen). */
export const WIDGET_SELECTOR =
  "[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[role=tablist],[role=combobox]";

export type NegeerToets = {
  defaultPrevented: boolean;
  isComposing: boolean;
  altKey: boolean;
  /** Het doel van de toetsaanslag ligt in (of is) een widget uit `WIDGET_SELECTOR`. */
  doelInWidget: boolean;
  /** Er staat een overlay open (bv. een Nuxt UI-dialoog: `[role=dialog][data-state=open]`). */
  overlayOpen: boolean;
};

/**
 * Of de editor de toetsaanslag helemaal moet laten liggen: al afgehandeld door iemand anders,
 * tekstinvoer via een IME, Alt-combinaties, of een widget/overlay die zijn eigen toetsen gebruikt.
 */
export function moetNegeren(toets: NegeerToets): boolean {
  return (
    toets.defaultPrevented || toets.isComposing || toets.altKey || toets.doelInWidget || toets.overlayOpen
  );
}

/** Wat `doelSoort` van een element nodig heeft; een `HTMLElement` voldoet. */
export type DoelElement = { tagName: string; type?: string; isContentEditable?: boolean };

export type DoelSoort = "invoer" | "knop" | "overig";

/** INPUT-types die geen tekst aannemen en zich als knop gedragen. */
const KNOP_INVOER = new Set(["button", "checkbox", "radio", "submit"]);

/**
 * Hoe een element met toetsen omgaat: een `invoer` (tekstveld) houdt alle toetsen, een `knop` alleen
 * Enter en spatie, en bij `overig` is de editor aan zet.
 */
export function doelSoort(doel: DoelElement): DoelSoort {
  if (doel.isContentEditable) return "invoer";
  const tag = doel.tagName.toUpperCase();
  if (tag === "BUTTON") return "knop";
  if (tag === "INPUT") return KNOP_INVOER.has((doel.type ?? "").toLowerCase()) ? "knop" : "invoer";
  return tag === "TEXTAREA" || tag === "SELECT" ? "invoer" : "overig";
}

/** Spatie houdt de canvas vast om te schuiven, behalve in een tekstveld of op een knop (die gebruiken haar zelf). */
export function spatieSchuift(key: string, soort: DoelSoort): boolean {
  return key === " " && soort === "overig";
}

/** De sneltoets (kleine letter) van het symbolenvenster; ook getoond in het paneel Onderdelen. */
export const SYMBOLEN_TOETS = "a";

/** De sneltoets (kleine letter) per onderdeel; ook getoond in het paneel Onderdelen. */
export const ONDERDEEL_PER_TOETS: Readonly<Record<string, Onderdeel>> = {
  c: "contactdoos",
  l: "lichtpunt",
  s: "schakelaar",
  t: "toestel",
  d: "differentieel",
  z: "zekering",
  b: "onderbord",
};

const RICHTINGEN: Record<string, Richting> = {
  ArrowUp: "op",
  ArrowDown: "neer",
  ArrowLeft: "links",
  ArrowRight: "rechts",
};

export function sneltoets(toets: Toets): Actie | null {
  const modifier = toets.ctrlKey || toets.metaKey;
  const key = toets.key.length === 1 ? toets.key.toLowerCase() : toets.key;

  if (modifier) {
    if (toets.alleenLezen) return null;
    if (key === "z") return toets.shiftKey ? { soort: "opnieuw" } : { soort: "ongedaan" };
    if (key === "y" && !toets.shiftKey) return { soort: "opnieuw" };
    return null;
  }
  if (toets.doelIsInvoer) return null;
  if (toets.doelIsKnop && (key === "Enter" || key === " ")) return null;

  if (key === "Enter") return toets.herhaald || toets.alleenLezen ? null : { soort: "toevoegen" };
  if (key === "Delete" || key === "Backspace") {
    return toets.herhaald || toets.alleenLezen ? null : { soort: "verwijder", heleTak: toets.shiftKey };
  }
  if (key === "Escape") return { soort: "wisSelectie" };

  const richting = RICHTINGEN[key];
  if (richting) return { soort: "navigeer", richting };
  if (key === SYMBOLEN_TOETS) return { soort: "symbolen" };

  const onderdeel = ONDERDEEL_PER_TOETS[key];
  return onderdeel ? { soort: "kies", onderdeel } : null;
}
