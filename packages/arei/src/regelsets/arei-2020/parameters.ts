// VOORLOPIG — niet nagekeken tegen AREI
// Alle waarden hieronder zijn werkhypotheses en geen bevestigde AREI-eisen.
export const PARAMETERS_AREI_2020_V1 = {
  algemeenDifferentieelMax_mA: 300,
  natteRuimteDifferentieelMax_mA: 30,
  natteRuimtes: ["badkamer", "wasplaats"],
  toestellenAchterLaagGevoelig: ["wasmachine", "droogkast", "vaatwasser"],
  // Boek 1, 4.4.1.5, tabel 1 (uit de toelichting van het sectorkenniscentrum bij de kabelberekening):
  // [doorsnede in mm², maximale smeltveiligheid in A, maximale automaat in A]
  maxStroomPerDoorsnede: [
    [1.5, 10, 16],
    [2.5, 16, 20],
    [4, 20, 25],
    [6, 32, 40],
    [10, 50, 63],
    [16, 63, 80],
    [25, 80, 100],
    [35, 100, 125],
  ],
  maxContactdozenPerKring: 8,
  minDoorsnedeContactdozen_mm2: 2.5,
  minDoorsnedeVerlichting_mm2: 1.5,
  toestellenEigenKring: ["kookplaat", "oven", "boiler", "laadpaal"],
  polenPerStroomtype: { "2x230V": 2, "3x230V": 3, "3N400V": 4 },
  // Boek 1, 4.2.4.3 zoals gewijzigd op 1 juni 2023: eindstroombanen per differentieel van maximaal 30 mA.
  aanvullendDifferentieelMax_mA: 30,
  maxStroombanenPerDifferentieel: 8,
  // Boek 1, 4.2.4.3: eisen die gelden zodra de spreidingsweerstand van de aarding boven deze grens ligt.
  spreidingsweerstandGrens_ohm: 30,
  minDifferentielenBovenGrens: 2,
  maxContactdozenPerDifferentieelBovenGrens: 16,
  overigeKringenDifferentieelMax_mA: 100,
  // Laadpaal: differentieel van maximaal 30 mA, type B of DC-detectie tot deze waarde.
  laadpaalDifferentieelMax_mA: 30,
  laadpaalDcDetectieMax_mA: 6,
  // Uit vakkennis, nog te toetsen aan de tekst.
  minKringenVerlichting: 2,
  // Richtwaarden voor de spanningsval, geen AREI-eis. Soortelijke weerstand van koper in Ω·mm²/m.
  soortelijkeWeerstandKoper_ohm_mm2_per_m: 0.0225,
  maxSpanningsvalVerlichting_pct: 3,
  maxSpanningsval_pct: 5,
} as const;

export type Arei2020Parameters = typeof PARAMETERS_AREI_2020_V1;
