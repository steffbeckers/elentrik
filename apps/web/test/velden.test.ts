import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NodeSchema, RuimteSchema, type NodeType } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { GEMEENSCHAPPELIJK, VELDEN, bouwVelden, type Veld } from "../app/editor/velden";
import nl from "../i18n/locales/nl.json";

type Boom = { [sleutel: string]: string | Boom };

/** De tekst onder `a.b.c` in nl.json, of undefined. */
function tekst(sleutel: string): string | undefined {
  let huidig: string | Boom | undefined = nl as Boom;
  for (const deel of sleutel.split(".")) {
    if (typeof huidig !== "object" || !Object.hasOwn(huidig, deel)) return undefined;
    huidig = huidig[deel];
  }
  return typeof huidig === "string" ? huidig : undefined;
}

/** Alle bladeren van een deelboom van nl.json. */
function bladeren(boom: Boom | string): string[] {
  return typeof boom === "string" ? [boom] : Object.values(boom).flatMap(bladeren);
}

/** Sleutels die geen eigen veld krijgen: structuur, of in `GEMEENSCHAPPELIJK`. */
const ZONDER_EIGEN_VELD = new Set(["id", "type", "parentId", "kinderen", "label", "ruimte"]);

/** Minimale vorm van een Zod-schema, zodat de test los staat van de introspectie in velden.ts. */
type Schema = { def: { type: string; innerType?: Schema; options?: Schema[] }; options?: unknown[]; values?: Set<unknown> };

function kern(schema: Schema): { schema: Schema; optioneel: boolean } {
  let huidig = schema;
  let optioneel = false;
  while (huidig.def.type === "optional") {
    optioneel = true;
    huidig = huidig.def.innerType!;
  }
  return { schema: huidig, optioneel };
}

const VERWACHTE_SOORT: Record<string, Veld["soort"]> = {
  number: "getal",
  string: "tekst",
  boolean: "schakelaar",
  enum: "keuze",
  union: "keuze",
};

function enumWaarden(schema: Schema): unknown[] {
  if (schema.def.type === "enum") return schema.options!;
  // Een unie van literals, zoals de polen.
  return schema.def.options!.flatMap((optie) => [...optie.values!]);
}

const varianten = NodeSchema.options.map((variant) => ({
  type: variant.shape.type.value as NodeType,
  shape: variant.shape as unknown as Record<string, Schema>,
}));

