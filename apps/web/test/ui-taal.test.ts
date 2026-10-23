// De taal van Nuxt UI (de aria-labels en teksten van de componenten) volgt de taal van de interface.
import { fr, en_gb, nl } from "@nuxt/ui/locale";
import { describe, expect, test } from "vitest";
import { UI_LOCALES, uiLocale } from "../app/sessie/ui-taal";
import { TALEN } from "../shared/taal";

describe("uiLocale", () => {
  test("is exhaustief: elke taal heeft een Nuxt UI-locale", () => {
    expect(Object.keys(UI_LOCALES).sort()).toEqual([...TALEN].sort());
    for (const taal of TALEN) expect(uiLocale(taal).messages).toBeDefined();
  });

  test("nl, fr en en wijzen naar nl, fr en en_gb", () => {
    expect(uiLocale("nl")).toBe(nl);
    expect(uiLocale("fr")).toBe(fr);
    expect(uiLocale("en")).toBe(en_gb);
  });

  test("een onbekende waarde valt terug op Nederlands", () => {
    expect(uiLocale("de" as never)).toBe(nl);
  });
});
