import { describe, expect, test } from "vitest";
import {
  NIEUWE_KRING_AUTOMAAT,
  SJABLONEN,
  STANDAARD,
  magToevoegen,
  nieuwProjectDocument,
  pasPatchesToe,
  sjabloonVoor,
  valideerStructuur,
  voegOnderdeelToe,
  voegSjabloonToe,
  voegToe,
  type InstallatieDocument,
  type Node,
  type NodeId,
  type NodeInvoer,
  type Onderdeel,
  type Sjabloon,
  type SjabloonNode,
} from "../src/index";
import { kloon, vangFout } from "./hulp";

const ONDERDELEN = Object.keys(STANDAARD) as Onderdeel[];

function start(stroomtype: "2x230V" | "3x230V" | "3N400V" = "2x230V"): {
  doc: InstallatieDocument;
  tellerId: NodeId;
  differentieelId: NodeId;
  bordId: NodeId;
} {
  const doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype, datum: "2026-10-18" });
  const tellerId = doc.nodes[doc.rootId]!.kinderen[0]!;
  const differentieelId = doc.nodes[tellerId]!.kinderen[0]!;
  const bordId = doc.nodes[differentieelId]!.kinderen[0]!;
  return { doc, tellerId, differentieelId, bordId };
}

function haal(doc: InstallatieDocument, id: NodeId): Node {
  const node = doc.nodes[id];
  if (!node) throw new Error(`node ${id} ontbreekt`);
  return node;
}

/** De types van een SjabloonNode-keten van boven naar onder (eerste kind telkens). */
function typesVan(boom: SjabloonNode): string[] {
  const types: string[] = [];
  let huidig: SjabloonNode | undefined = boom;
  while (huidig) {
    types.push(huidig.type);
    huidig = huidig.kinderen?.[0];
  }
  return types;
}

/** Een kring: bord > automaat > leiding > contactdoos. */
function kring(): {
  doc: InstallatieDocument;
  bordId: NodeId;
  automaatId: NodeId;
  leidingId: NodeId;
  puntId: NodeId;
} {
  const { doc, bordId } = start();
  const r = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bordId }, "contactdoos");
  const [automaatId, leidingId] = r.ids as [NodeId, NodeId];
  const p = voegOnderdeelToe(r.doc, { soort: "kring-einde", nodeId: leidingId }, "contactdoos");
  return { doc: p.doc, bordId, automaatId, leidingId, puntId: p.ids[0]! };
}

describe("standaarden", () => {
  test("waarden uit spec 4.3", () => {
    expect(STANDAARD.contactdoos).toEqual({
      type: "contactdoos",
      aantal: 1,
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
    });
    expect(STANDAARD.lichtpunt).toEqual({ type: "lichtpunt", aantal: 1 });
    expect(STANDAARD.schakelaar).toEqual({ type: "schakelaar", soort: "enkel", waterdicht: false });
    expect(STANDAARD.toestel).toEqual({ type: "toestel", soort: "andere" });
    expect(STANDAARD.leiding).toEqual({
      type: "leiding",
      kabeltype: "XVB",
      doorsnede_mm2: 2.5,
      aantalGeleiders: 3,
    });
    expect(STANDAARD.differentieel).toEqual({
      type: "differentieel",
      gevoeligheid_mA: 30,
      nominaal_A: 40,
      polen: 2,
      klasse: "A",
    });
    expect(STANDAARD.zekering).toEqual({ type: "zekering", nominaal_A: 16 });
    expect(STANDAARD.onderbord).toEqual({ type: "verdeelbord" });
    expect(NIEUWE_KRING_AUTOMAAT).toEqual({
      type: "automaat",
      nominaal_A: 16,
      curve: "B",
      polen: 2,
    });
  });
});

