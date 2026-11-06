import { describe, expect, test } from "vitest";
import type { MateriaalRij } from "@elentrik/model";
import { bestandsnaamMateriaalCsv, materiaalCsv } from "../app/editor/materiaalcsv";

function rij(deel: Partial<MateriaalRij>): MateriaalRij {
  return { sleutel: "s", type: "contactdoos", eigenschappen: {}, hoeveelheid: 1, eenheid: "stuks", nodeIds: ["a"], ontbrekendeLengtes: 0, ...deel };
}

describe("materiaalCsv", () => {
  test("begint met een UTF-8 BOM, gebruikt ; en CRLF", () => {
    const csv = materiaalCsv([rij({})], "nl", { materiaal: () => "Contactdoos" });
    expect(csv.startsWith("﻿")).toBe(true);
    const regels = csv.slice(1).split("\r\n");
    expect(regels[0]).toBe("Materiaal;Uitvoering;Hoeveelheid;Eenheid");
    expect(regels[1]).toBe("Contactdoos;;1;stuk");
  });

  test("zet velden met ; \" of een regeleinde tussen aanhalingstekens en verdubbelt \"", () => {
    const csv = materiaalCsv([rij({})], "nl", { uitvoering: () => 'Kabel "XVB"; 3G2,5\nrest' });
    expect(csv).toContain('"Kabel ""XVB""; 3G2,5\nrest"');
  });

  test("behoudt accenten en gebruikt een decimale komma in nl en fr, een punt in en", () => {
    const m = rij({ type: "leiding", hoeveelheid: 12.5, eenheid: "m" });
    const opties = { uitvoering: () => "Ø 2,5 mm² — café" };
    expect(materiaalCsv([m], "nl", opties)).toContain("Ø 2,5 mm² — café");
    expect(materiaalCsv([m], "nl")).toContain(";12,5;m");
    expect(materiaalCsv([m], "fr")).toContain(";12,5;m");
    expect(materiaalCsv([m], "en")).toContain(";12.5;m");
  });

  test("vertaalt de kolomkoppen", () => {
    expect(materiaalCsv([], "fr").slice(1)).toBe("Matériel;Exécution;Quantité;Unité\r\n");
    expect(materiaalCsv([], "en").slice(1)).toBe("Material;Specification;Quantity;Unit\r\n");
  });

  test("laat de hoeveelheid leeg als alle lengtes ontbreken", () => {
    const m = rij({ type: "leiding", hoeveelheid: 0, eenheid: "m", ontbrekendeLengtes: 2, nodeIds: ["a", "b"] });
    expect(materiaalCsv([m], "nl")).toContain(";;m");
  });
});

describe("bestandsnaamMateriaalCsv", () => {
  test("maakt de projectnaam veilig", () => {
    expect(bestandsnaamMateriaalCsv('Woning: "De Lage" / fase 2?')).toBe("Woning De Lage fase 2-materiaallijst.csv");
    expect(bestandsnaamMateriaalCsv("  ")).toBe("project-materiaallijst.csv");
  });
});
