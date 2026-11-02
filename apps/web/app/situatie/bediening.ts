import { situatieSneltoets, type SituatieToets } from "./sneltoetsen";

/** Invalid drafts stay in the form and never reach a document operation. */
export function leesPlanGetal(tekst: string, soort: "percentage" | "offset"): number | null {
  if (!tekst.trim()) return null;
  const waarde = Number(tekst);
  if (!Number.isFinite(waarde)) return null;
  if (soort === "percentage" && (waarde < 25 || waarde > 400)) return null;
  return waarde;
}

type CursorToets = Pick<SituatieToets, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "alleenLezen">;
type CursorActie = { soort: "schuif"; dx: number; dy: number } | { soort: "bevestig" } | { soort: "annuleer" };

/** Placement and measurement use a local cursor; only confirmation changes the document. */
export function planCursorToets(toets: CursorToets): CursorActie | null {
  if (toets.ctrlKey || toets.metaKey) return null;
  if (toets.key === "Escape") return { soort: "annuleer" };
  if (toets.alleenLezen) return null;
  if (toets.key === "Enter") return { soort: "bevestig" };
  const actie = situatieSneltoets({ ...toets, doelIsInvoer: false, doelIsKnop: false });
  return actie?.soort === "schuif" ? actie : null;
}
