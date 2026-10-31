import { NodeSchema, ToestelsoortSchema, type NodeType, type Onderdeel } from "@elentrik/model";
import { tekenSymbool } from "@elentrik/symbols";
import { describe, expect, test } from "vitest";
import {
  KAARTEN,
  aanDelen,
  bediening,
  combinaties,
  naarVoorinstelling,
  voorbeeldNode,
  wijktAf,
  zelfdeCombinatie,
  zoekKaarten,
  type Kaart,
} from "../app/editor/symbolen";

const kaartVan = (type: NodeType): Kaart => KAARTEN.find((k) => k.type === type)!;

/** De waarden van het veld `soort` van een kaart. */
const soorten = (type: NodeType): readonly (boolean | string)[] =>
  kaartVan(type).velden.find((v) => v.sleutel === "soort")!.waarden;

/** De opties van het veld `soort` van een nodetype, uit de Zod-schema's van het model. */
const modelSoorten = (type: NodeType): readonly string[] => {
  const variant = NodeSchema.options.find((o) => o.shape.type.value === type)!;
  const soort = (variant.shape as unknown as Record<string, { def: { type: string; innerType?: { options: string[] } }; options?: string[] }>)["soort"]!;
  return soort.def.type === "optional" ? soort.def.innerType!.options : soort.options!;
};

describe("kaartenbron", () => {
  test("elk nodetype heeft precies één kaart", () => {
    const types = KAARTEN.map((k) => k.type).sort();
    expect(types).toEqual(NodeSchema.options.map((o) => o.shape.type.value as string).sort());
  });

  test("kiesbaar: de acht onderdelen, en waarom de rest niet", () => {
    const onderdelen = KAARTEN.flatMap((k) => (k.onderdeel === null ? [] : [k.onderdeel])).sort();
    const verwacht: Onderdeel[] = ["contactdoos", "differentieel", "lichtpunt", "leiding", "onderbord", "schakelaar", "toestel", "zekering"];
    expect(onderdelen).toEqual(verwacht.sort());
    expect(kaartVan("automaat").waaromNiet).toBe("automatisch");
    expect(kaartVan("aansluiting").waaromNiet).toBe("altijd");
    expect(kaartVan("teller").waaromNiet).toBe("altijd");
    for (const k of KAARTEN) expect(k.onderdeel === null).toBe(k.waaromNiet !== undefined);
  });

  test("aantal combinaties", () => {
    const aantallen: Partial<Record<NodeType, number>> = { contactdoos: 8, lichtpunt: 5, schakelaar: 12, toestel: 10 };
    for (const k of KAARTEN) expect(combinaties(k)).toHaveLength(aantallen[k.type] ?? 1);
    expect(combinaties(kaartVan("leiding"))).toEqual([{}]);
  });

  test("combinaties zijn uniek", () => {
    for (const k of KAARTEN) {
      expect(new Set(combinaties(k).map((c) => JSON.stringify(c))).size).toBe(combinaties(k).length);
    }
  });

  test("heeftAantal alleen voor contactdoos en lichtpunt", () => {
    expect(KAARTEN.filter((k) => k.heeftAantal).map((k) => k.type).sort()).toEqual(["contactdoos", "lichtpunt"]);
  });

  test("categorieën en rubrieken", () => {
    const per = (f: (k: Kaart) => string) => Object.fromEntries(KAARTEN.map((k) => [k.type, f(k)]));
    expect(per((k) => k.categorie)).toEqual({
      contactdoos: "punten", lichtpunt: "punten", schakelaar: "punten", toestel: "punten",
      leiding: "leidingenEnBorden", verdeelbord: "leidingenEnBorden",
      differentieel: "beveiliging", zekering: "beveiliging", automaat: "beveiliging",
      aansluiting: "voeding", teller: "voeding",
    });
    expect(per((k) => k.rubriek)).toEqual({
      contactdoos: "F", lichtpunt: "G", schakelaar: "E", toestel: "G", leiding: "C", verdeelbord: "B",
      differentieel: "D", zekering: "D", automaat: "D", aansluiting: "A", teller: "G",
    });
  });

  test("soorten komen uit het model", () => {
    expect([...soorten("lichtpunt")].sort()).toEqual([...modelSoorten("lichtpunt")].sort());
    expect([...soorten("schakelaar")].sort()).toEqual([...modelSoorten("schakelaar")].sort());
    expect([...soorten("toestel")].sort()).toEqual([...ToestelsoortSchema.options].sort());
  });

  test("voorbeeldNode is geldig en tekenbaar, voor elke kaart en elke combinatie", () => {
    for (const k of KAARTEN) {
      for (const c of combinaties(k)) {
        const node = voorbeeldNode(k, c);
        expect(NodeSchema.safeParse(node).success, `${k.type} ${JSON.stringify(c)}`).toBe(true);
        expect(node.type).toBe(k.type);
        expect(tekenSymbool(node).svg.length).toBeGreaterThan(0);
      }
    }
  });

  test("voorbeeldNode zet de voorinstelling over de standaard", () => {
    expect(voorbeeldNode(kaartVan("contactdoos"), { randaarde: false, waterdicht: true, aantal: 3 })).toMatchObject({
      randaarde: false, waterdicht: true, aantal: 3, kinderbeveiliging: true,
    });
    expect(voorbeeldNode(kaartVan("aansluiting"), {})).toMatchObject({ parentId: null });
  });

  test("voorbeeldNode negeert sleutels die het onderdeel niet toelaat", () => {
    const node = voorbeeldNode(kaartVan("toestel"), { soort: "oven", aantal: 4, waterdicht: true });
    expect(node).toMatchObject({ soort: "oven" });
    expect(node).not.toHaveProperty("aantal");
    expect(NodeSchema.safeParse(node).success).toBe(true);
  });
});

