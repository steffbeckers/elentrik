import { describe, expect, test } from "vitest";
import type { MateriaalRij } from "@elentrik/model";
import { bestandsnaamMateriaalCsv, materiaalCsv, type MateriaalCsvTeksten } from "../app/editor/materiaalcsv";

const TEKSTEN: MateriaalCsvTeksten = {
  kop: { materiaal: "Matériel", uitvoering: "Exécution", hoeveelheid: "Quantité", eenheid: "Unité" },
  stuk: "pièce", stuks: "pièces", meter: "m", lengteOntbreekt: "Longueur manquante",
};
const opties = { teksten: TEKSTEN, materiaal: () => "Contactdoos" };

function rij(deel: Partial<MateriaalRij>): MateriaalRij {
  return { sleutel: "s", type: "contactdoos", eigenschappen: {}, hoeveelheid: 1, eenheid: "stuks", nodeIds: ["a"], ontbrekendeLengtes: 0, ...deel };
}

describe("materiaalCsv", () => {
  test("begint met een UTF-8 BOM, gebruikt ; en CRLF, met de aangereikte koppen en eenheden", () => {
    const csv = materiaalCsv([rij({}), rij({ hoeveelheid: 3 })], "nl", opties);
    expect(csv.startsWith("﻿")).toBe(true);
    const regels = csv.slice(1).split("\r\n");
    expect(regels[0]).toBe("Matériel;Exécution;Quantité;Unité");
    expect(regels[1]).toBe("Contactdoos;;1;pièce");
    expect(regels[2]).toBe("Contactdoos;;3;pièces");
  });

  test("zet velden met ; \" of een regeleinde tussen aanhalingstekens en verdubbelt \"", () => {
    const csv = materiaalCsv([rij({})], "nl", { ...opties, uitvoering: () => 'Kabel "XVB"; 3G2,5\nrest' });
    expect(csv).toContain('"Kabel ""XVB""; 3G2,5\nrest"');
  });

  test("behoudt accenten en gebruikt in elke taal de decimale komma", () => {
    const m = rij({ type: "leiding", hoeveelheid: 12.5, eenheid: "m" });
    const met = { ...opties, uitvoering: () => "Ø 2,5 mm² — café" };
    expect(materiaalCsv([m], "nl", met)).toContain("Ø 2,5 mm² — café");
    for (const taal of ["nl", "fr", "en"]) expect(materiaalCsv([m], taal, opties)).toContain(";12,5;m");
  });

  test("laat de hoeveelheid leeg als alle lengtes ontbreken", () => {
    const m = rij({ type: "leiding", hoeveelheid: 0, eenheid: "m", ontbrekendeLengtes: 2, nodeIds: ["a", "b"] });
    expect(materiaalCsv([m], "nl", opties)).toContain(";;m");
  });

  test("markeert een rij waarvan slechts een deel van de lengtes ontbreekt", () => {
    const m = rij({ type: "leiding", hoeveelheid: 4, eenheid: "m", ontbrekendeLengtes: 1, nodeIds: ["a", "b"] });
    expect(materiaalCsv([m], "nl", { ...opties, uitvoering: () => "XVB" })).toContain("XVB · Longueur manquante;4;m");
  });

  test("voorkomt formule-injectie: cellen die met = + - @ beginnen krijgen een '", () => {
    for (const gevaar of ["=1+1", "+1", "-1", "@SOM(A1)", "\tx"]) {
      const csv = materiaalCsv([rij({})], "nl", { ...opties, uitvoering: () => gevaar });
      expect(csv.slice(1).split("\r\n")[1]).toBe(`Contactdoos;'${gevaar};1;pièce`);
    }
    expect(materiaalCsv([rij({})], "nl", { ...opties, uitvoering: () => "B16 = ok" })).toContain(";B16 = ok;");
  });
});

describe("bestandsnaamMateriaalCsv", () => {
  test("maakt de projectnaam veilig", () => {
    expect(bestandsnaamMateriaalCsv('Woning: "De Lage" / fase 2?')).toBe("Woning De Lage fase 2-materiaallijst.csv");
    expect(bestandsnaamMateriaalCsv("  ")).toBe("project-materiaallijst.csv");
  });
});