describe("nieuwProjectDocument", () => {
  test("2x230V: aansluiting > teller > differentieel 300 mA (2 polen) > verdeelbord", () => {
    const { doc } = start("2x230V");
    expect(valideerStructuur(doc)).toEqual([]);
    expect(doc.meta.klant.naam).toBe("Test");
    expect(doc.meta.datum).toBe("2026-10-18");
    const keten: Node[] = [];
    let id: NodeId | undefined = doc.rootId;
    while (id) {
      const node = haal(doc, id);
      keten.push(node);
      id = node.kinderen[0];
    }
    expect(keten.map((n) => n.type)).toEqual([
      "aansluiting",
      "teller",
      "differentieel",
      "verdeelbord",
    ]);
    expect(keten[2]).toMatchObject({ gevoeligheid_mA: 300, nominaal_A: 40, klasse: "A", polen: 2 });
    expect(Object.keys(doc.nodes)).toHaveLength(4);
  });

  test("3N400V: het differentieel heeft 4 polen", () => {
    const { doc, differentieelId } = start("3N400V");
    expect(valideerStructuur(doc)).toEqual([]);
    expect(haal(doc, differentieelId)).toMatchObject({ type: "differentieel", polen: 4 });
  });

  test("3x230V: het differentieel heeft 3 polen", () => {
    const { doc, differentieelId } = start("3x230V");
    expect(haal(doc, differentieelId)).toMatchObject({ polen: 3 });
  });
});

describe("voegOnderdeelToe op een rail-einde", () => {
  test("contactdoos: automaat 16 A B en leiding XVB 3G2,5, één undo-stap", () => {
    const { doc, bordId } = start();
    const r = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bordId }, "contactdoos");
    expect(r.ids).toHaveLength(2);
    const [automaatId, leidingId] = r.ids as [NodeId, NodeId];
    expect(haal(r.doc, automaatId)).toMatchObject({
      type: "automaat",
      nominaal_A: 16,
      curve: "B",
      polen: 2,
      parentId: bordId,
    });
    expect(haal(r.doc, leidingId)).toMatchObject({
      type: "leiding",
      kabeltype: "XVB",
      aantalGeleiders: 3,
      doorsnede_mm2: 2.5,
      parentId: automaatId,
    });
    expect(haal(r.doc, bordId).kinderen).toEqual([automaatId]);
    expect(valideerStructuur(r.doc)).toEqual([]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
  });

  test("differentieel: één differentieel van 30 mA", () => {
    const { doc, bordId } = start();
    const r = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bordId }, "differentieel");
    expect(r.ids).toHaveLength(1);
    expect(haal(r.doc, r.ids[0]!)).toMatchObject({
      type: "differentieel",
      gevoeligheid_mA: 30,
      nominaal_A: 40,
      polen: 2,
      klasse: "A",
    });
  });

  test("zekering: een zekering en een leiding", () => {
    const { doc, bordId } = start();
    const r = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bordId }, "zekering");
    expect(r.ids.map((id) => haal(r.doc, id).type)).toEqual(["zekering", "leiding"]);
    expect(haal(r.doc, r.ids[0]!)).toMatchObject({ nominaal_A: 16 });
    expect(haal(r.doc, r.ids[1]!).parentId).toBe(r.ids[0]);
  });

  test("onderbord op een rail werkt als een nieuwe kring", () => {
    const { doc, bordId } = start();
    const r = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bordId }, "onderbord");
    expect(r.ids.map((id) => haal(r.doc, id).type)).toEqual(["automaat", "leiding"]);
  });

  test("op de rail van een differentieel", () => {
    const { doc, bordId } = start();
    const d = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bordId }, "differentieel");
    const r = voegOnderdeelToe(d.doc, { soort: "rail-einde", nodeId: d.ids[0]! }, "lichtpunt");
    expect(haal(r.doc, r.ids[0]!).parentId).toBe(d.ids[0]);
    expect(valideerStructuur(r.doc)).toEqual([]);
  });

  test("op een node die geen bord of differentieel is: NIET_TOEGELATEN_KIND", () => {
    const { doc, tellerId } = start();
    for (const nodeId of [doc.rootId, tellerId]) {
      const aanknoping = { soort: "rail-einde", nodeId } as const;
      expect(magToevoegen(doc, aanknoping, "contactdoos")).toBe(false);
      expect(vangFout(() => voegOnderdeelToe(doc, aanknoping, "contactdoos")).code).toBe(
        "NIET_TOEGELATEN_KIND",
      );
    }
  });
});

