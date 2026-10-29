import type { Bevinding, Ernst } from "@elentrik/arei";
import { describe, expect, test } from "vitest";
import type { AutosaveStatus } from "../app/composables/useAutosave";
import { magExporteren, onopgelosteFouten, volgendVersieLabel } from "../app/editor/export";

function bevinding(ernst: Ernst, afgeweken = false): Bevinding {
  return { regelId: "r", ernst, nodeIds: ["n"], berichtSleutel: "k", parameters: {}, afgeweken };
}

describe("magExporteren", () => {
  test("alleen bij opgeslagen", () => {
    expect(magExporteren("opgeslagen")).toBe(true);
  });

  test.each<AutosaveStatus>(["bezig", "lokaal", "onbewaard", "conflict", "fout"])("niet bij %s", (status) => {
    expect(magExporteren(status)).toBe(false);
  });
});

describe("volgendVersieLabel", () => {
  test("V1 zonder eerdere exports, anders V{n+1}", () => {
    expect(volgendVersieLabel(0)).toBe("V1");
    expect(volgendVersieLabel(4)).toBe("V5");
  });

  test("zonder lijst (laden mislukt) geen voorstel: de gebruiker vult het label zelf in", () => {
    expect(volgendVersieLabel(null)).toBe("");
  });
});

describe("onopgelosteFouten", () => {
  test("geen bevindingen geeft 0", () => {
    expect(onopgelosteFouten([])).toBe(0);
  });

  test("telt alleen fouten die niet afgeweken zijn", () => {
    const bevindingen = [
      bevinding("fout"),
      bevinding("fout"),
      bevinding("fout", true),
      bevinding("waarschuwing"),
      bevinding("info"),
      bevinding("waarschuwing", true),
    ];
    expect(onopgelosteFouten(bevindingen)).toBe(2);
  });
});
