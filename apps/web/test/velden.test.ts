import { NodeSchema, RuimteSchema, type NodeType } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { GEMEENSCHAPPELIJK, VELDEN, type Veld } from "../app/editor/velden";

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
      // Een expliciet Nederlands label, niet de sleutel zelf.
      expect(veld.label.length).toBeGreaterThan(0);
      expect(veld.label).not.toBe(sleutel);
      if (veld.soort === "keuze") {
        expect(veld.opties?.map((o) => o.waarde)).toEqual(enumWaarden(schema));
        for (const optie of veld.opties!) expect(optie.label.length).toBeGreaterThan(0);
      } else {
        expect(veld.opties).toBeUndefined();
      }
    });
  });

  test("Nederlandse labels en eenheden", () => {
    const veld = (type: NodeType, sleutel: string) => VELDEN[type].find((v) => v.sleutel === sleutel);
    for (const type of ["differentieel", "automaat", "zekering"] as const) {
      expect(veld(type, "nominaal_A")).toMatchObject({ label: "Nominale stroom", eenheid: "A", soort: "getal" });
    }
    expect(veld("leiding", "doorsnede_mm2")).toMatchObject({ label: "Doorsnede", eenheid: "mm²" });
    expect(veld("differentieel", "gevoeligheid_mA")).toMatchObject({ label: "Gevoeligheid", eenheid: "mA" });
    expect(veld("differentieel", "polen")?.opties).toEqual([
      { waarde: 1, label: "1" },
      { waarde: 2, label: "2" },
      { waarde: 3, label: "3" },
      { waarde: 4, label: "4" },
    ]);
    expect(veld("toestel", "soort")?.opties?.find((o) => o.waarde === "kookplaat")?.label).toBe("Kookplaat");
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
    expect(GEMEENSCHAPPELIJK[0]).toMatchObject({ soort: "tekst", optioneel: true, label: "Label" });
    const ruimte = GEMEENSCHAPPELIJK[1]!;
    expect(ruimte).toMatchObject({ soort: "keuze", optioneel: true, label: "Ruimte" });
    expect(ruimte.opties?.map((o) => o.waarde)).toEqual(RuimteSchema.options);
    expect(ruimte.opties?.find((o) => o.waarde === "badkamer")?.label).toBe("Badkamer");
  });
});
