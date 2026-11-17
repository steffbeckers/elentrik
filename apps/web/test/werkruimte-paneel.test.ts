import { describe, expect, test } from "vitest";
import { paneelNaSelectie, type Paneel } from "../app/editor/werkruimte-paneel";

const klik = { aantal: 1, vorigAantal: 0, documentGewijzigd: false, heeftOnderdelen: true };
const leeg = { aantal: 0, vorigAantal: 1, documentGewijzigd: false, heeftOnderdelen: true };

describe("paneelNaSelectie", () => {
  test("een onderdeel aanklikken wisselt Onderdelen voor Eigenschappen", () => {
    expect(paneelNaSelectie("onderdelen", klik)).toBe("eigenschappen");
    expect(paneelNaSelectie("eigenschappen", { ...klik, vorigAantal: 1 })).toBe("eigenschappen");
  });

  test("de selectie valt weg: Eigenschappen maakt plaats voor Onderdelen", () => {
    expect(paneelNaSelectie("eigenschappen", leeg)).toBe("onderdelen");
    // Ook als de selectie verdwijnt door een verwijdering.
    expect(paneelNaSelectie("eigenschappen", { ...leeg, documentGewijzigd: true })).toBe("onderdelen");
  });

  test("Bevindingen, Planopmaak en een gesloten paneel blijven zoals ze zijn", () => {
    for (const paneel of ["bevindingen", "opmaak", null] satisfies (Paneel | null)[]) {
      expect(paneelNaSelectie(paneel, klik)).toBe(paneel);
      expect(paneelNaSelectie(paneel, leeg)).toBe(paneel);
    }
  });

  test("een selectie door een toevoeging wisselt niet: wie opbouwt, houdt Onderdelen", () => {
    expect(paneelNaSelectie("onderdelen", { ...klik, documentGewijzigd: true })).toBe("onderdelen");
  });

  test("zonder paneel Onderdelen op het tabblad blijft Eigenschappen staan", () => {
    expect(paneelNaSelectie("eigenschappen", { ...leeg, heeftOnderdelen: false })).toBe("eigenschappen");
  });

  test("een lege selectie die leeg blijft, verandert niets", () => {
    expect(paneelNaSelectie("eigenschappen", { ...leeg, vorigAantal: 0 })).toBe("eigenschappen");
  });
});
