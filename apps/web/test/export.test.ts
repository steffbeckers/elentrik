import type { Bevinding, Ernst } from "@elentrik/arei";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { AutosaveStatus } from "../app/composables/useAutosave";
import { conflictSleutels } from "../app/editor/conflict";
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

describe("conflictSleutels", () => {
  type Boom = { [sleutel: string]: string | Boom };
  const teksten = (taal: string) =>
    JSON.parse(readFileSync(join(import.meta.dirname, "..", "i18n", "locales", `${taal}.json`), "utf8")) as Boom;
  function tekst(boom: Boom, sleutel: string): string {
    const waarde = sleutel.split(".").reduce<string | Boom | undefined>((b, deel) => (typeof b === "object" ? b[deel] : undefined), boom);
    if (typeof waarde !== "string") throw new Error(`${sleutel} ontbreekt`);
    return waarde;
  }

  test("met lokale wijzigingen de bestaande teksten van de autosave", () => {
    expect(conflictSleutels(true)).toEqual({
      beschrijving: "editor.conflict.beschrijving",
      serverversieUitleg: "editor.conflict.serverversieUitleg",
      kopie: "editor.conflict.kopie",
      kopieUitleg: "editor.conflict.kopieUitleg",
    });
  });

  test.each(["nl", "fr", "en"])("zonder lokale wijzigingen (%s) staat er niets over lokale wijzigingen", (taal) => {
    const sleutels = conflictSleutels(false);
    expect(Object.values(sleutels).every((s) => s.startsWith("editor.conflict.zonderLokaal."))).toBe(true);
    for (const sleutel of Object.values(sleutels)) {
      expect(tekst(teksten(taal), sleutel)).not.toMatch(/lokaa?l|local|locale/i);
    }
  });

  test("de kopie en de serverversie uitleg zeggen het juiste zonder lokale wijzigingen", () => {
    const sleutels = conflictSleutels(false);
    const nl = teksten("nl");
    expect(tekst(nl, sleutels.kopie)).toMatch(/nieuwste|actuele/i);
    expect(tekst(nl, sleutels.beschrijving)).toMatch(/PDF/);
  });
});
