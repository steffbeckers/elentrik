// Puur, zonder imports uit vue of Nuxt (ruling E1): de gedeelde lijst van alle sneltoetsen. Het
// sneltoetsenoverzicht toont ze; een test controleert dat elke toets die `sneltoets` of
// `situatieSneltoets` afhandelt hier staat, zodat overzicht en afhandeling niet uit elkaar lopen.
import { ONDERDEEL_PER_TOETS, OVERZICHT_TOETS, SYMBOLEN_TOETS } from "../composables/sneltoetsen";

export type SneltoetsContext = "schema" | "situatie";

export type Sneltoets = {
  /** De toets in vaste vorm: "C", "Shift+R", "Ctrl+Z", "ArrowUp", "?" (zie `toetsNaam`). Ctrl staat ook voor Cmd. */
  toets: string;
  /** Regels met dezelfde sleutel staan in het overzicht op één regel, als alternatieven. */
  omschrijvingSleutel: string;
  context: SneltoetsContext;
};

const PIJLEN = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;

function regels(context: SneltoetsContext, omschrijving: string, toetsen: readonly string[]): Sneltoets[] {
  return toetsen.map((toets) => ({ toets, omschrijvingSleutel: `editor.sneltoetsen.${omschrijving}`, context }));
}

export const SNELTOETSEN: readonly Sneltoets[] = [
  ...Object.entries(ONDERDEEL_PER_TOETS).flatMap(([toets, onderdeel]) =>
    regels("schema", `kies.${onderdeel}`, [toets.toUpperCase()]),
  ),
  ...regels("schema", "symbolen", [SYMBOLEN_TOETS.toUpperCase()]),
  ...regels("schema", "toevoegen", ["Enter"]),
  ...regels("schema", "verwijder", ["Delete", "Backspace"]),
  ...regels("schema", "verwijderTak", ["Shift+Delete", "Shift+Backspace"]),
  ...regels("schema", "navigeer", PIJLEN),
  ...regels("schema", "wisSelectie", ["Escape"]),
  ...regels("schema", "dupliceer", ["Ctrl+D"]),
  ...regels("schema", "ongedaan", ["Ctrl+Z"]),
  ...regels("schema", "opnieuw", ["Ctrl+Y", "Ctrl+Shift+Z"]),
  ...regels("schema", "verschuifCanvas", ["Space"]),
  ...regels("schema", "overzicht", [OVERZICHT_TOETS]),

  ...regels("situatie", "draai", ["R"]),
  ...regels("situatie", "draaiTerug", ["Shift+R"]),
  ...regels("situatie", "schuif", PIJLEN),
  ...regels("situatie", "schuifFijn", PIJLEN.map((p) => `Shift+${p}`)),
  ...regels("situatie", "vanPlan", ["Delete", "Backspace"]),
  ...regels("situatie", "annuleer", ["Escape"]),
  ...regels("situatie", "ongedaan", ["Ctrl+Z"]),
  ...regels("situatie", "opnieuw", ["Ctrl+Y", "Ctrl+Shift+Z"]),
  ...regels("situatie", "verschuifCanvas", ["Space"]),
  ...regels("situatie", "overzicht", [OVERZICHT_TOETS]),
];

/**
 * De vaste naam van een toetsaanslag, zoals in `SNELTOETSEN`: "Ctrl+Shift+Z", "Shift+R", "C", "?".
 * Cmd telt als Ctrl. Shift staat er niet bij een leesteken dat zelf al Shift vraagt (zoals "?").
 */
export function toetsNaam(toets: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey?: boolean }): string {
  const enkel = toets.key.length === 1;
  const letter = enkel && toets.key.toLowerCase() !== toets.key.toUpperCase();
  const key = toets.key === " " ? "Space" : enkel ? toets.key.toUpperCase() : toets.key;
  const delen: string[] = [];
  if (toets.ctrlKey || toets.metaKey) delen.push("Ctrl");
  if (toets.shiftKey && (!enkel || letter)) delen.push("Shift");
  delen.push(key);
  return delen.join("+");
}