describe("voegOnderdeelToe op een kring-einde", () => {
  test("het punt komt bovenop een blad en krijgt de standaardwaarden", () => {
    const { doc, bordId } = start();
    const eerste = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bordId }, "contactdoos");
    const leidingId = eerste.ids[1]!;
    const r = voegOnderdeelToe(
      eerste.doc,
      { soort: "kring-einde", nodeId: leidingId },
      "contactdoos",
    );
    expect(r.ids).toHaveLength(1);
    expect(haal(r.doc, r.ids[0]!)).toMatchObject({
      type: "contactdoos",
      aantal: 1,
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
      parentId: leidingId,
    });
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(eerste.doc);
  });

  test("lichtpunt en schakelaar op een punt", () => {
    const { doc, puntId } = kring();
    const licht = voegOnderdeelToe(doc, { soort: "kring-einde", nodeId: puntId }, "lichtpunt");
    expect(haal(licht.doc, licht.ids[0]!)).toMatchObject({ type: "lichtpunt", aantal: 1 });
    const schakelaar = voegOnderdeelToe(doc, { soort: "kring-einde", nodeId: puntId }, "schakelaar");
    expect(haal(schakelaar.doc, schakelaar.ids[0]!)).toMatchObject({
      type: "schakelaar",
      soort: "enkel",
    });
  });

  test("toestel krijgt de gekozen soort, standaard andere", () => {
    const { doc, leidingId, puntId } = kring();
    expect(puntId).not.toBe(leidingId);
    const aanknoping = { soort: "kring-einde", nodeId: puntId } as const;
    const was = voegOnderdeelToe(doc, aanknoping, "toestel", "wasmachine");
    expect(haal(was.doc, was.ids[0]!)).toMatchObject({ type: "toestel", soort: "wasmachine" });
    const zonder = voegOnderdeelToe(doc, aanknoping, "toestel");
    expect(haal(zonder.doc, zonder.ids[0]!)).toMatchObject({ soort: "andere" });
  });

  test("leiding komt bovenop een blad", () => {
    const { doc, puntId } = kring();
    const r = voegOnderdeelToe(doc, { soort: "kring-einde", nodeId: puntId }, "leiding");
    expect(haal(r.doc, r.ids[0]!)).toMatchObject({ type: "leiding", parentId: puntId });
    expect(valideerStructuur(r.doc)).toEqual([]);
  });

  test("onderbord op een contactdoos: een leiding en een verdeelbord", () => {
    const { doc, puntId } = kring();
    const r = voegOnderdeelToe(doc, { soort: "kring-einde", nodeId: puntId }, "onderbord");
    expect(r.ids.map((id) => haal(r.doc, id).type)).toEqual(["leiding", "verdeelbord"]);
    expect(haal(r.doc, r.ids[0]!).parentId).toBe(puntId);
    expect(haal(r.doc, r.ids[1]!).parentId).toBe(r.ids[0]);
    expect(valideerStructuur(r.doc)).toEqual([]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
  });

  test("onderbord op een leiding: alleen een verdeelbord", () => {
    const { bordId, doc } = start();
    const eerste = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bordId }, "contactdoos");
    const leidingId = eerste.ids[1]!;
    const r = voegOnderdeelToe(
      eerste.doc,
      { soort: "kring-einde", nodeId: leidingId },
      "onderbord",
    );
    expect(r.ids).toHaveLength(1);
    expect(haal(r.doc, r.ids[0]!)).toMatchObject({ type: "verdeelbord", parentId: leidingId });
    expect(valideerStructuur(r.doc)).toEqual([]);
  });

  test.each(["differentieel", "zekering"] as const)("%s: niet toegelaten", (onderdeel) => {
    const { doc, puntId } = kring();
    const aanknoping = { soort: "kring-einde", nodeId: puntId } as const;
    expect(magToevoegen(doc, aanknoping, onderdeel)).toBe(false);
    expect(vangFout(() => voegOnderdeelToe(doc, aanknoping, onderdeel)).code).toBe(
      "NIET_TOEGELATEN_KIND",
    );
  });

  test("een node met kinderen is geen einde", () => {
    const { doc, leidingId } = kring();
    const aanknoping = { soort: "kring-einde", nodeId: leidingId } as const;
    expect(magToevoegen(doc, aanknoping, "contactdoos")).toBe(false);
    expect(vangFout(() => voegOnderdeelToe(doc, aanknoping, "contactdoos")).code).toBe(
      "NIET_TOEGELATEN_KIND",
    );
  });

  test("een onbekende node geeft ONBEKENDE_NODE", () => {
    const { doc } = start();
    for (const soort of ["kring-einde", "rail-einde"] as const) {
      const aanknoping = { soort, nodeId: "bestaat-niet" };
      expect(magToevoegen(doc, aanknoping, "contactdoos")).toBe(false);
      expect(vangFout(() => voegOnderdeelToe(doc, aanknoping, "contactdoos")).code).toBe(
        "ONBEKENDE_NODE",
      );
    }
  });
});

