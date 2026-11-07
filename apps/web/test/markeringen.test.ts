import type { Bevinding, Ernst } from "@elentrik/arei";
import { describe, expect, test } from "vitest";
import { markeringen, markeringVorm, MARKERING_SOORTEN } from "../app/editor/markeringen";

function bevinding(ernst: Ernst, nodeIds: string[], afgeweken = false): Bevinding {
  return { regelId: "r", ernst, nodeIds, berichtSleutel: "k", parameters: {}, afgeweken };
}

describe("markeringen", () => {
  test("geen bevindingen geven geen markeringen", () => {
    expect(markeringen([]).size).toBe(0);
  });

  test("de ergste actieve ernst wint, onafhankelijk van de volgorde", () => {
    const a = [bevinding("info", ["n"]), bevinding("fout", ["n"]), bevinding("waarschuwing", ["n"])];
    expect(markeringen(a).get("n")).toBe("fout");
    expect(markeringen(a.toReversed()).get("n")).toBe("fout");
    expect(markeringen([bevinding("info", ["n"]), bevinding("waarschuwing", ["n"])]).get("n")).toBe("waarschuwing");
    expect(markeringen([bevinding("info", ["n"])]).get("n")).toBe("info");
  });

  test("grijs enkel als alle bevindingen van de node afgeweken zijn", () => {
    expect(markeringen([bevinding("fout", ["n"], true)]).get("n")).toBe("afgeweken");
    expect(markeringen([bevinding("fout", ["n"], true), bevinding("fout", ["n"], true)]).get("n")).toBe("afgeweken");
  });

  test("een actieve bevinding wint van afgeweken, ook als die eerder of later komt", () => {
    const afgeweken = bevinding("fout", ["n"], true);
    const info = bevinding("info", ["n"]);
    expect(markeringen([afgeweken, info]).get("n")).toBe("info");
    expect(markeringen([info, afgeweken]).get("n")).toBe("info");
  });

  test("elke node in nodeIds krijgt een markering, en per node maar één", () => {
    const m = markeringen([bevinding("waarschuwing", ["a", "b"]), bevinding("fout", ["b", "c"])]);
    expect([...m.keys()].toSorted()).toEqual(["a", "b", "c"]);
    expect(m.get("a")).toBe("waarschuwing");
    expect(m.get("b")).toBe("fout");
    expect(m.get("c")).toBe("fout");
  });
});

describe("markeringVorm", () => {
  test("elke ernst heeft een eigen vorm en een eigen teken, niet alleen een kleur", () => {
    const vormen = MARKERING_SOORTEN.map((soort) => markeringVorm(soort, 0, 0, 1));
    expect(new Set(vormen.map((v) => v.vorm)).size).toBe(MARKERING_SOORTEN.length);
    expect(new Set(vormen.map((v) => v.teken)).size).toBe(MARKERING_SOORTEN.length);
    expect(MARKERING_SOORTEN).toEqual(["fout", "waarschuwing", "info", "afgeweken"]);
  });

  test("de vorm schaalt mee en ligt rond het middelpunt", () => {
    const klein = markeringVorm("waarschuwing", 10, 20, 1).vorm;
    const groot = markeringVorm("waarschuwing", 10, 20, 2).vorm;
    expect(klein).not.toBe(groot);
    expect(markeringVorm("waarschuwing", 11, 20, 1).vorm).not.toBe(klein);
  });
});
