import { describe, expect, test } from "vitest";
import {
  BEVEILIGING_TYPES,
  PUNT_TYPES,
  TOEGELATEN_KINDEREN,
  nieuwDocument,
  valideerStructuur,
  type InstallatieDocument,
  type Node,
} from "../src/index";
import { kloon } from "./hulp";

function leiding(id: string, parentId: string | null, kinderen: string[] = []): Node {
  return {
    id,
    parentId,
    kinderen,
    type: "leiding",
    kabeltype: "",
    doorsnede_mm2: 0,
    aantalGeleiders: 2,
  };
}

function contactdoos(id: string, parentId: string | null, kinderen: string[] = []): Node {
  return {
    id,
    parentId,
    kinderen,
    type: "contactdoos",
    aantal: 1,
    randaarde: true,
    kinderbeveiliging: false,
    waterdicht: false,
  };
}

/** Geldig document: aansluiting > teller > leiding "l" > contactdoos "c". */
function basis(): { doc: InstallatieDocument; root: string; teller: string } {
  const doc = kloon(nieuwDocument());
  const root = doc.rootId;
  const teller = doc.nodes[root]!.kinderen[0]!;
  doc.nodes[teller]!.kinderen = ["l"];
  doc.nodes["l"] = leiding("l", teller, ["c"]);
  doc.nodes["c"] = contactdoos("c", "l");
  return { doc, root, teller };
}

describe("constanten", () => {
  test("punt- en beveiligingstypes", () => {
    expect(PUNT_TYPES).toEqual(["contactdoos", "lichtpunt", "schakelaar", "toestel"]);
    expect(BEVEILIGING_TYPES).toEqual(["automaat", "zekering"]);
  });

  test("toegelaten kinderen", () => {
    expect(TOEGELATEN_KINDEREN.aansluiting).toEqual(["teller"]);
    expect(TOEGELATEN_KINDEREN.teller).toEqual([
      "differentieel",
      "automaat",
      "zekering",
      "verdeelbord",
      "leiding",
    ]);
    expect(TOEGELATEN_KINDEREN.differentieel).toEqual(TOEGELATEN_KINDEREN.teller);
    expect(TOEGELATEN_KINDEREN.verdeelbord).toEqual([
      "differentieel",
      "automaat",
      "zekering",
      "leiding",
    ]);
    expect(TOEGELATEN_KINDEREN.automaat).toEqual(["leiding", "verdeelbord", "differentieel"]);
    expect(TOEGELATEN_KINDEREN.zekering).toEqual(["leiding", "verdeelbord", "differentieel"]);
    expect(TOEGELATEN_KINDEREN.leiding).toEqual([
      "contactdoos",
      "lichtpunt",
      "schakelaar",
      "toestel",
      "leiding",
      "verdeelbord",
      "differentieel",
    ]);
    for (const punt of PUNT_TYPES) {
      expect(TOEGELATEN_KINDEREN[punt]).toEqual([...PUNT_TYPES, "leiding"]);
    }
  });
});