describe("magToevoegen komt overeen met voegOnderdeelToe", () => {
  function voorbeeld(): InstallatieDocument {
    const { doc, bordId } = start();
    let d = doc;
    const voeg = (parent: NodeId, invoer: NodeInvoer): NodeId => {
      const r = voegToe(d, parent, invoer);
      d = r.doc;
      return r.id;
    };
    const automaat = voeg(bordId, NIEUWE_KRING_AUTOMAAT);
    const leiding = voeg(automaat, STANDAARD.leiding);
    const doos = voeg(leiding, STANDAARD.contactdoos);
    voeg(doos, STANDAARD.lichtpunt);
    const zekering = voeg(bordId, STANDAARD.zekering);
    voeg(zekering, STANDAARD.leiding);
    const diff = voeg(bordId, STANDAARD.differentieel);
    const automaat2 = voeg(diff, NIEUWE_KRING_AUTOMAAT);
    const leiding2 = voeg(automaat2, STANDAARD.leiding);
    voeg(leiding2, STANDAARD.toestel);
    const leiding3 = voeg(bordId, STANDAARD.leiding);
    voeg(leiding3, STANDAARD.onderbord);
    voeg(diff, STANDAARD.zekering);
    return d;
  }

  test("voor alle onderdelen, aanknopingen en nodes", () => {
    const doc = voorbeeld();
    expect(valideerStructuur(doc)).toEqual([]);
    const ids = [...Object.keys(doc.nodes), "bestaat-niet"];
    const uitkomsten = new Set<boolean>();
    for (const soort of ["kring-einde", "rail-einde"] as const) {
      for (const nodeId of ids) {
        for (const onderdeel of ONDERDELEN) {
          const sleutel = `${soort} ${nodeId} ${onderdeel}`;
          const aanknoping = { soort, nodeId };
          let gelukt: boolean;
          try {
            const r = voegOnderdeelToe(doc, aanknoping, onderdeel);
            expect(valideerStructuur(r.doc), sleutel).toEqual([]);
            expect(r.ids.length, sleutel).toBeGreaterThan(0);
            gelukt = true;
          } catch (fout) {
            expect(["NIET_TOEGELATEN_KIND", "ONBEKENDE_NODE"], sleutel).toContain(
              (fout as { code?: string }).code,
            );
            gelukt = false;
          }
          uitkomsten.add(gelukt);
          expect(magToevoegen(doc, aanknoping, onderdeel), sleutel).toBe(gelukt);
        }
      }
    }
    expect(uitkomsten).toEqual(new Set([true, false]));
  });
});

