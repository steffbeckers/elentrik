import { describe, expect, test } from "vitest";
import { BERICHTEN, formatteerBericht, type Bevinding, type Taal } from "../src/index";

const TALEN: readonly Taal[] = ["nl", "fr", "en"];

/** De unieke `{naam}`-plaatshouders van een tekst, gesorteerd. */
function plaatshouders(tekst: string): string[] {
  return [...new Set([...tekst.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
}

/** Alle getallen die letterlijk in de tekst staan (grenswaarden, artikelnummers), in volgorde. */
function getallen(tekst: string): string[] {
  return tekst.replace(/\{\w+\}/g, "").match(/\d+(?:[.,]\d+)*/g) ?? [];
}

describe("berichtencatalogus", () => {
  test("de catalogus heeft nl, fr en en", () => {
    expect(Object.keys(BERICHTEN).sort()).toEqual([...TALEN].sort());
  });

  for (const taal of ["fr", "en"] as const) {
    test(`${taal} heeft exact dezelfde sleutels als nl, met dezelfde plaatshouders`, () => {
      const nl = BERICHTEN.nl;
      const andere = BERICHTEN[taal];
      expect(Object.keys(andere).sort()).toEqual(Object.keys(nl).sort());
      for (const [sleutel, tekst] of Object.entries(nl)) {
        expect(plaatshouders(andere[sleutel]!), `${taal} ${sleutel}`).toEqual(plaatshouders(tekst));
      }
    });

    test(`${taal}: alle teksten zijn niet leeg`, () => {
      for (const [sleutel, tekst] of Object.entries(BERICHTEN[taal])) {
        expect(tekst.trim(), `${taal} ${sleutel}`).not.toBe("");
      }
    });
  }

  test("artikelnummers en letterlijke grenswaarden zijn in elke taal identiek per sleutel", () => {
    for (const [sleutel, tekst] of Object.entries(BERICHTEN.nl)) {
      for (const taal of ["fr", "en"] as const) {
        const andere = BERICHTEN[taal][sleutel]!;
        expect(andere.match(/(?:art\.?|article) ?\d+[\w.]*/gi)?.map((a) => a.replace(/\D+/, "")) ?? []).toEqual(
          tekst.match(/(?:art\.?|artikel) ?\d+[\w.]*/gi)?.map((a) => a.replace(/\D+/, "")) ?? [],
        );
        expect(getallen(andere), `${taal} ${sleutel}`).toEqual(getallen(tekst));
      }
    }
  });
});

describe("formatteerBericht in het Engels", () => {
  const maak = (berichtSleutel: string, parameters: Bevinding["parameters"]): Bevinding => ({
    regelId: "R1",
    ernst: "fout",
    nodeIds: [],
    berichtSleutel,
    parameters,
    afgeweken: false,
  });
  const catalogus = {
    nl: { test: "Waarde {x}" },
    fr: { test: "Valeur {x}" },
    en: { test: "Value {x}" },
  };

  test("formatteert getallen als en-GB: 1234.5 wordt 1,234.5", () => {
    expect(formatteerBericht(maak("test", { x: 1234.5 }), "en", catalogus)).toBe("Value 1,234.5");
  });

  test("de echte catalogus vult de plaatshouders in het Engels in", () => {
    const tekst = formatteerBericht(
      maak("arei.kring.max-contactdozen.overschreden", { kring: "A", aantal: 9, max: 8 }),
      "en",
    );
    expect(tekst).toContain("A");
    expect(tekst).not.toMatch(/\{\w+\}/);
    expect(tekst).not.toBe(formatteerBericht(maak("arei.kring.max-contactdozen.overschreden", { kring: "A", aantal: 9, max: 8 }), "nl"));
  });
});

describe("vertaalde parameterwaarden", () => {
  const maak = (parameters: Bevinding["parameters"]): Bevinding => ({
    regelId: "R1",
    ernst: "fout",
    nodeIds: [],
    berichtSleutel: "arei.differentieel.natte-ruimte.ontbreekt",
    parameters,
    afgeweken: false,
  });

  test("een ruimte of toestelsoort als parameter staat in de taal van het bericht", () => {
    expect(formatteerBericht(maak({ reden: "badkamer", max: 30 }), "nl")).toContain("(badkamer)");
    expect(formatteerBericht(maak({ reden: "badkamer", max: 30 }), "fr")).toContain("(salle de bain)");
    expect(formatteerBericht(maak({ reden: "badkamer", max: 30 }), "en")).toContain("(bathroom)");
    expect(formatteerBericht(maak({ reden: "wasmachine", max: 30 }), "fr")).toContain("(lave-linge)");
  });

  test("een onbekende tekst blijft zoals ze is", () => {
    expect(formatteerBericht(maak({ reden: "Mijn bureau", max: 30 }), "en")).toContain("(Mijn bureau)");
  });

  test("elke ruimte en toestelsoort van het model heeft een vertaling in alle talen", async () => {
    const { RuimteSchema, ToestelsoortSchema } = await import("@elentrik/model");
    for (const waarde of [...RuimteSchema.options, ...ToestelsoortSchema.options]) {
      for (const taal of TALEN) expect(BERICHTEN[taal][`waarde.${waarde}`], `${taal} ${waarde}`).toBeTypeOf("string");
    }
  });
});
