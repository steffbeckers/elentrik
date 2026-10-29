// De taal van Nuxt UI (de teksten en aria-labels van zijn componenten, zoals "Sluiten") volgt de
// taal van de interface. Expliciete imports, geen auto-imports: Vitest importeert deze module.
import { en_gb, fr, nl } from "@nuxt/ui/locale";
import { type Taal } from "../../shared/taal";

/** Nuxt UI-locale per taal; `Record<Taal, …>` dwingt af dat elke taal er een heeft. */
export const UI_LOCALES: Readonly<Record<Taal, typeof nl>> = Object.freeze({ nl, fr, en: en_gb });

/** De Nuxt UI-locale van een taal; een onbekende waarde valt terug op Nederlands. */
export function uiLocale(taal: Taal): typeof nl {
  return UI_LOCALES[taal] ?? nl;
}
