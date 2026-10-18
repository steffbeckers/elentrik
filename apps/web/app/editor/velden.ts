// Puur, met expliciete imports (ruling E1): de veldbeschrijvingen van het paneel Eigenschappen.
// De velden, hun soort en de keuzeopties volgen rechtstreeks uit de Zod-schema's van het model,
// zodat elk nieuw attribuut meteen aanpasbaar is ("alles aanpasbaar"). Alleen de Nederlandse
// labels en eenheden staan hier expliciet; ontbreekt er een, dan faalt het laden van deze module.
import { NodeSchema, type NodeType } from "@elentrik/model";

export type Veld = {
  sleutel: string;
  label: string;
  soort: "getal" | "tekst" | "keuze" | "schakelaar";
  eenheid?: string;
  opties?: { waarde: string | number; label: string }[];
  min?: number;
  stap?: number;
  /** Het veld mag leeg; leegmaken stuurt `undefined`, wat de eigenschap verwijdert. */
  optioneel?: boolean;
};

/** Labels van één sleutel. `opties` geeft het label per enumwaarde. */
type Beschrijving = { label: string; eenheid?: string; opties?: Record<string, string> };

/** Sleutels die geen veld krijgen (structuur), en de sleutels uit `GEMEENSCHAPPELIJK`. */
const STRUCTUUR = new Set(["id", "type", "parentId", "kinderen"]);
const GEMEENSCHAPPELIJKE_SLEUTELS = ["label", "ruimte"] as const;

const RUIMTES: Record<string, string> = {
  badkamer: "Badkamer",
  keuken: "Keuken",
  wasplaats: "Wasplaats",
  slaapkamer: "Slaapkamer",
  leefruimte: "Leefruimte",
  garage: "Garage",
  kelder: "Kelder",
  zolder: "Zolder",
  buiten: "Buiten",
  technisch: "Technische ruimte",
  andere: "Andere",
};

/** Labels per sleutel, voor alle types die de sleutel hebben. */
const ALGEMEEN: Record<string, Beschrijving> = {
  label: { label: "Label" },
  ruimte: { label: "Ruimte", opties: RUIMTES },
  gevoeligheid_mA: { label: "Gevoeligheid", eenheid: "mA" },
  nominaal_A: { label: "Nominale stroom", eenheid: "A" },
  polen: { label: "Polen" },
  klasse: { label: "Type", opties: { AC: "AC", A: "A", F: "F", B: "B" } },
  curve: { label: "Curve", opties: { B: "B", C: "C", D: "D" } },
  kortsluitvermogen_kA: { label: "Kortsluitvermogen", eenheid: "kA" },
  naam: { label: "Naam" },
  kabeltype: { label: "Kabeltype" },
  doorsnede_mm2: { label: "Doorsnede", eenheid: "mm²" },
  aantalGeleiders: { label: "Aantal geleiders" },
  plaatsing: {
    label: "Plaatsing",
    opties: { inbouw: "Inbouw", opbouw: "Opbouw", buis: "In buis", grond: "In de grond" },
  },
  aantal: { label: "Aantal" },
  randaarde: { label: "Randaarde" },
  kinderbeveiliging: { label: "Kinderbeveiliging" },
  waterdicht: { label: "Waterdicht" },
  vermogen_W: { label: "Vermogen", eenheid: "W" },
};

/** Labels die per type verschillen (`soort`). */
const PER_TYPE: Partial<Record<NodeType, Record<string, Beschrijving>>> = {
  lichtpunt: {
    soort: {
      label: "Soort",
      opties: { standaard: "Standaard", led: "LED", tl: "TL", spot: "Spot", noodverlichting: "Noodverlichting" },
    },
  },
  schakelaar: {
    soort: {
      label: "Soort",
      opties: {
        enkel: "Enkel",
        dubbel: "Dubbel",
        wissel: "Wissel",
        kruis: "Kruis",
        dimmer: "Dimmer",
        drukknop: "Drukknop",
      },
    },
  },
  toestel: {
    soort: {
      label: "Soort",
      opties: {
        wasmachine: "Wasmachine",
        droogkast: "Droogkast",
        vaatwasser: "Vaatwasser",
        kookplaat: "Kookplaat",
        oven: "Oven",
        boiler: "Boiler",
        warmtepomp: "Warmtepomp",
        laadpaal: "Laadpaal",
        omvormer: "Omvormer",
        andere: "Andere",
      },
    },
  },
};

