// De lijst talen in nuxt.config.ts (i18n.locales) is dezelfde als LOCALES (shared/taal.ts): codes en
// `language` (die `<html lang>` voedt). Een taal in de ene lijst en niet in de andere valt hier op.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { LOCALES } from "../shared/taal";

type Locale = { code: string; language: string; file: string };
let locales: Locale[] = [];

beforeAll(async () => {
  // `defineNuxtConfig` is een auto-import van Nuxt; hier is het de identiteitsfunctie.
  vi.stubGlobal("defineNuxtConfig", (config: unknown) => config);
  const config = (await import("../nuxt.config")).default as { i18n: { locales: Locale[]; defaultLocale: string } };
  locales = config.i18n.locales;
  expect(config.i18n.defaultLocale).toBe("nl");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("nuxt.config i18n.locales", () => {
  test("codes en languages zijn precies LOCALES, nl eerst", () => {
    expect(Object.fromEntries(locales.map((l) => [l.code, l.language]))).toEqual(LOCALES);
    expect(locales[0]?.code).toBe("nl");
  });

  test("elke locale heeft haar vertaalbestand", () => {
    for (const l of locales) expect(existsSync(join(import.meta.dirname, "..", "i18n", "locales", l.file)), l.file).toBe(true);
  });
});
