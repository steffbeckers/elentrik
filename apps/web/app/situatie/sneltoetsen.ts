// Puur en zonder imports uit vue of Nuxt (ruling E1): `situatieSneltoets` vertaalt een
// toetsaanslag op het plan naar een actie; `PlanCanvas` voert die uit. Het filter op widgets,
// dialogen en IME (`moetNegeren`) gebeurt vooraf, net als in het eendraadschema.

/** Pijltjes verschuiven zoveel rasterpixels, met Shift `FIJNE_STAP`. */
const STAP_PX = 10;
const FIJNE_STAP_PX = 1;

export type SituatieActie =
  | { soort: "draai"; richting: 1 | -1 }
  | { soort: "haalVanPlan" }
  | { soort: "schuif"; dx: number; dy: number }
  | { soort: "annuleer" }
  | { soort: "ongedaan" }
  | { soort: "opnieuw" };

export type SituatieToets = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** Het doel is een tekstveld: dat houdt al zijn toetsen (zie `doelSoort`). */
  doelIsInvoer: boolean;
  /** Het doel is een knop: Enter en spatie blijven bij de knop, de rest werkt gewoon. */
  doelIsKnop: boolean;
  /** De editor is alleen-lezen: draaien, schuiven, van het plan halen, ongedaan maken en opnieuw geven `null`. */
  alleenLezen?: boolean;
};

/** Eenheidsrichting per pijltjestoets. */
const RICHTINGEN: Readonly<Record<string, { x: number; y: number }>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export function situatieSneltoets(toets: SituatieToets): SituatieActie | null {
  const key = toets.key.length === 1 ? toets.key.toLowerCase() : toets.key;

  if (toets.ctrlKey || toets.metaKey) {
    if (toets.alleenLezen) return null;
    if (key === "z") return toets.shiftKey ? { soort: "opnieuw" } : { soort: "ongedaan" };
    if (key === "y" && !toets.shiftKey) return { soort: "opnieuw" };
    return null;
  }
  if (toets.doelIsInvoer) return null;
  if (toets.doelIsKnop && (key === "Enter" || key === " ")) return null;

  if (toets.alleenLezen) return key === "Escape" ? { soort: "annuleer" } : null;

  if (key === "r") return { soort: "draai", richting: toets.shiftKey ? -1 : 1 };
  if (key === "Delete" || key === "Backspace") return { soort: "haalVanPlan" };
  if (key === "Escape") return { soort: "annuleer" };

  const richting = RICHTINGEN[key];
  if (richting) {
    const stap = toets.shiftKey ? FIJNE_STAP_PX : STAP_PX;
    // `+ 0` maakt van -0 een gewone 0.
    return { soort: "schuif", dx: richting.x * stap + 0, dy: richting.y * stap + 0 };
  }
  return null;
}