/** Het deel van een Zod-schema dat hier gelezen wordt. */
type ZodVorm = {
  def: { type: string; innerType?: ZodVorm; options?: ZodVorm[] };
  options?: readonly (string | number)[];
  values?: Set<unknown>;
  minValue?: number | null;
  isInt?: boolean;
};

function beschrijving(type: NodeType | null, sleutel: string): Beschrijving {
  const b = (type && PER_TYPE[type]?.[sleutel]) ?? ALGEMEEN[sleutel];
  if (!b) throw new Error(`velden.ts: geen label voor ${type ?? "*"}.${sleutel}`);
  return b;
}

function optieLabel(b: Beschrijving, sleutel: string, waarde: string | number): string {
  const label = b.opties?.[String(waarde)];
  if (label !== undefined) return label;
  // Getallen (zoals de polen) tonen zichzelf; tekstwaarden hebben een expliciet label nodig.
  if (typeof waarde === "number") return String(waarde);
  throw new Error(`velden.ts: geen label voor de optie ${sleutel}=${waarde}`);
}

function keuzeWaarden(schema: ZodVorm): (string | number)[] {
  if (schema.def.type === "enum") return [...(schema.options ?? [])];
  // Een unie van literals, zoals `PolenSchema`.
  return (schema.def.options ?? []).flatMap((optie) => {
    if (optie.def.type !== "literal" || !optie.values) throw new Error("velden.ts: onverwachte unie");
    return [...optie.values] as (string | number)[];
  });
}

function veldVan(type: NodeType | null, sleutel: string, zod: ZodVorm): Veld {
  let schema = zod;
  let optioneel = false;
  while (schema.def.type === "optional" && schema.def.innerType) {
    optioneel = true;
    schema = schema.def.innerType;
  }
  const b = beschrijving(type, sleutel);
  const veld: Veld = { sleutel, label: b.label, soort: "tekst" };
  if (b.eenheid !== undefined) veld.eenheid = b.eenheid;

  switch (schema.def.type) {
    case "number":
      veld.soort = "getal";
      if (typeof schema.minValue === "number" && Number.isFinite(schema.minValue)) veld.min = schema.minValue;
      if (schema.isInt) veld.stap = 1;
      break;
    case "string":
      veld.soort = "tekst";
      break;
    case "boolean":
      veld.soort = "schakelaar";
      break;
    case "enum":
    case "union":
      veld.soort = "keuze";
      veld.opties = keuzeWaarden(schema).map((waarde) => ({ waarde, label: optieLabel(b, sleutel, waarde) }));
      break;
    default:
      throw new Error(`velden.ts: geen veldsoort voor ${sleutel} (${schema.def.type})`);
  }
  if (optioneel) veld.optioneel = true;
  return veld;
}

/** `label` en `ruimte`: elk type heeft ze, uit de gedeelde basis van de varianten. */
const BASIS = NodeSchema.options[0].shape as unknown as Record<string, ZodVorm>;
export const GEMEENSCHAPPELIJK: Veld[] = GEMEENSCHAPPELIJKE_SLEUTELS.map((sleutel) =>
  veldVan(null, sleutel, BASIS[sleutel]!),
);

/** De eigen velden per nodetype, in de volgorde van het schema. */
export const VELDEN = Object.fromEntries(
  NodeSchema.options.map((variant) => {
    const type = variant.shape.type.value as NodeType;
    const shape = variant.shape as unknown as Record<string, ZodVorm>;
    const velden = Object.entries(shape)
      .filter(([sleutel]) => !STRUCTUUR.has(sleutel) && !(GEMEENSCHAPPELIJKE_SLEUTELS as readonly string[]).includes(sleutel))
      .map(([sleutel, schema]) => veldVan(type, sleutel, schema));
    return [type, velden];
  }),
) as Record<NodeType, Veld[]>;
