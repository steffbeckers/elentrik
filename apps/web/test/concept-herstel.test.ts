// Het herstel van een lokaal concept loopt door `migreer`: een concept van een oudere schemaversie
// wordt gemigreerd geladen, een document dat niet te migreren is geeft null.
import { describe, expect, test, vi } from "vitest";
import { nieuwProjectDocument, type InstallatieDocument } from "@elentrik/model";
import { herstelDocument } from "../app/editor/concept-herstel";

const document = { id: "d1", schemaVersion: 1 } as unknown as InstallatieDocument;
const gemigreerd = { id: "d1", schemaVersion: 2 } as unknown as InstallatieDocument;

describe("herstelDocument", () => {
  test("geeft het gemigreerde document", () => {
    const migreerFn = vi.fn().mockReturnValue(gemigreerd);
    expect(herstelDocument(document, migreerFn)).toBe(gemigreerd);
    expect(migreerFn).toHaveBeenCalledWith(document);
  });

  test("geeft null als de migratie gooit", () => {
    const migreerFn = vi.fn().mockImplementation(() => {
      throw new Error("kapot");
    });
    expect(herstelDocument(document, migreerFn)).toBeNull();
  });

  test("zonder migreerFn gebruikt het migreer van het model: een geldig document blijft gelijk, onzin geeft null", () => {
    const geldig = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
    expect(herstelDocument(geldig)).toEqual(geldig);
    expect(herstelDocument("geen document")).toBeNull();
    expect(herstelDocument({ schemaVersion: 9999 })).toBeNull();
  });
});