describe("valideerStructuur", () => {
  test("nieuw document is geldig", () => {
    expect(valideerStructuur(nieuwDocument())).toEqual([]);
  });

  test("geldig document met leiding en contactdoos", () => {
    expect(valideerStructuur(basis().doc)).toEqual([]);
  });

  test("ROOT_ONGELDIG: root ontbreekt", () => {
    const { doc, root } = basis();
    delete doc.nodes[root];
    expect(valideerStructuur(doc)).toContainEqual({ code: "ROOT_ONGELDIG", nodeId: root });
  });

  test("ROOT_ONGELDIG: root heeft een ouder", () => {
    const { doc, root } = basis();
    doc.nodes[root]!.parentId = "l";
    expect(valideerStructuur(doc)).toContainEqual({ code: "ROOT_ONGELDIG", nodeId: root });
  });

  test("ROOT_ONGELDIG: root is geen aansluiting", () => {
    const { doc, root } = basis();
    doc.nodes[root] = leiding(root, null, doc.nodes[root]!.kinderen);
    expect(valideerStructuur(doc)).toContainEqual({ code: "ROOT_ONGELDIG", nodeId: root });
  });

  test("ONBEREIKBAAR: node die niemand als kind heeft", () => {
    const { doc } = basis();
    doc.nodes["los"] = leiding("los", null);
    const problemen = valideerStructuur(doc);
    expect(problemen).toContainEqual({ code: "ONBEREIKBAAR", nodeId: "los" });
    expect(problemen.filter((p) => p.code === "ONBEREIKBAAR")).toHaveLength(1);
  });

  test("CYCLUS: onbereikbare lus meldt elke node van de lus", () => {
    const { doc } = basis();
    doc.nodes["a"] = leiding("a", "b", ["b"]);
    doc.nodes["b"] = leiding("b", "a", ["a"]);
    const problemen = valideerStructuur(doc);
    expect(problemen).toContainEqual({ code: "CYCLUS", nodeId: "a" });
    expect(problemen).toContainEqual({ code: "CYCLUS", nodeId: "b" });
    // Lusnodes zijn ook onbereikbaar; beide codes worden gemeld.
    expect(problemen).toContainEqual({ code: "ONBEREIKBAAR", nodeId: "a" });
  });

  test("CYCLUS: lus bereikbaar vanaf de root", () => {
    const { doc } = basis();
    // contactdoos "c" verwijst terug naar leiding "l"
    doc.nodes["c"]!.kinderen = ["l"];
    const problemen = valideerStructuur(doc);
    expect(problemen).toContainEqual({ code: "CYCLUS", nodeId: "l" });
    expect(problemen).toContainEqual({ code: "CYCLUS", nodeId: "c" });
    expect(problemen.filter((p) => p.code === "ONBEREIKBAAR")).toEqual([]);
  });

  test("CYCLUS: node die zichzelf als kind heeft", () => {
    const { doc } = basis();
    doc.nodes["l"]!.kinderen = ["l", "c"];
    expect(valideerStructuur(doc)).toContainEqual({ code: "CYCLUS", nodeId: "l" });
  });

  test("OUDER_INCONSISTENT: kind wijst naar een andere ouder", () => {
    const { doc, root } = basis();
    doc.nodes["c"]!.parentId = root;
    expect(valideerStructuur(doc)).toContainEqual({ code: "OUDER_INCONSISTENT", nodeId: "c" });
  });

  test("DUBBEL_KIND: id staat in twee kinderlijsten", () => {
    const { doc, teller } = basis();
    doc.nodes["l2"] = leiding("l2", teller, ["c"]);
    doc.nodes[teller]!.kinderen = ["l", "l2"];
    const problemen = valideerStructuur(doc);
    expect(problemen).toContainEqual({ code: "DUBBEL_KIND", nodeId: "c" });
    expect(problemen.filter((p) => p.code === "DUBBEL_KIND")).toHaveLength(1);
  });

  test("DUBBEL_KIND: id staat twee keer in dezelfde lijst", () => {
    const { doc } = basis();
    doc.nodes["l"]!.kinderen = ["c", "c"];
    const problemen = valideerStructuur(doc);
    expect(problemen).toContainEqual({ code: "DUBBEL_KIND", nodeId: "c" });
    expect(problemen.filter((p) => p.code === "DUBBEL_KIND")).toHaveLength(1);
  });

  test("NIET_TOEGELATEN_KIND: contactdoos onder teller", () => {
    const { doc, teller } = basis();
    doc.nodes["l"]!.parentId = null;
    doc.nodes["l"]!.kinderen = [];
    doc.nodes[teller]!.kinderen = ["c"];
    doc.nodes["c"]!.parentId = teller;
    expect(valideerStructuur(doc)).toContainEqual({
      code: "NIET_TOEGELATEN_KIND",
      nodeId: "c",
    });
  });

  test("ONBEKENDE_VERWIJZING: kinderen-id bestaat niet", () => {
    const { doc } = basis();
    doc.nodes["l"]!.kinderen = ["c", "spook"];
    expect(valideerStructuur(doc)).toContainEqual({
      code: "ONBEKENDE_VERWIJZING",
      nodeId: "spook",
    });
  });

  test("ONBEKENDE_VERWIJZING: plaatsing wijst naar onbestaande node", () => {
    const { doc } = basis();
    doc.situatie.paginas.push({
      id: "p1",
      titel: "Gelijkvloers",
      plaatsingen: [
        { nodeId: "c", x: 0, y: 0, rotatie: 0 },
        { nodeId: "weg", x: 1, y: 1, rotatie: 0 },
      ],
    });
    const problemen = valideerStructuur(doc);
    expect(problemen).toContainEqual({ code: "ONBEKENDE_VERWIJZING", nodeId: "weg" });
    expect(problemen.filter((p) => p.code === "ONBEKENDE_VERWIJZING")).toHaveLength(1);
  });

  test("ONBEKENDE_VERWIJZING: afwijking wijst naar onbestaande node", () => {
    const { doc } = basis();
    doc.afwijkingen.push({
      regelId: "r",
      nodeId: "weg",
      motivatie: "m",
      door: "d",
      datum: "2026-10-17",
    });
    expect(valideerStructuur(doc)).toContainEqual({
      code: "ONBEKENDE_VERWIJZING",
      nodeId: "weg",
    });
  });

  test("ids als 'constructor' worden niet als bestaande node gezien", () => {
    const { doc } = basis();
    doc.afwijkingen.push({
      regelId: "r",
      nodeId: "constructor",
      motivatie: "m",
      door: "d",
      datum: "2026-10-17",
    });
    expect(valideerStructuur(doc)).toContainEqual({
      code: "ONBEKENDE_VERWIJZING",
      nodeId: "constructor",
    });
  });

  test("meldt elk probleem hooguit één keer per code en node", () => {
    const { doc } = basis();
    doc.nodes["l"]!.kinderen = ["spook", "spook", "c"];
    const problemen = valideerStructuur(doc);
    const sleutels = problemen.map((p) => `${p.code}:${p.nodeId}`);
    expect(new Set(sleutels).size).toBe(sleutels.length);
  });

  test("keten van 20.000 contactdozen is geldig (geen recursie)", () => {
    const { doc } = basis();
    const aantal = 20_000;
    doc.nodes["l"]!.kinderen = ["k0"];
    for (let i = 0; i < aantal; i++) {
      const ouder = i === 0 ? "l" : `k${i - 1}`;
      const kinderen = i === aantal - 1 ? [] : [`k${i + 1}`];
      doc.nodes[`k${i}`] = contactdoos(`k${i}`, ouder, kinderen);
    }
    delete doc.nodes["c"];
    expect(valideerStructuur(doc)).toEqual([]);
  });
});
