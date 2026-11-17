import { describe, expect, test } from "vitest";
import {
  MAX_KRINGEN_PER_DIFFERENTIEEL,
  SJABLONEN,
  STANDAARD,
  bepaalKringCodes,
  isKringSjabloon,
  nieuwDocument,
  nieuwProjectDocument,
  pasPatchesToe,
  sjabloonDifferentieel,
  sjabloonVoor,
  startWoning,
  telVoorLimiet,
  valideerStructuur,
  voegBordSjabloonToe,
  voegOnderdeelToe,
  voegSjabloonToe,
  voegToe,
  type InstallatieDocument,
  type Node,
  type NodeId,
  type SjabloonNode,
  type Stroomtype,
} from "../src/index";
import { kloon, vangFout } from "./hulp";

const STROOMTYPES: Stroomtype[] = ["2x230V", "3x230V", "3N400V"];

/** Tabel 1 voor een automaat: [doorsnede in mm², hoogste nominale stroom in A]. */
const MAX_AUTOMAAT: Record<number, number> = { 1.5: 16, 2.5: 20, 4: 25, 6: 40, 10: 63 };

function start(stroomtype: Stroomtype = "2x230V"): { doc: InstallatieDocument; bordId: NodeId } {
  const doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype, datum: "2026-11-16" });
  const bord = Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!;
  return { doc, bordId: bord.id };
}

/** Alle nodes van een sjabloonboom, in pre-order. */
function plat(boom: SjabloonNode): SjabloonNode[] {
  return [boom, ...(boom.kinderen ?? []).flatMap(plat)];
}

function typesVan(boom: SjabloonNode): string[] {
  return plat(boom).map((n) => n.type);
}

function kinderenVan(doc: InstallatieDocument, id: NodeId): Node[] {
  return doc.nodes[id]!.kinderen.map((kind) => doc.nodes[kind]!);
}

/** De nodes onder `id` (zonder `id` zelf), in pre-order. */
function onder(doc: InstallatieDocument, id: NodeId): Node[] {
  return kinderenVan(doc, id).flatMap((kind) => [kind, ...onder(doc, kind.id)]);
}

