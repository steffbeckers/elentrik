// VOORLOPIG — niet nagekeken tegen AREI
// Alle waarden hieronder zijn werkhypotheses en geen bevestigde AREI-eisen.
export const PARAMETERS_AREI_2020_V1 = {
  algemeenDifferentieelMax_mA: 300,
  natteRuimteDifferentieelMax_mA: 30,
  natteRuimtes: ["badkamer", "wasplaats"],
  toestellenAchterLaagGevoelig: ["wasmachine", "droogkast", "vaatwasser"],
  // [doorsnede in mm², maximale beveiliging in A]
  maxStroomPerDoorsnede: [
    [1.5, 16],
    [2.5, 20],
    [4, 25],
    [6, 32],
    [10, 40],
  ],
  maxContactdozenPerKring: 8,
  minDoorsnedeContactdozen_mm2: 2.5,
  minDoorsnedeVerlichting_mm2: 1.5,
  toestellenEigenKring: ["kookplaat", "oven", "boiler", "laadpaal"],
  polenPerStroomtype: { "2x230V": 2, "3x230V": 3, "3N400V": 4 },
} as const;

export type Arei2020Parameters = typeof PARAMETERS_AREI_2020_V1;
