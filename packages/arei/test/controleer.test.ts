import { beforeEach, describe, expect, test, vi } from "vitest";
import { nieuwDocument, type Afwijking, type InstallatieDocument, type NodeId } from "@elentrik/model";
import { analyseer } from "../src/analyse/index";
import { controleer, formatteerBericht, type Bevinding, type Regel, type Regelset } from "../src/index";
import { kloon } from "./hulp";

vi.mock("../src/analyse/index", async (origineel) => {
  const echt = await origineel<typeof import("../src/analyse/index")>();
  return { ...echt, analyseer: vi.fn(echt.analyseer) };
});

beforeEach(() => {
  vi.mocked(analyseer).mockClear();
});

function regelMet(id: string, bevindingen: Omit<Bevinding, "afgeweken">[]): Regel {
  return {
    id,
    artikel: "",
    ernst: "fout",
    nagekeken: false,
    berichtSleutels: [],
    check: () => bevindingen,
  };
}

function regelsetVan(...regels: Regel[]): Regelset {
  return { id: "test", versie: 1, gepubliceerd: false, regels };
}

function bevinding(
  regelId: string,
  ernst: Bevinding["ernst"],
  nodeIds: NodeId[] = [],
): Omit<Bevinding, "afgeweken"> {
  return { regelId, ernst, nodeIds, berichtSleutel: "test", parameters: {} };
}

function afwijking(regelId: string, nodeId: NodeId): Afwijking {
  return { regelId, nodeId, motivatie: "reden", door: "Jan", datum: "2026-10-17" };
}

describe("controleer", () => {
  test("sorteert fout voor waarschuwing voor info", () => {
    const regel = regelMet("R1", [
      bevinding("R1", "info"),
      bevinding("R1", "waarschuwing"),
      bevinding("R1", "fout"),
    ]);
    const resultaat = controleer(nieuwDocument(), regelsetVan(regel));
    expect(resultaat.map((b) => b.ernst)).toEqual(["fout", "waarschuwing", "info"]);
  });

  test("sorteert bij gelijke ernst op regelId en dan op eerste nodeId", () => {
    const regelB = regelMet("B", [
      bevinding("B", "fout", ["n2" as NodeId]),
      bevinding("B", "fout", ["n1" as NodeId]),
    ]);
    const regelA = regelMet("A", [bevinding("A", "fout", ["n9" as NodeId]), bevinding("A", "fout")]);
    const resultaat = controleer(nieuwDocument(), regelsetVan(regelB, regelA));
    expect(resultaat.map((b) => [b.regelId, b.nodeIds[0] ?? ""])).toEqual([
      ["A", ""],
      ["A", "n9"],
      ["B", "n1"],
      ["B", "n2"],
    ]);
  });

  test("afgeweken is true bij zelfde regelId en nodeId, anders false", () => {
    const doc = nieuwDocument();
    const a = "00000000-0000-7000-8000-00000000000a" as NodeId;
    const b = "00000000-0000-7000-8000-00000000000b" as NodeId;
    doc.afwijkingen.push(afwijking("R1", a));
    const regel = regelMet("R1", [bevinding("R1", "fout", [a]), bevinding("R1", "fout", [b])]);
    const resultaat = controleer(doc, regelsetVan(regel));
    expect(resultaat.map((x) => [x.nodeIds[0], x.afgeweken])).toEqual([
      [a, true],
      [b, false],
    ]);
  });

  test("een afwijking voor een andere regel telt niet", () => {
    const doc = nieuwDocument();
    const a = "00000000-0000-7000-8000-00000000000a" as NodeId;
    doc.afwijkingen.push(afwijking("ANDERE", a));
    const resultaat = controleer(doc, regelsetVan(regelMet("R1", [bevinding("R1", "fout", [a])])));
    expect(resultaat[0]?.afgeweken).toBe(false);
  });

  test("een lege regelset geeft geen bevindingen", () => {
    expect(controleer(nieuwDocument(), regelsetVan())).toEqual([]);
  });

  test("roept analyseer één keer aan en geeft analyse en document aan elke regel", () => {
    const doc = nieuwDocument();
    const check = vi.fn<Regel["check"]>(() => []);
    const regel = (id: string): Regel => ({ ...regelMet(id, []), check });
    controleer(doc, regelsetVan(regel("R1"), regel("R2")));
    expect(analyseer).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(2);
    expect(check.mock.calls[0]?.[1]).toBe(doc);
  });

  test("muteert het document niet", () => {
    const doc: InstallatieDocument = nieuwDocument();
    doc.afwijkingen.push(afwijking("R1", doc.rootId));
    const voor = kloon(doc);
    controleer(doc, regelsetVan(regelMet("R1", [bevinding("R1", "fout", [doc.rootId])])));
    expect(doc).toEqual(voor);
  });
});

describe("formatteerBericht", () => {
  const catalogus = {
    nl: { test: "Kring {kring}: {aantal}", getal: "Waarde {x}", los: "Hallo {onbekend}" },
    fr: { test: "Circuit {kring}: {aantal}", getal: "Valeur {x}" },
  };
  const maak = (berichtSleutel: string, parameters: Bevinding["parameters"]): Bevinding => ({
    regelId: "R1",
    ernst: "fout",
    nodeIds: [],
    berichtSleutel,
    parameters,
    afgeweken: false,
  });

  test("vervangt placeholders door parameters", () => {
    expect(formatteerBericht(maak("test", { kring: "A", aantal: 9 }), "nl", catalogus)).toBe("Kring A: 9");
    expect(formatteerBericht(maak("test", { kring: "A", aantal: 9 }), "fr", catalogus)).toBe("Circuit A: 9");
  });

  test("formatteert getallen per taal: 1.5 wordt 1,5", () => {
    expect(formatteerBericht(maak("getal", { x: 1.5 }), "nl", catalogus)).toBe("Waarde 1,5");
    expect(formatteerBericht(maak("getal", { x: 1.5 }), "fr", catalogus)).toBe("Valeur 1,5");
  });

  test("een placeholder zonder parameter blijft letterlijk staan", () => {
    expect(formatteerBericht(maak("los", {}), "nl", catalogus)).toBe("Hallo {onbekend}");
  });

  test("een ontbrekende sleutel geeft de sleutel zelf terug", () => {
    expect(formatteerBericht(maak("niet.bestaand", {}), "nl", catalogus)).toBe("niet.bestaand");
    expect(formatteerBericht(maak("los", {}), "fr", catalogus)).toBe("los");
  });

  test("gebruikt standaard de BERICHTEN-catalogus", () => {
    expect(formatteerBericht(maak("onbekend.default", {}), "nl")).toBe("onbekend.default");
  });
});
