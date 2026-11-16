import { describe, expect, test } from "vitest";
import { MAX_KRINGEN_PER_DIFFERENTIEEL, RuimteSchema, StroomtypeSchema, ToestelsoortSchema } from "@elentrik/model";
import { PARAMETERS_AREI_2020_V1 } from "../src/regelsets/arei-2020/parameters";

// Een typfout in een parameterlijst zou een regel stilzwijgend uitschakelen.
describe("PARAMETERS_AREI_2020_V1 sluit aan op het model", () => {
  const p = PARAMETERS_AREI_2020_V1;

  test("de grens van kringen per differentieel is dezelfde als die van de editor en het bordoverzicht", () => {
    // Het model mag arei niet importeren; de sjablonen, de slimme bestemming en het bordoverzicht
    // gebruiken daarom de constante van het model. Die moet gelijk blijven aan de regelparameter.
    expect(p.maxStroombanenPerDifferentieel).toBe(MAX_KRINGEN_PER_DIFFERENTIEEL);
  });

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

  // Boek 1, 4.4.1.5, tabel 1: [mm², smeltveiligheid in A, automaat in A].
  test("maxStroomPerDoorsnede is tabel 1 met een grens voor zekering en automaat, tot 35 mm²", () => {
    expect(p.maxStroomPerDoorsnede).toEqual([
      [1.5, 10, 16],
      [2.5, 16, 20],
      [4, 20, 25],
      [6, 32, 40],
      [10, 50, 63],
      [16, 63, 80],
      [25, 80, 100],
      [35, 100, 125],
    ]);
  });

  test("maxStroomPerDoorsnede stijgt per rij en de automaat mag nooit minder dan de zekering", () => {
    let vorige: readonly [number, number, number] = [0, 0, 0];
    for (const rij of p.maxStroomPerDoorsnede) {
      expect(rij[1], `${rij[0]} mm²`).toBeLessThanOrEqual(rij[2]);
      for (const kolom of [0, 1, 2] as const) expect(rij[kolom], `${rij[0]} mm²`).toBeGreaterThan(vorige[kolom]);
      vorige = rij;
    }
  });

  test("polenPerStroomtype heeft exact de stroomtypes van het model als sleutels", () => {
    expect(Object.keys(p.polenPerStroomtype).sort()).toEqual([...StroomtypeSchema.options].sort());
  });
});