describe("de nieuwe sjablonen", () => {
  test("vijftien sjablonen, gegroepeerd voor het paneel", () => {
    const perGroep = (groep: string) => SJABLONEN.filter((s) => s.groep === groep).map((s) => s.id);
    expect(perGroep("kringen")).toEqual(["kring-stopcontacten", "kring-verlichting", "keuken", "badkamer", "buiten"]);
    expect(perGroep("toestellen")).toEqual([
      "kookplaat",
      "oven",
      "vaatwasser",
      "wasmachine",
      "droogkast",
      "boiler",
      "warmtepomp",
      "laadpaal",
      "zonnepanelen",
    ]);
    expect(perGroep("installatie")).toEqual(["aarding"]);
    expect(SJABLONEN).toHaveLength(15);
    expect(new Set(SJABLONEN.map((s) => s.id)).size).toBe(15);
  });

  test.each(STROOMTYPES)("elke automaat past bij de kleinste doorsnede van zijn kring (%s)", (stroomtype) => {
    for (const { id } of SJABLONEN) {
      const nodes = plat(sjabloonVoor(id, stroomtype).boom);
      for (const automaat of nodes.filter((n) => n.type === "automaat")) {
        const doorsnedes = plat(automaat)
          .filter((n) => n.type === "leiding")
          .map((n) => (n as { doorsnede_mm2: number }).doorsnede_mm2);
        expect(doorsnedes.length, id).toBeGreaterThan(0);
        const max = MAX_AUTOMAAT[Math.min(...doorsnedes)];
        expect(max, id).toBeDefined();
        expect((automaat as { nominaal_A: number }).nominaal_A, id).toBeLessThanOrEqual(max!);
      }
    }
  });

  test("vaatwasser en droogkast: eigen kring achter een differentieel van 30 mA, zoals de wasmachine", () => {
    for (const soort of ["vaatwasser", "droogkast"] as const) {
      const boom = sjabloonVoor(soort, "2x230V").boom;
      expect(typesVan(boom)).toEqual(["differentieel", "automaat", "leiding", "toestel"]);
      expect(boom).toMatchObject({ gevoeligheid_mA: 30, klasse: "A" });
      expect(boom.kinderen?.[0]).toMatchObject({ nominaal_A: 20, polen: 2, curve: "B" });
      expect(boom.kinderen?.[0]?.kinderen?.[0]).toMatchObject({ doorsnede_mm2: 2.5, aantalGeleiders: 3 });
      expect(plat(boom).at(-1)).toMatchObject({ type: "toestel", soort });
    }
  });

  test("oven, boiler en warmtepomp: een eigen kring zonder eigen differentieel", () => {
    for (const soort of ["oven", "boiler", "warmtepomp"] as const) {
      const boom = sjabloonVoor(soort, "2x230V").boom;
      expect(typesVan(boom), soort).toEqual(["automaat", "leiding", "toestel"]);
      expect(boom, soort).toMatchObject({ polen: 2 });
      expect(plat(boom).at(-1)).toMatchObject({ type: "toestel", soort });
      expect(sjabloonDifferentieel(sjabloonVoor(soort, "2x230V"))).toBeUndefined();
    }
    expect(sjabloonVoor("oven", "2x230V").boom).toMatchObject({ nominaal_A: 20, curve: "B" });
    expect(sjabloonVoor("boiler", "2x230V").boom).toMatchObject({ nominaal_A: 20, curve: "B" });
    // Een compressor heeft een hoge aanloopstroom: curve C.
    expect(sjabloonVoor("warmtepomp", "2x230V").boom).toMatchObject({ nominaal_A: 20, curve: "C" });
  });

  test("warmtepomp en laadpaal volgen het stroomtype zoals de kookplaat", () => {
    const pomp = sjabloonVoor("warmtepomp", "3N400V").boom;
    expect(pomp).toMatchObject({ type: "automaat", polen: 4 });
    expect(pomp.kinderen?.[0]).toMatchObject({ aantalGeleiders: 5 });
    expect(sjabloonVoor("warmtepomp", "3x230V")).toEqual(sjabloonVoor("warmtepomp", "2x230V"));
    expect(sjabloonVoor("laadpaal", "3x230V")).toEqual(sjabloonVoor("laadpaal", "2x230V"));
    // De eenfasige toestellen blijven tweepolig.
    for (const id of ["oven", "boiler", "vaatwasser", "droogkast", "zonnepanelen", "keuken", "buiten"]) {
      expect(sjabloonVoor(id, "3N400V"), id).toEqual(sjabloonVoor(id, "2x230V"));
    }
  });

  test("laadpaal: een eigen differentieel van 30 mA klasse B", () => {
    const een = sjabloonVoor("laadpaal", "2x230V");
    expect(typesVan(een.boom)).toEqual(["differentieel", "automaat", "leiding", "toestel"]);
    expect(een.eigenDifferentieel).toBe(true);
    expect(een.boom).toMatchObject({ gevoeligheid_mA: 30, nominaal_A: 40, polen: 2, klasse: "B" });
    expect(een.boom.kinderen?.[0]).toMatchObject({ nominaal_A: 32, polen: 2 });
    expect(een.boom.kinderen?.[0]?.kinderen?.[0]).toMatchObject({ doorsnede_mm2: 6, aantalGeleiders: 3 });
    expect(sjabloonDifferentieel(een)).toEqual({ gevoeligheid_mA: 30, nominaal_A: 40, polen: 2, klasse: "B" });

    const drie = sjabloonVoor("laadpaal", "3N400V");
    expect(drie.boom).toMatchObject({ gevoeligheid_mA: 30, polen: 4, klasse: "B" });
    expect(drie.boom.kinderen?.[0]).toMatchObject({ nominaal_A: 16, polen: 4 });
    expect(drie.boom.kinderen?.[0]?.kinderen?.[0]).toMatchObject({ doorsnede_mm2: 2.5, aantalGeleiders: 5 });
    // Alleen de laadpaal vraagt een eigen differentieel.
    expect(SJABLONEN.filter((s) => s.eigenDifferentieel).map((s) => s.id)).toEqual(["laadpaal"]);
  });

  test("het differentieel van een sjabloon is de voorinstelling voor een nieuw differentieel", () => {
    expect(sjabloonDifferentieel(sjabloonVoor("wasmachine", "2x230V"))).toEqual({
      gevoeligheid_mA: 30,
      nominaal_A: 40,
      polen: 2,
      klasse: "A",
    });
    expect(sjabloonDifferentieel(sjabloonVoor("kookplaat", "2x230V"))).toBeUndefined();
    expect(sjabloonDifferentieel(sjabloonVoor("aarding", "2x230V"))).toBeUndefined();
  });

  test("zonnepanelen: omvormer op een eigen kring, met de panelen achter een DC-leiding", () => {
    const boom = sjabloonVoor("zonnepanelen", "2x230V").boom;
    expect(typesVan(boom)).toEqual(["automaat", "leiding", "toestel", "leiding", "toestel"]);
    const [automaat, ac, omvormer, dc, panelen] = plat(boom);
    expect(automaat).toMatchObject({ nominaal_A: 25, polen: 2 });
    expect(ac).toMatchObject({ doorsnede_mm2: 4, aantalGeleiders: 3 });
    expect(omvormer).toMatchObject({ soort: "omvormer" });
    expect(dc).toMatchObject({ aantalGeleiders: 2, metBeschermingsgeleider: false });
    expect(panelen).toMatchObject({ soort: "pvPaneel" });
  });

  test("keuken: vier dubbele contactdozen voor het werkblad, met de keuken als voorgestelde ruimte", () => {
    const sjabloon = sjabloonVoor("keuken", "2x230V");
    expect(sjabloon.ruimte).toBe("keuken");
    expect(typesVan(sjabloon.boom)).toEqual(["differentieel", "automaat", "leiding", ...Array<string>(4).fill("contactdoos")]);
    expect(sjabloon.boom).toMatchObject({ gevoeligheid_mA: 30 });
    expect(sjabloon.boom.kinderen?.[0]).toMatchObject({ nominaal_A: 20 });
    const dozen = plat(sjabloon.boom).filter((n) => n.type === "contactdoos");
    expect(dozen.every((n) => (n as { aantal: number }).aantal === 2)).toBe(true);
    expect(dozen.every((n) => !Object.hasOwn(n, "ruimte"))).toBe(true);
  });

  test("buiten: waterdichte contactdozen en een lichtpunt achter 30 mA", () => {
    const sjabloon = sjabloonVoor("buiten", "2x230V");
    expect(sjabloon.ruimte).toBe("buiten");
    expect(typesVan(sjabloon.boom)).toEqual(["differentieel", "automaat", "leiding", "contactdoos", "contactdoos", "lichtpunt"]);
    expect(sjabloon.boom).toMatchObject({ gevoeligheid_mA: 30 });
    expect(sjabloon.boom.kinderen?.[0]).toMatchObject({ nominaal_A: 16 });
    expect(sjabloon.boom.kinderen?.[0]?.kinderen?.[0]).toMatchObject({ doorsnede_mm2: 2.5 });
    const dozen = plat(sjabloon.boom).filter((n) => n.type === "contactdoos");
    expect(dozen.every((n) => (n as { waterdicht: boolean }).waterdicht)).toBe(true);
  });

  test("de ruimte van keuken en buiten gaat naar de nieuwe punten", () => {
    const { doc, bordId } = start();
    for (const id of ["keuken", "buiten"] as const) {
      const r = voegSjabloonToe(doc, { soort: "nieuw-op-bord", nodeId: bordId }, id);
      const punten = Object.values(r.doc.nodes).filter((n) => n.type === "contactdoos" || n.type === "lichtpunt");
      expect(punten.length).toBeGreaterThan(0);
      expect(punten.every((n) => n.ruimte === id)).toBe(true);
      expect(valideerStructuur(r.doc)).toEqual([]);
    }
  });
});

