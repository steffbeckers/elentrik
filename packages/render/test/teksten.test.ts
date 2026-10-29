import { describe, expect, test } from "vitest";
import { LOCALES, NL, TEKSTEN, type Taal } from "../src/index";

/** Alle sleutelpaden van een boom, bv. "bijlage.fouten"; de bladeren zijn strings. */
function paden(boom: unknown, voorvoegsel = ""): string[] {
  if (typeof boom === "string") return [voorvoegsel];
  return Object.entries(boom as Record<string, unknown>)
    .flatMap(([sleutel, kind]) => paden(kind, voorvoegsel === "" ? sleutel : `${voorvoegsel}.${sleutel}`))
    .sort();
}

function bladeren(boom: unknown): string[] {
  if (typeof boom === "string") return [boom];
  return Object.values(boom as Record<string, unknown>).flatMap(bladeren);
}

describe("TEKSTEN", () => {
  test("de talen zijn nl, fr en en, met de Belgische en Britse locales", () => {
    expect(Object.keys(TEKSTEN).sort()).toEqual(["en", "fr", "nl"]);
    expect(LOCALES).toEqual({ nl: "nl-BE", fr: "fr-BE", en: "en-GB" });
    expect(TEKSTEN.nl).toBe(NL);
  });

  for (const taal of ["fr", "en"] as const satisfies readonly Taal[]) {
    test(`${taal} heeft recursief dezelfde sleutels als nl`, () => {
      expect(paden(TEKSTEN[taal])).toEqual(paden(NL));
    });

    test(`${taal}: elke tekst is een niet-lege string`, () => {
      for (const tekst of bladeren(TEKSTEN[taal])) {
        expect(tekst.trim()).not.toBe("");
      }
    });

    test(`${taal}: de paginatitels zijn vertaald`, () => {
      expect(TEKSTEN[taal].paginatitels.eendraadschema).not.toBe(NL.paginatitels.eendraadschema);
      expect(TEKSTEN[taal].paginatitels.kringenlijst).not.toBe(NL.paginatitels.kringenlijst);
    });
  }

  test("de kerntermen volgen de woordenlijst", () => {
    expect(TEKSTEN.fr.paginatitels).toMatchObject({
      eendraadschema: "Schéma unifilaire",
      situatieschema: "Plan de position",
      kringenlijst: "Liste des circuits",
    });
    expect(TEKSTEN.en.paginatitels).toMatchObject({
      eendraadschema: "Single-line diagram",
      situatieschema: "Layout plan",
      kringenlijst: "Circuit list",
    });
  });
});
