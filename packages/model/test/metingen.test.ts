import { describe, expect, test } from "vitest";
import {
  InstallatieDocumentSchema,
  MetingenSchema,
  migreer,
  nieuwDocument,
  parseDocument,
  pasPatchesToe,
  voegOnderdeelToe,
  nieuwProjectDocument,
  wijzigEigenschappen,
  wijzigProject,
  type DifferentieelTest,
  type Metingen,
} from "../src/index";
import { kloon, vangFout } from "./hulp";

const METINGEN: Metingen = {
  datum: "2026-11-05",
  aardingsweerstand_ohm: 28.5,
  isolatieweerstand_MOhm: 250,
  meettoestel: "Fluke 1664 FC",
  opmerking: "Gemeten met open hoofdschakelaar",
};

function metDifferentieel() {
  const doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const differentieel = Object.values(doc.nodes).find(n => n.type === "differentieel")!;
  return { doc, differentieelId: differentieel.id };
}

describe("metingen in het schema", () => {
  test("geldige metingen worden aanvaard, ook gedeeltelijk of leeg", () => {
    expect(MetingenSchema.parse(METINGEN)).toEqual(METINGEN);
    expect(MetingenSchema.parse({ aardingsweerstand_ohm: 0 })).toEqual({ aardingsweerstand_ohm: 0 });
    expect(MetingenSchema.parse({})).toEqual({});
    const doc = { ...nieuwDocument(), meta: { ...nieuwDocument().meta, metingen: METINGEN } };
    expect(parseDocument(kloon(doc)).meta.metingen).toEqual(METINGEN);
  });

  test.each([
    { aardingsweerstand_ohm: -1 },
    { isolatieweerstand_MOhm: -0.5 },
    { aardingsweerstand_ohm: Number.POSITIVE_INFINITY },
    { datum: "5/11/2026" },
    { onbekend: "x" },
  ])("ongeldige metingen worden geweigerd: %j", (metingen) => {
    expect(MetingenSchema.safeParse(metingen).success).toBe(false);
    const doc = nieuwDocument();
    expect(InstallatieDocumentSchema.safeParse({ ...doc, meta: { ...doc.meta, metingen } }).success).toBe(false);
  });

  test("een differentieel kan een testresultaat en uitschakeltijd hebben; negatief wordt geweigerd", () => {
    const { doc, differentieelId } = metDifferentieel();
    const test: DifferentieelTest = { testResultaat: "ok", uitschakeltijd_ms: 18 };
    const r = wijzigEigenschappen(doc, differentieelId, test);
    expect(r.doc.nodes[differentieelId]).toMatchObject(test);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
    expect(vangFout(() => wijzigEigenschappen(doc, differentieelId, { uitschakeltijd_ms: -1 })).code).toBe("ONGELDIG_SCHEMA");
    expect(vangFout(() => wijzigEigenschappen(doc, differentieelId, { testResultaat: "goed" })).code).toBe("ONGELDIG_SCHEMA");
    for (const resultaat of ["ok", "niet_ok", "niet_getest"] as const) {
      expect(wijzigEigenschappen(doc, differentieelId, { testResultaat: resultaat }).doc.nodes[differentieelId]).toMatchObject({ testResultaat: resultaat });
    }
    // Een ander onderdeel kent die velden niet.
    const teller = Object.values(doc.nodes).find(n => n.type === "teller")!;
    expect(vangFout(() => wijzigEigenschappen(doc, teller.id, { testResultaat: "ok" })).code).toBe("ONGELDIG_SCHEMA");
    // Wissen haalt het veld weg.
    expect(wijzigEigenschappen(r.doc, differentieelId, { uitschakeltijd_ms: undefined }).doc.nodes[differentieelId]).not.toHaveProperty("uitschakeltijd_ms");
  });
});

describe("compatibiliteit", () => {
  test("een bestaand schema-2-document zonder metingen blijft leesbaar en ongewijzigd", () => {
    const { doc } = metDifferentieel();
    expect("metingen" in doc.meta).toBe(false);
    expect(migreer(kloon(doc))).toEqual(doc);
  });

  test("een document met metingen en differentieeltests overleeft migreer en parse ongeschonden", () => {
    const { doc, differentieelId } = metDifferentieel();
    const met = wijzigEigenschappen(wijzigProject(doc, { metingen: METINGEN }).doc, differentieelId, { testResultaat: "niet_ok", uitschakeltijd_ms: 0 }).doc;
    expect(migreer(kloon(met))).toEqual(met);
  });
});

describe("wijzigProject met metingen", () => {
  test("zet de metingen als één omkeerbare stap", () => {
    const doc = nieuwDocument();
    const r = wijzigProject(doc, { metingen: METINGEN });
    expect(r.doc.meta.metingen).toEqual(METINGEN);
    expect(r.doc).toEqual({ ...doc, meta: { ...doc.meta, metingen: METINGEN } });
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
  });

  test("vervangt het hele object: een weggelaten veld verdwijnt", () => {
    const doc = wijzigProject(nieuwDocument(), { metingen: METINGEN }).doc;
    const r = wijzigProject(doc, { metingen: { aardingsweerstand_ohm: 30 } });
    expect(r.doc.meta.metingen).toEqual({ aardingsweerstand_ohm: 30 });
  });

  test("leeg of null wist de metingen", () => {
    const doc = wijzigProject(nieuwDocument(), { metingen: METINGEN }).doc;
    expect("metingen" in wijzigProject(doc, { metingen: null }).doc.meta).toBe(false);
    expect("metingen" in wijzigProject(doc, { metingen: {} }).doc.meta).toBe(false);
  });

  test("dezelfde metingen of leeg op een document zonder metingen is een no-op", () => {
    const doc = wijzigProject(nieuwDocument(), { metingen: METINGEN }).doc;
    expect(wijzigProject(doc, { metingen: { ...METINGEN } }).patches).toEqual([]);
    const zonder = nieuwDocument();
    expect(wijzigProject(zonder, { metingen: {} }).doc).toBe(zonder);
    expect(wijzigProject(zonder, { metingen: null }).doc).toBe(zonder);
  });

  test("een negatieve waarde geeft ONGELDIG_SCHEMA", () => {
    const doc = nieuwDocument();
    expect(vangFout(() => wijzigProject(doc, { metingen: { isolatieweerstand_MOhm: -1 } })).code).toBe("ONGELDIG_SCHEMA");
  });

  test("voegOnderdeelToe laat de metingen staan", () => {
    const { doc } = metDifferentieel();
    const met = wijzigProject(doc, { metingen: METINGEN }).doc;
    const bord = Object.values(met.nodes).find(n => n.type === "verdeelbord")!;
    expect(voegOnderdeelToe(met, { soort: "rail-einde", nodeId: bord.id }, "lichtpunt").doc.meta.metingen).toEqual(METINGEN);
  });
});
