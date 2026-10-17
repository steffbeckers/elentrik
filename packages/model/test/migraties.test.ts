import { describe, expect, test } from "vitest";
import {
  MIGRATIES,
  SCHEMA_VERSIE,
  migreer,
  nieuwDocument,
  pasMigratiesToe,
  type Migratie,
} from "../src/index";
import { kloon, vangFout } from "./hulp";

describe("migreer", () => {
  test("een document met de huidige versie komt ongewijzigd terug", () => {
    const doc = nieuwDocument({ klantNaam: "Janssens", datum: "2026-10-17" });
    expect(migreer(kloon(doc))).toEqual(doc);
  });

  test("een hogere schemaVersion geeft ONBEKENDE_SCHEMAVERSIE", () => {
    const doc = { ...nieuwDocument(), schemaVersion: SCHEMA_VERSIE + 1 };
    expect(vangFout(() => migreer(doc)).code).toBe("ONBEKENDE_SCHEMAVERSIE");
  });

  test("zonder schemaVersion volgt ONGELDIG_SCHEMA", () => {
    const { schemaVersion: _weg, ...zonder } = nieuwDocument();
    expect(vangFout(() => migreer(zonder)).code).toBe("ONGELDIG_SCHEMA");
  });

  test.each([
    ["tekst", "tekst"],
    ["null", null],
    ["array", []],
  ])("invoer die geen object is (%s) geeft ONGELDIG_SCHEMA", (_naam, invoer) => {
    expect(vangFout(() => migreer(invoer)).code).toBe("ONGELDIG_SCHEMA");
  });

  test.each([
    ["niet-geheel getal", 1.5],
    ["tekst", "1"],
    ["nul", 0],
    ["negatief", -1],
  ])("ongeldige schemaVersion (%s) geeft ONGELDIG_SCHEMA", (_naam, versie) => {
    const doc = { ...nieuwDocument(), schemaVersion: versie };
    expect(vangFout(() => migreer(doc)).code).toBe("ONGELDIG_SCHEMA");
  });

  test("MIGRATIES is voorlopig leeg", () => {
    expect(Object.keys(MIGRATIES)).toEqual([]);
  });
});

describe("pasMigratiesToe", () => {
  const nep: Record<number, Migratie> = {
    1: (d) => ({ ...d, a: 1 }),
    2: (d) => ({ ...d, b: (d.a as number) + 1 }),
  };

  test("past migraties in volgorde toe en zet schemaVersion zelf op n+1", () => {
    const uit = pasMigratiesToe({ schemaVersion: 1 }, nep, 1, 3);
    expect(uit).toEqual({ a: 1, b: 2, schemaVersion: 3 });
  });

  test("muteert de invoer niet", () => {
    const invoer = { schemaVersion: 1 };
    const kopie = kloon(invoer);
    pasMigratiesToe(invoer, nep, 1, 3);
    expect(invoer).toEqual(kopie);
  });

  test("van === naar geeft een gelijke inhoud terug", () => {
    expect(pasMigratiesToe({ schemaVersion: 2, x: 1 }, nep, 2, 2)).toEqual({
      schemaVersion: 2,
      x: 1,
    });
  });

  test("een ontbrekende stap geeft ONBEKENDE_SCHEMAVERSIE", () => {
    const fout = vangFout(() => pasMigratiesToe({ schemaVersion: 1 }, { 1: nep[1]! }, 1, 3));
    expect(fout.code).toBe("ONBEKENDE_SCHEMAVERSIE");
  });

  test("van > naar geeft ONBEKENDE_SCHEMAVERSIE", () => {
    expect(vangFout(() => pasMigratiesToe({ schemaVersion: 3 }, nep, 3, 1)).code).toBe(
      "ONBEKENDE_SCHEMAVERSIE",
    );
  });
});