describe("zoekKaarten", () => {
  const tekst = (k: Kaart) => (k.type === "contactdoos" ? "Prise de courant" : `naam ${k.type}`);

  test("vindt op een deel van de tekst", () => {
    expect(zoekKaarten(KAARTEN, "prise", tekst).map((k) => k.type)).toEqual(["contactdoos"]);
  });

  test("negeert hoofdletters en accenten", () => {
    expect(zoekKaarten(KAARTEN, "PRISE", tekst).map((k) => k.type)).toEqual(["contactdoos"]);
    expect(zoekKaarten(KAARTEN, "prisé", tekst).map((k) => k.type)).toEqual(["contactdoos"]);
    expect(zoekKaarten(KAARTEN, "COURANT", () => "Courànt")).toHaveLength(KAARTEN.length);
  });

  test("geen treffer geeft een lege lijst", () => {
    expect(zoekKaarten(KAARTEN, "xyz", tekst)).toEqual([]);
  });

  test("een lege zoekterm geeft alle kaarten", () => {
    expect(zoekKaarten(KAARTEN, "", tekst)).toEqual([...KAARTEN]);
    expect(zoekKaarten(KAARTEN, "  ", tekst)).toEqual([...KAARTEN]);
  });
});

describe("bediening", () => {
  test("vult elk veld met de voorinstelling, anders de standaard van het model", () => {
    expect(bediening(kaartVan("contactdoos"), {})).toEqual({
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
      aantal: 1,
    });
    expect(bediening(kaartVan("contactdoos"), { waterdicht: true, aantal: 2 })).toEqual({
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: true,
      aantal: 2,
    });
    expect(bediening(kaartVan("toestel"), {})).toEqual({ soort: "andere" });
    expect(bediening(kaartVan("schakelaar"), { soort: "wissel" })).toEqual({ soort: "wissel", waterdicht: false });
  });

  test("lichtpunt zonder soort is standaard", () => {
    expect(bediening(kaartVan("lichtpunt"), {})).toEqual({ soort: "standaard", aantal: 1 });
  });

  test("een kaart zonder velden geeft niets", () => {
    expect(bediening(kaartVan("leiding"), {})).toEqual({});
  });

  test("negeert sleutels die de kaart niet kent", () => {
    expect(bediening(kaartVan("toestel"), { soort: "oven", waterdicht: true })).toEqual({ soort: "oven" });
  });
});

describe("naarVoorinstelling", () => {
  test("neemt de velden en het aantal over", () => {
    expect(naarVoorinstelling(kaartVan("contactdoos"), { randaarde: false, kinderbeveiliging: true, waterdicht: true, aantal: 3 }))
      .toEqual({ randaarde: false, kinderbeveiliging: true, waterdicht: true, aantal: 3 });
    expect(naarVoorinstelling(kaartVan("toestel"), { soort: "oven" })).toEqual({ soort: "oven" });
  });

  test("lichtpunt standaard wordt geen soort", () => {
    expect(naarVoorinstelling(kaartVan("lichtpunt"), { soort: "standaard", aantal: 2 })).toEqual({ aantal: 2 });
    expect(naarVoorinstelling(kaartVan("lichtpunt"), { soort: "led", aantal: 1 })).toEqual({ soort: "led", aantal: 1 });
  });
});

describe("zelfdeCombinatie en wijktAf", () => {
  test("zelfdeCombinatie kijkt alleen naar de velden van het raster", () => {
    const k = kaartVan("contactdoos");
    expect(zelfdeCombinatie(k, { waterdicht: true }, { randaarde: true, kinderbeveiliging: true, waterdicht: true })).toBe(true);
    expect(zelfdeCombinatie(k, { waterdicht: true, aantal: 2 }, { waterdicht: true })).toBe(true);
    expect(zelfdeCombinatie(k, { waterdicht: true }, {})).toBe(false);
  });

  test("wijktAf telt ook het aantal mee", () => {
    const k = kaartVan("contactdoos");
    expect(wijktAf(k, {}, {})).toBe(false);
    expect(wijktAf(k, { randaarde: true }, {})).toBe(false);
    expect(wijktAf(k, { aantal: 2 }, {})).toBe(true);
    expect(wijktAf(kaartVan("lichtpunt"), { soort: "standaard" }, {})).toBe(false);
    expect(wijktAf(kaartVan("toestel"), { soort: "wasmachine" }, { soort: "wasmachine" })).toBe(false);
    expect(wijktAf(kaartVan("toestel"), { soort: "oven" }, { soort: "wasmachine" })).toBe(true);
  });
});

describe("aanDelen", () => {
  test("de soort en de velden die aan staan, in de volgorde van de kaart", () => {
    expect(aanDelen(kaartVan("contactdoos"), {})).toEqual([{ veld: "randaarde" }, { veld: "kinderbeveiliging" }]);
    expect(aanDelen(kaartVan("contactdoos"), { randaarde: false, kinderbeveiliging: false })).toEqual([]);
    expect(aanDelen(kaartVan("schakelaar"), { soort: "wissel", waterdicht: true })).toEqual([
      { soort: "wissel" },
      { veld: "waterdicht" },
    ]);
    expect(aanDelen(kaartVan("lichtpunt"), {})).toEqual([{ soort: "standaard" }]);
    expect(aanDelen(kaartVan("leiding"), {})).toEqual([]);
  });

  test("elke combinatie heeft andere delen", () => {
    for (const k of KAARTEN) {
      const namen = combinaties(k).map((c) => JSON.stringify(aanDelen(k, c)));
      expect(new Set(namen).size).toBe(namen.length);
    }
  });
});
