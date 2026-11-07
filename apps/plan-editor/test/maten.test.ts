import { describe, expect, test } from "vitest";
import { formatteerMaat, formatteerOppervlak } from "../src/maten";
import { formatLength, formatArea, zetMaatTaal } from "../src/settings";

describe("formatteerMaat", () => {
  test("nl-BE gebruikt de decimale komma", () => {
    expect(formatteerMaat(6.5, "nl-BE")).toBe("6,5 m");
    expect(formatteerMaat(6.5, "nl")).toBe("6,5 m");
    expect(formatteerMaat(6.5, "fr")).toBe("6,5 m");
  });
  test("en gebruikt de decimale punt", () => {
    expect(formatteerMaat(6.5, "en")).toBe("6.5 m");
  });
  test("het aantal decimalen is instelbaar", () => {
    expect(formatteerMaat(6.5, "nl", 2)).toBe("6,50 m");
  });
  test("oppervlak met m²", () => {
    expect(formatteerOppervlak(26, "nl")).toBe("26,0 m²");
    expect(formatteerOppervlak(26, "en")).toBe("26.0 m²");
  });
});

describe("de maatlabels van het plan volgen de taal", () => {
  test("lengte en oppervlak in nl", () => {
    zetMaatTaal("nl");
    expect(formatLength(650, "metric")).toBe("6,5 m");
    expect(formatLength(50, "metric")).toBe("50 cm");
    expect(formatArea(26, "metric")).toBe("26,0 m²");
  });
  test("lengte in en", () => {
    zetMaatTaal("en");
    expect(formatLength(650, "metric")).toBe("6.5 m");
    zetMaatTaal("nl");
  });
});