describe("aarding", () => {
  test("het sjabloon is een aardingsonderbreker met een aardelektrode, geen kring", () => {
    const sjabloon = sjabloonVoor("aarding", "2x230V");
    expect(typesVan(sjabloon.boom)).toEqual(["aardingsonderbreker", "aardelektrode"]);
    expect(isKringSjabloon(sjabloon)).toBe(false);
    expect(SJABLONEN.filter((s) => !isKringSjabloon(s)).map((s) => s.id)).toEqual(["aarding"]);
  });

  test("voegBordSjabloonToe zet de aarding rechtstreeks op het bord, in één undo-stap", () => {
    const { doc, bordId } = start();
    const voor = kloon(doc);
    const r = voegBordSjabloonToe(doc, bordId, "aarding");
    expect(valideerStructuur(r.doc)).toEqual([]);
    expect(r.doc.nodes[r.id]).toMatchObject({ type: "aardingsonderbreker", parentId: bordId });
    expect(kinderenVan(r.doc, r.id).map((n) => n.type)).toEqual(["aardelektrode"]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(voor);
  });

  test("alleen op een verdeelbord, en alleen voor een sjabloon dat geen kring is", () => {
    const { doc, bordId } = start();
    const differentieel = voegToe(doc, bordId, STANDAARD.differentieel);
    expect(vangFout(() => voegBordSjabloonToe(differentieel.doc, differentieel.id, "aarding")).code).toBe("NIET_TOEGELATEN_KIND");
    expect(vangFout(() => voegBordSjabloonToe(doc, doc.rootId, "aarding")).code).toBe("NIET_TOEGELATEN_KIND");
    expect(vangFout(() => voegBordSjabloonToe(doc, bordId, "kookplaat")).code).toBe("NIET_TOEGELATEN_KIND");
    expect(vangFout(() => voegBordSjabloonToe(doc, "bestaat-niet", "aarding")).code).toBe("ONBEKENDE_NODE");
    expect(vangFout(() => voegBordSjabloonToe(doc, bordId, "bestaat-niet")).code).toBe("ONGELDIG_SCHEMA");
  });

  test("als kring invoegen kan niet: de aarding hoort niet achter een differentieel", () => {
    const { doc, bordId } = start();
    expect(vangFout(() => voegSjabloonToe(doc, { soort: "nieuw-op-bord", nodeId: bordId }, "aarding")).code).toBe("NIET_TOEGELATEN_KIND");
  });
});

describe("startWoning", () => {
  test("zet een gewone woning op het bord, als één operatie", () => {
    const { doc, bordId } = start();
    const voor = kloon(doc);
    const r = startWoning(doc);

    expect(r.bordId).toBe(bordId);
    expect(valideerStructuur(r.doc)).toEqual([]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(voor);
    expect(pasPatchesToe(voor, r.patches)).toEqual(r.doc);
    expect(doc).toEqual(voor);

    const opBord = kinderenVan(r.doc, bordId);
    expect(opBord.map((n) => n.type)).toEqual(["aardingsonderbreker", "differentieel", "differentieel", "automaat", "automaat"]);
    const [aarding, eerste, tweede, kookplaat, oven] = opBord as [Node, Node, Node, Node, Node];

    expect(kinderenVan(r.doc, aarding.id).map((n) => n.type)).toEqual(["aardelektrode"]);

    // Twee kringen verlichting, twee kringen contactdozen en de keuken achter het eerste differentieel.
    expect(eerste).toMatchObject({ gevoeligheid_mA: 30, klasse: "A", polen: 2 });
    const kringenEerste = kinderenVan(r.doc, eerste.id);
    expect(kringenEerste.map((n) => n.type)).toEqual(Array<string>(5).fill("automaat"));
    const punten = (kring: Node) => onder(r.doc, kring.id).filter((n) => n.type !== "leiding");
    expect(punten(kringenEerste[0]!).map((n) => n.type)).toEqual(["schakelaar", "lichtpunt", "lichtpunt", "lichtpunt", "lichtpunt"]);
    expect(punten(kringenEerste[1]!).map((n) => n.type)).toEqual(["schakelaar", "lichtpunt", "lichtpunt", "lichtpunt", "lichtpunt"]);
    expect(punten(kringenEerste[2]!).map((n) => n.type)).toEqual(Array<string>(6).fill("contactdoos"));
    expect(punten(kringenEerste[3]!).map((n) => n.type)).toEqual(Array<string>(6).fill("contactdoos"));
    expect(punten(kringenEerste[4]!).map((n) => n.ruimte)).toEqual(Array<string>(4).fill("keuken"));

    // Badkamer, wasmachine, droogkast en vaatwasser achter het tweede.
    expect(tweede).toMatchObject({ gevoeligheid_mA: 30, klasse: "A", polen: 2 });
    const kringenTweede = kinderenVan(r.doc, tweede.id);
    expect(kringenTweede.map((n) => n.type)).toEqual(Array<string>(4).fill("automaat"));
    expect(punten(kringenTweede[0]!).map((n) => n.ruimte)).toEqual(["badkamer", "badkamer"]);
    expect(kringenTweede.slice(1).map((kring) => punten(kring).map((n) => (n as { soort?: string }).soort))).toEqual([
      ["wasmachine"],
      ["droogkast"],
      ["vaatwasser"],
    ]);

    // Kookplaat en oven rechtstreeks op het bord.
    expect(punten(kookplaat)).toMatchObject([{ type: "toestel", soort: "kookplaat" }]);
    expect(punten(oven)).toMatchObject([{ type: "toestel", soort: "oven" }]);

    expect(telVoorLimiet(r.doc).kringen).toBe(11);
    expect(Object.values(bepaalKringCodes(r.doc)).sort()).toEqual([..."ABCDEFGHIJK"]);
  });

  test("hoogstens acht kringen achter elk differentieel van 30 mA", () => {
    const { doc } = start();
    const r = startWoning(doc);
    const differentielen = Object.values(r.doc.nodes).filter((n) => n.type === "differentieel" && n.gevoeligheid_mA <= 30);
    expect(differentielen).toHaveLength(2);
    for (const differentieel of differentielen) {
      const kringen = onder(r.doc, differentieel.id).filter((n) => n.type === "automaat" || n.type === "zekering");
      expect(kringen.length).toBeLessThanOrEqual(MAX_KRINGEN_PER_DIFFERENTIEEL);
    }
    expect(MAX_KRINGEN_PER_DIFFERENTIEEL).toBe(8);
  });

  test.each(STROOMTYPES)("volgt het stroomtype (%s)", (stroomtype) => {
    const { doc, bordId } = start(stroomtype);
    const r = startWoning(doc);
    expect(valideerStructuur(r.doc)).toEqual([]);
    const polen = { "2x230V": 2, "3x230V": 3, "3N400V": 4 }[stroomtype];
    const opBord = kinderenVan(r.doc, bordId);
    expect(opBord.filter((n) => n.type === "differentieel").map((n) => (n as { polen: number }).polen)).toEqual([polen, polen]);
    // De kookplaat is de variant van het stroomtype; de oven blijft tweepolig.
    expect(opBord.filter((n) => n.type === "automaat").map((n) => (n as { polen: number }).polen)).toEqual([
      stroomtype === "3N400V" ? 4 : 2,
      2,
    ]);
  });

  test("alleen in een schema zonder kringen", () => {
    const { doc, bordId } = start();
    const metKring = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bordId }, "contactdoos").doc;
    expect(vangFout(() => startWoning(metKring)).code).toBe("NIET_TOEGELATEN_KIND");
    const metZekering = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bordId }, "zekering").doc;
    expect(vangFout(() => startWoning(metZekering)).code).toBe("NIET_TOEGELATEN_KIND");
    // Na de startwoning zijn er kringen: een tweede keer kan niet.
    expect(vangFout(() => startWoning(startWoning(doc).doc)).code).toBe("NIET_TOEGELATEN_KIND");
  });

  test("zonder verdeelbord kan het niet", () => {
    expect(vangFout(() => startWoning(nieuwDocument())).code).toBe("NIET_TOEGELATEN_KIND");
  });

  test("een bestaande aarding blijft de enige; een leeg differentieel blijft staan", () => {
    const { doc, bordId } = start();
    const aarding = voegBordSjabloonToe(doc, bordId, "aarding");
    const leeg = voegToe(aarding.doc, bordId, STANDAARD.differentieel);
    const r = startWoning(leeg.doc);
    expect(valideerStructuur(r.doc)).toEqual([]);
    expect(Object.values(r.doc.nodes).filter((n) => n.type === "aardingsonderbreker")).toHaveLength(1);
    expect(Object.values(r.doc.nodes).filter((n) => n.type === "aardelektrode")).toHaveLength(1);
    expect(kinderenVan(r.doc, bordId).map((n) => n.type)).toEqual([
      "aardingsonderbreker",
      "differentieel",
      "differentieel",
      "differentieel",
      "automaat",
      "automaat",
    ]);
    expect(r.doc.nodes[leeg.id]!.kinderen).toEqual([]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(leeg.doc);
  });

  test("de sjablonen zijn onveranderd na de startwoning", () => {
    const voor = kloon([...SJABLONEN]);
    startWoning(start().doc);
    expect(kloon([...SJABLONEN])).toEqual(voor);
  });
});
