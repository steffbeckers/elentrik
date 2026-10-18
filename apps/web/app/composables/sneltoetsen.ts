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
  | { soort: "wisSelectie" };

export type Toets = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** Het doel van de toetsaanslag is een invoerveld (input, textarea, select, contenteditable). */
  doelIsInvoer: boolean;
};

const ONDERDELEN: Record<string, Onderdeel> = {
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
    if (key === "z") return toets.shiftKey ? { soort: "opnieuw" } : { soort: "ongedaan" };
    if (key === "y" && !toets.shiftKey) return { soort: "opnieuw" };
    return null;
  }
  if (toets.doelIsInvoer) return null;

  if (key === "Enter") return { soort: "toevoegen" };
  if (key === "Delete" || key === "Backspace") return { soort: "verwijder", heleTak: toets.shiftKey };
  if (key === "Escape") return { soort: "wisSelectie" };

  const richting = RICHTINGEN[key];
  if (richting) return { soort: "navigeer", richting };

  const onderdeel = ONDERDELEN[key];
  return onderdeel ? { soort: "kies", onderdeel } : null;
}