describe("VELDEN", () => {
  test("heeft precies de nodetypes van NodeSchema", () => {
    expect(Object.keys(VELDEN).toSorted()).toEqual(varianten.map((v) => v.type).toSorted());
  });

  describe.each(varianten)("$type", ({ type, shape }) => {
    const sleutels = Object.keys(shape).filter((s) => !ZONDER_EIGEN_VELD.has(s));

    test("elke sleutel heeft precies één veld, en er zijn geen andere velden", () => {
      expect(VELDEN[type].map((v) => v.sleutel).toSorted()).toEqual(sleutels.toSorted());
    });

    test.each(sleutels)("%s: soort, optioneel en keuzeopties volgen het schema", (sleutel) => {
      const veld = VELDEN[type].find((v) => v.sleutel === sleutel)!;
      const { schema, optioneel } = kern(shape[sleutel]!);
      expect(veld.soort).toBe(VERWACHTE_SOORT[schema.def.type]);
      expect(veld.optioneel === true).toBe(optioneel);
      // Een vertaalsleutel die in nl.json bestaat (de pariteitstest eist hem dan ook in fr en en).
      expect(veld.labelSleutel).toMatch(/^velden\./);
      expect(tekst(veld.labelSleutel), veld.labelSleutel).toBeTruthy();
      if (veld.soort === "keuze") {
        expect(veld.opties?.map((o) => o.waarde)).toEqual(enumWaarden(schema));
        for (const optie of veld.opties!) {
          // Getallen en technische symbolen (curve B, type AC) tonen zichzelf; al de rest is een sleutel.
          if (optie.labelSleutel !== undefined) expect(tekst(optie.labelSleutel), optie.labelSleutel).toBeTruthy();
        }
      } else {
        expect(veld.opties).toBeUndefined();
      }
    });
  });

  test("labelsleutels uit nl.json, en eenheden die letterlijk blijven", () => {
    const veld = (type: NodeType, sleutel: string) => VELDEN[type].find((v) => v.sleutel === sleutel);
    for (const type of ["differentieel", "automaat", "zekering"] as const) {
      expect(veld(type, "nominaal_A")).toMatchObject({ labelSleutel: "velden.nominaal_A.label", eenheid: "A", soort: "getal" });
    }
    expect(tekst("velden.nominaal_A.label")).toBe("Nominale stroom");
    expect(veld("leiding", "doorsnede_mm2")).toMatchObject({ labelSleutel: "velden.doorsnede_mm2.label", eenheid: "mm²" });
    expect(veld("differentieel", "gevoeligheid_mA")).toMatchObject({ eenheid: "mA" });
    expect(veld("differentieel", "polen")?.opties).toEqual([{ waarde: 1 }, { waarde: 2 }, { waarde: 3 }, { waarde: 4 }]);
    expect(veld("differentieel", "klasse")?.opties).toEqual([{ waarde: "AC" }, { waarde: "A" }, { waarde: "F" }, { waarde: "B" }]);
    const kookplaat = veld("toestel", "soort")?.opties?.find((o) => o.waarde === "kookplaat");
    expect(kookplaat?.labelSleutel).toBe("velden.soort.opties.kookplaat");
    expect(tekst(kookplaat!.labelSleutel!)).toBe("Kookplaat");
  });

  test("velden.ts bevat zelf geen Nederlandse labels meer", () => {
    const bron = readFileSync(join(import.meta.dirname, "..", "app", "editor", "velden.ts"), "utf8");
    expect(bron).not.toContain("Badkamer");
    expect(bron).not.toContain("Nominale stroom");
    const teksten = [...bladeren((nl as Boom).velden!), ...bladeren((nl as Boom).ruimtes!)];
    expect(teksten.length).toBeGreaterThan(40);
    expect(teksten.filter((t) => bron.includes(`"${t}"`))).toEqual([]);
  });

  test("een ontbrekende beschrijving in nl.json laat het opbouwen falen", () => {
    expect(() => bouwVelden({ ...(nl as Boom), velden: { ...((nl as Boom).velden as Boom), nominaal_A: {} } })).toThrow(
      /nominaal_A/,
    );
    expect(() =>
      bouwVelden({ ...(nl as Boom), ruimtes: { ...((nl as Boom).ruimtes as Boom), badkamer: undefined as never } }),
    ).toThrow(/badkamer/);
    expect(() => bouwVelden(nl as Boom)).not.toThrow();
  });

  test("met nl.json geeft het opbouwen dezelfde velden als de app", () => {
    expect(bouwVelden(nl as Boom)).toEqual({ GEMEENSCHAPPELIJK, VELDEN });
  });

  test("gehele getallen krijgen stap 1 en het minimum uit het schema", () => {
    expect(VELDEN.contactdoos.find((v) => v.sleutel === "aantal")).toMatchObject({ min: 1, stap: 1 });
    expect(VELDEN.leiding.find((v) => v.sleutel === "doorsnede_mm2")).toMatchObject({ min: 0 });
    expect(VELDEN.leiding.find((v) => v.sleutel === "doorsnede_mm2")?.stap).toBeUndefined();
  });
});

describe("GEMEENSCHAPPELIJK", () => {
  test("label en ruimte, beide optioneel", () => {
    expect(GEMEENSCHAPPELIJK.map((v) => v.sleutel)).toEqual(["label", "ruimte"]);
    expect(GEMEENSCHAPPELIJK[0]).toMatchObject({ soort: "tekst", optioneel: true, labelSleutel: "velden.label.label" });
    const ruimte = GEMEENSCHAPPELIJK[1]!;
    expect(ruimte).toMatchObject({ soort: "keuze", optioneel: true, labelSleutel: "velden.ruimte.label" });
    expect(ruimte.opties?.map((o) => o.waarde)).toEqual(RuimteSchema.options);
    expect(ruimte.opties?.map((o) => o.labelSleutel)).toEqual(RuimteSchema.options.map((r) => `ruimtes.${r}`));
    expect(tekst("ruimtes.badkamer")).toBe("Badkamer");
  });
});
