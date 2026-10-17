import { describe, expect, test } from "vitest";
import {
  DocumentFout,
  SCHEMA_VERSIE,
  nieuwDocument,
  nieuwId,
  parseDocument,
  type InstallatieDocument,
  type Node,
  type NodeVan,
} from "../src/index";
import { kloon, vangFout } from "./hulp";

function metNode(doc: InstallatieDocument, node: { id: string }): unknown {
  const kopie: any = kloon(doc);
  kopie.nodes[node.id] = node;
  return kopie;
}

describe("nieuwDocument", () => {
  test("is geldig en heeft aansluiting → teller", () => {
    const doc = nieuwDocument({ klantNaam: "Janssens", datum: "2026-10-17" });
    expect(parseDocument(kloon(doc))).toEqual(doc);
    const root = doc.nodes[doc.rootId]!;
    expect(root.type).toBe("aansluiting");
    expect(doc.nodes[root.kinderen[0]!]!.type).toBe("teller");
    expect(doc.meta.klant.naam).toBe("Janssens");
    expect(doc.voeding.stroomtype).toBe("2x230V");
  });

  test("standaardwaarden", () => {
    const doc = nieuwDocument();
    expect(doc.schemaVersion).toBe(SCHEMA_VERSIE);
    expect(doc.regelset).toBe("arei-2020@1");
    expect(doc.meta.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc.meta.klant.naam).toBe("");
    expect(doc.meta.installateur.naam).toBe("");
    expect(doc.meta.werfadres).toEqual({
      straat: "",
      nummer: "",
      postcode: "",
      gemeente: "",
      land: "BE",
    });
    expect(doc.situatie).toEqual({ paginas: [] });
    expect(doc.afwijkingen).toEqual([]);
  });

  test("opties worden overgenomen", () => {
    const doc = nieuwDocument({ stroomtype: "3N400V", regelset: "arei-2020@2" });
    expect(doc.voeding.stroomtype).toBe("3N400V");
    expect(doc.regelset).toBe("arei-2020@2");
  });

  test("datum standaard is de lokale datum van vandaag", () => {
    const nu = new Date();
    const verwacht = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`;
    expect(nieuwDocument().meta.datum).toBe(verwacht);
  });

  test("ids zijn uuid v7 en uniek", () => {
    const a = nieuwId();
    const b = nieuwId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe("parseDocument", () => {
  test("onbekend node-type → ONGELDIG_SCHEMA met pad in nodes", () => {
    const doc: any = nieuwDocument();
    doc.nodes[doc.rootId].type = "kernreactor";
    const fout = vangFout(() => parseDocument(doc));
    expect(fout).toBeInstanceOf(DocumentFout);
    expect(fout.code).toBe("ONGELDIG_SCHEMA");
    expect(JSON.stringify(fout.details)).toContain("nodes");
  });

  test("extra veld wordt geweigerd", () => {
    const doc: any = nieuwDocument();
    doc.extra = 1;
    expect(vangFout(() => parseDocument(doc)).code).toBe("ONGELDIG_SCHEMA");
  });

  test("extra veld op een node wordt geweigerd", () => {
    const doc: any = nieuwDocument();
    doc.nodes[doc.rootId].onzin = true;
    expect(vangFout(() => parseDocument(doc)).code).toBe("ONGELDIG_SCHEMA");
  });

  test("andere schemaVersion wordt geweigerd", () => {
    const doc: any = nieuwDocument();
    doc.schemaVersion = 2;
    expect(vangFout(() => parseDocument(doc)).code).toBe("ONGELDIG_SCHEMA");
  });

  test("geen object → ONGELDIG_SCHEMA", () => {
    expect(vangFout(() => parseDocument(null)).code).toBe("ONGELDIG_SCHEMA");
  });

  test("details bevatten issues", () => {
    const doc: any = nieuwDocument();
    doc.extra = 1;
    const fout = vangFout(() => parseDocument(doc));
    expect((fout.details as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
  });

  test("elk node-type uit de spec wordt aanvaard", () => {
    const doc = nieuwDocument();
    const basis = { parentId: null, kinderen: [] as string[] };
    const nodes: Node[] = [
      { ...basis, id: nieuwId(), type: "differentieel", gevoeligheid_mA: 30, nominaal_A: 40, polen: 2, klasse: "A" },
      { ...basis, id: nieuwId(), type: "automaat", nominaal_A: 16, polen: 1, curve: "B", kortsluitvermogen_kA: 6 },
      { ...basis, id: nieuwId(), type: "zekering", nominaal_A: 20 },
      { ...basis, id: nieuwId(), type: "verdeelbord", naam: "Hoofdbord" },
      { ...basis, id: nieuwId(), type: "leiding", kabeltype: "VOB", doorsnede_mm2: 2.5, aantalGeleiders: 3, plaatsing: "inbouw" },
      { ...basis, id: nieuwId(), type: "contactdoos", aantal: 2, randaarde: true, kinderbeveiliging: true, waterdicht: false },
      { ...basis, id: nieuwId(), type: "lichtpunt", aantal: 1, soort: "led", ruimte: "keuken", label: "Plafond" },
      { ...basis, id: nieuwId(), type: "schakelaar", soort: "wissel", waterdicht: false },
      { ...basis, id: nieuwId(), type: "toestel", soort: "laadpaal", vermogen_W: 7400 },
    ];
    for (const n of nodes) {
      expect(parseDocument(metNode(doc, n))).toBeDefined();
    }
  });

  test("doorsnede 0 en lege kabeltype betekenen 'niet ingevuld' en zijn geldig", () => {
    const doc = nieuwDocument();
    const leiding = {
      id: nieuwId(), parentId: null, kinderen: [], type: "leiding",
      kabeltype: "", doorsnede_mm2: 0, aantalGeleiders: 3,
    };
    expect(() => parseDocument(metNode(doc, leiding))).not.toThrow();
  });

  test("contactdoos met aantal 0 wordt geweigerd", () => {
    const doc = nieuwDocument();
    const contactdoos = {
      id: nieuwId(), parentId: null, kinderen: [], type: "contactdoos",
      aantal: 0, randaarde: true, kinderbeveiliging: true, waterdicht: false,
    };
    expect(vangFout(() => parseDocument(metNode(doc, contactdoos))).code).toBe("ONGELDIG_SCHEMA");
  });

  test.each([
    ["aantal niet geheel", { type: "lichtpunt", aantal: 1.5 }],
    ["aantalGeleiders 0", { type: "leiding", kabeltype: "", doorsnede_mm2: 0, aantalGeleiders: 0 }],
    ["negatieve doorsnede", { type: "leiding", kabeltype: "", doorsnede_mm2: -1, aantalGeleiders: 2 }],
    ["nominaal_A 0", { type: "zekering", nominaal_A: 0 }],
    ["gevoeligheid_mA 0", { type: "differentieel", gevoeligheid_mA: 0, nominaal_A: 40, polen: 2, klasse: "A" }],
    ["polen 5", { type: "automaat", nominaal_A: 16, polen: 5, curve: "B" }],
    ["polen 0", { type: "automaat", nominaal_A: 16, polen: 0, curve: "B" }],
    ["onbekende ruimte", { type: "teller", ruimte: "serre" }],
  ])("ongeldig: %s", (_naam, deel) => {
    const doc = nieuwDocument();
    const node = { id: nieuwId(), parentId: null, kinderen: [], ...deel };
    expect(vangFout(() => parseDocument(metNode(doc, node))).code).toBe("ONGELDIG_SCHEMA");
  });

  test("situatiepagina met achtergrond en plaatsingen", () => {
    const doc: any = nieuwDocument();
    doc.situatie.paginas.push({
      id: "p1", titel: "Gelijkvloers",
      achtergrond: { origineelBestandId: "a", rasterBestandId: "b", pdfPagina: 1, breedte_px: 100, hoogte_px: 200, schaal: { mmPerPx: 2 } },
      plaatsingen: [{ nodeId: doc.rootId, x: 1, y: 2, rotatie: 90 }],
    });
    expect(parseDocument(doc).situatie.paginas).toHaveLength(1);
  });

  test("afwijking en optionele partijvelden", () => {
    const doc: any = nieuwDocument();
    doc.afwijkingen.push({ regelId: "r", nodeId: doc.rootId, motivatie: "m", door: "d", datum: "2026-10-17" });
    doc.meta.keuringsorganisme = { naam: "Keuring", email: "a@b.be", adres: { straat: "s", nummer: "1", bus: "2", postcode: "9000", gemeente: "Gent", land: "BE" } };
    doc.meta.ean = "541234567890123456";
    expect(parseDocument(doc).afwijkingen).toHaveLength(1);
  });
});

describe("types", () => {
  test("NodeVan selecteert de juiste variant", () => {
    const n: NodeVan<"zekering"> = { id: "x", parentId: null, kinderen: [], type: "zekering", nominaal_A: 10 };
    expect(n.nominaal_A).toBe(10);
  });
});
