import { describe, expect, test } from "vitest";
import { RuimteSchema, StroomtypeSchema, ToestelsoortSchema } from "@elentrik/model";
import { PARAMETERS_AREI_2020_V1 } from "../src/regelsets/arei-2020/parameters";

// Een typfout in een parameterlijst zou een regel stilzwijgend uitschakelen.
describe("PARAMETERS_AREI_2020_V1 sluit aan op het model", () => {
  const p = PARAMETERS_AREI_2020_V1;

  test("natteRuimtes zijn geldige ruimtes", () => {
    expect(p.natteRuimtes.length).toBeGreaterThan(0);
    for (const ruimte of p.natteRuimtes) {
      expect(RuimteSchema.safeParse(ruimte).success, `ruimte ${ruimte}`).toBe(true);
    }
  });

  test("toestellenAchterLaagGevoelig zijn geldige toestelsoorten", () => {
    expect(p.toestellenAchterLaagGevoelig.length).toBeGreaterThan(0);
    for (const soort of p.toestellenAchterLaagGevoelig) {
      expect(ToestelsoortSchema.safeParse(soort).success, `toestelsoort ${soort}`).toBe(true);
    }
  });

  test("toestellenEigenKring zijn geldige toestelsoorten", () => {
    expect(p.toestellenEigenKring.length).toBeGreaterThan(0);
    for (const soort of p.toestellenEigenKring) {
      expect(ToestelsoortSchema.safeParse(soort).success, `toestelsoort ${soort}`).toBe(true);
    }
  });

  test("polenPerStroomtype heeft exact de stroomtypes van het model als sleutels", () => {
    expect(Object.keys(p.polenPerStroomtype).sort()).toEqual([...StroomtypeSchema.options].sort());
  });
});