describe("SJABLONEN", () => {
  test("precies de 5 sjablonen uit de spec", () => {
    expect(SJABLONEN.map((s) => s.id)).toEqual([
      "kring-stopcontacten",
      "kring-verlichting",
      "kookplaat",
      "wasmachine",
      "badkamer",
    ]);
  });

  test("kring stopcontacten: automaat 20 A, leiding 2,5 mm² en 6 contactdozen in een keten", () => {
    const boom = sjabloonVoor("kring-stopcontacten", "2x230V").boom;
    expect(typesVan(boom)).toEqual([
      "automaat",
      "leiding",
      ...Array<string>(6).fill("contactdoos"),
    ]);
    expect(boom).toMatchObject({ nominaal_A: 20, curve: "B", polen: 2 });
    expect(boom.kinderen?.[0]).toMatchObject({ doorsnede_mm2: 2.5, aantalGeleiders: 3 });
  });

  test("kring verlichting: leiding, schakelaar, 4 lichtpunten", () => {
    const boom = sjabloonVoor("kring-verlichting", "2x230V").boom;
    expect(typesVan(boom)).toEqual([
      "automaat",
      "leiding",
      "schakelaar",
      "lichtpunt",
      "lichtpunt",
      "lichtpunt",
      "lichtpunt",
    ]);
    expect(boom).toMatchObject({ nominaal_A: 16, curve: "B" });
    expect(boom.kinderen?.[0]).toMatchObject({ doorsnede_mm2: 1.5, aantalGeleiders: 3 });
  });

  test("kookplaat: 2x230V en 3N400V", () => {
    const enkel = sjabloonVoor("kookplaat", "2x230V").boom;
    expect(typesVan(enkel)).toEqual(["automaat", "leiding", "toestel"]);
    expect(enkel).toMatchObject({ nominaal_A: 32, polen: 2 });
    expect(enkel.kinderen?.[0]).toMatchObject({ aantalGeleiders: 3, doorsnede_mm2: 6 });
    expect(enkel.kinderen?.[0]?.kinderen?.[0]).toMatchObject({
      type: "toestel",
      soort: "kookplaat",
      ruimte: "keuken",
    });
    const drie = sjabloonVoor("kookplaat", "3N400V").boom;
    expect(drie).toMatchObject({ polen: 4 });
    expect(drie.kinderen?.[0]).toMatchObject({ aantalGeleiders: 5, doorsnede_mm2: 6 });
    expect(sjabloonVoor("kookplaat", "3x230V")).toEqual(sjabloonVoor("kookplaat", "2x230V"));
    expect(sjabloonVoor("kring-stopcontacten", "3N400V")).toEqual(
      sjabloonVoor("kring-stopcontacten", "2x230V"),
    );
  });

  test("wasmachine en badkamer starten met een eigen differentieel van 30 mA", () => {
    const was = sjabloonVoor("wasmachine", "2x230V").boom;
    expect(typesVan(was)).toEqual(["differentieel", "automaat", "leiding", "toestel"]);
    expect(was).toMatchObject({ gevoeligheid_mA: 30, nominaal_A: 40, polen: 2, klasse: "A" });
    expect(was.kinderen?.[0]).toMatchObject({ nominaal_A: 20, polen: 2, curve: "B" });
    expect(was.kinderen?.[0]?.kinderen?.[0]?.kinderen?.[0]).toMatchObject({
      soort: "wasmachine",
      ruimte: "wasplaats",
    });
    const bad = sjabloonVoor("badkamer", "2x230V").boom;
    expect(typesVan(bad)).toEqual([
      "differentieel",
      "automaat",
      "leiding",
      "contactdoos",
      "contactdoos",
    ]);
    expect(bad).toMatchObject({ gevoeligheid_mA: 30 });
    expect(bad.kinderen?.[0]).toMatchObject({ nominaal_A: 16 });
    expect(bad.kinderen?.[0]?.kinderen?.[0]?.kinderen?.[0]).toMatchObject({ ruimte: "badkamer" });
  });

  test("onbekend sjabloon gooit ONGELDIG_SCHEMA", () => {
    expect(vangFout(() => sjabloonVoor("bestaat-niet", "2x230V")).code).toBe("ONGELDIG_SCHEMA");
  });
});

describe("voegSjabloonToe", () => {
  test("op een verdeelbord: één undo-stap en geldige structuur", () => {
    const { doc, bordId } = start();
    for (const sjabloon of SJABLONEN) {
      const r = voegSjabloonToe(doc, bordId, sjabloon.id);
      expect(haal(r.doc, bordId).kinderen).toEqual([r.id]);
      expect(valideerStructuur(r.doc)).toEqual([]);
      expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
    }
  });

  test("op een differentieel", () => {
    const { doc, differentieelId } = start();
    const r = voegSjabloonToe(doc, differentieelId, "badkamer");
    expect(haal(r.doc, r.id).parentId).toBe(differentieelId);
    expect(valideerStructuur(r.doc)).toEqual([]);
  });

  test("het kookplaatsjabloon volgt het stroomtype van het document", () => {
    const { doc, bordId } = start("3N400V");
    const r = voegSjabloonToe(doc, bordId, "kookplaat");
    expect(haal(r.doc, r.id)).toMatchObject({ type: "automaat", polen: 4 });
  });

  test("een ander doel: NIET_TOEGELATEN_KIND", () => {
    const { doc, tellerId } = start();
    for (const id of [doc.rootId, tellerId]) {
      expect(vangFout(() => voegSjabloonToe(doc, id, "kring-verlichting")).code).toBe(
        "NIET_TOEGELATEN_KIND",
      );
    }
  });

  test("een onbekende node: ONBEKENDE_NODE", () => {
    const { doc } = start();
    expect(vangFout(() => voegSjabloonToe(doc, "bestaat-niet", "kookplaat")).code).toBe(
      "ONBEKENDE_NODE",
    );
  });

  test("de sjablonen zijn onveranderd na gebruik", () => {
    const voor: Sjabloon[] = kloon([...SJABLONEN]);
    const { doc, bordId } = start();
    voegSjabloonToe(doc, bordId, "kring-stopcontacten");
    expect(kloon([...SJABLONEN])).toEqual(voor);
  });
});
