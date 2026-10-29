// Puur, met expliciete imports (ruling E1): de veldbeschrijvingen van het paneel Eigenschappen.
// De velden, hun soort en de keuzeopties volgen rechtstreeks uit de Zod-schema's van het model,
// zodat elk nieuw attribuut meteen aanpasbaar is ("alles aanpasbaar"). De labels staan niet hier
// maar in de vertaalbestanden (plan 8): `velden.<sleutel>.label`, `velden.<sleutel>.opties.<waarde>`
// en `ruimtes.<ruimte>`. Het paneel vertaalt die sleutels. Eenheden zoals `mm²` en `A` zijn in elke
// taal dezelfde en staan hier letterlijk.
//
// Dat elke sleutel een tekst heeft, controleert `bouwVelden(nl)` tegen nl.json (de bron; de
// pariteitstest eist hem dan ook in fr en en): het faalt bij een ontbrekende beschrijving. De app
// zelf kan nl.json niet importeren: @nuxtjs/i18n compileert de vertaalbestanden tot berichtmodules
// (een import gaf "does not provide an export named 'ruimtes'"), dus die controle draait in
// test/velden.test.ts, die elke sleutel van elk schema afloopt.
import { NodeSchema, type NodeType } from "@elentrik/model";

export type Veld = {
  sleutel: string;
  /** De vertaalsleutel van het label. */
  labelSleutel: string;
  soort: "getal" | "tekst" | "keuze" | "schakelaar";
  eenheid?: string;
  /** Zonder `labelSleutel` toont een optie haar waarde zelf: een getal (polen) of een symbool (curve B). */
  opties?: { waarde: string | number; labelSleutel?: string }[];
  min?: number;
  stap?: number;
  /** Het veld mag leeg; leegmaken stuurt `undefined`, wat de eigenschap verwijdert. */
  optioneel?: boolean;
};

/** Een deelboom van een vertaalbestand. */
type Boom = { [sleutel: string]: string | Boom };

/** Sleutels die geen veld krijgen (structuur), en de sleutels uit `GEMEENSCHAPPELIJK`. */
const STRUCTUUR = new Set(["id", "type", "parentId", "kinderen"]);
const GEMEENSCHAPPELIJKE_SLEUTELS = ["label", "ruimte"] as const;

/** Eenheden per sleutel: letterlijk, in elke taal dezelfde. */
const EENHEDEN: Readonly<Record<string, string>> = {
  gevoeligheid_mA: "mA",
  nominaal_A: "A",
  kortsluitvermogen_kA: "kA",
  doorsnede_mm2: "mm²",
  vermogen_W: "W",
};

/** Keuzes waarvan de waarde een technisch symbool is dat in elke taal hetzelfde blijft (type AC, curve B). */
const LETTERLIJKE_OPTIES: ReadonlySet<string> = new Set(["klasse", "curve"]);

/** De tekst onder een sleutel (`a.b.c`) in een vertaalboom, of undefined. */
function tekst(boom: Boom, sleutel: string): string | undefined {
  let huidig: string | Boom | undefined = boom;
  for (const deel of sleutel.split(".")) {
    if (typeof huidig !== "object" || huidig === null || !Object.hasOwn(huidig, deel)) return undefined;
    huidig = huidig[deel];
  }
  return typeof huidig === "string" && huidig !== "" ? huidig : undefined;
}

/** De sleutel; met een vertaalboom gooit een sleutel zonder tekst. */
function vereis(boom: Boom | undefined, sleutel: string): string {
  if (boom && tekst(boom, sleutel) === undefined) throw new Error(`velden.ts: geen tekst voor ${sleutel} in nl.json`);
  return sleutel;
}

/** De vertaalsleutel van een tekstoptie: de vaste ruimtes delen `ruimtes.*`, de rest valt onder het veld. */
function optieSleutel(sleutel: string, waarde: string): string {
  return sleutel === "ruimte" ? `ruimtes.${waarde}` : `velden.${sleutel}.opties.${waarde}`;
}

/** Het deel van een Zod-schema dat hier gelezen wordt. */
type ZodVorm = {
  def: { type: string; innerType?: ZodVorm; options?: ZodVorm[] };
  options?: readonly (string | number)[];
  values?: Set<unknown>;
  minValue?: number | null;
  isInt?: boolean;
};

function keuzeWaarden(schema: ZodVorm): (string | number)[] {
  if (schema.def.type === "enum") return [...(schema.options ?? [])];
  // Een unie van literals, zoals `PolenSchema`.
  return (schema.def.options ?? []).flatMap((optie) => {
    if (optie.def.type !== "literal" || !optie.values) throw new Error("velden.ts: onverwachte unie");
    return [...optie.values] as (string | number)[];
  });
}

function veldVan(boom: Boom | undefined, sleutel: string, zod: ZodVorm): Veld {
  let schema = zod;
  let optioneel = false;
  while (schema.def.type === "optional" && schema.def.innerType) {
    optioneel = true;
    schema = schema.def.innerType;
  }
  const veld: Veld = { sleutel, labelSleutel: vereis(boom, `velden.${sleutel}.label`), soort: "tekst" };
  const eenheid = EENHEDEN[sleutel];
  if (eenheid !== undefined) veld.eenheid = eenheid;

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
      veld.opties = keuzeWaarden(schema).map((waarde) =>
        // Getallen (zoals de polen) en technische symbolen tonen zichzelf; tekstwaarden hebben een vertaling nodig.
        typeof waarde === "number" || LETTERLIJKE_OPTIES.has(sleutel)
          ? { waarde }
          : { waarde, labelSleutel: vereis(boom, optieSleutel(sleutel, waarde)) },
      );
      break;
    default:
      throw new Error(`velden.ts: geen veldsoort voor ${sleutel} (${schema.def.type})`);
  }
  if (optioneel) veld.optioneel = true;
  return veld;
}

/** `label` en `ruimte`: elk type heeft ze, uit de gedeelde basis van de varianten. */
const BASIS = NodeSchema.options[0].shape as unknown as Record<string, ZodVorm>;

/**
 * De velden met hun vertaalsleutels. Met een vertaalboom (nl.json, in de test) gooit een sleutel
 * zonder tekst. De app gebruikt `GEMEENSCHAPPELIJK` en `VELDEN`.
 */
export function bouwVelden(boom?: Boom): { GEMEENSCHAPPELIJK: Veld[]; VELDEN: Record<NodeType, Veld[]> } {
  const gemeenschappelijk = GEMEENSCHAPPELIJKE_SLEUTELS.map((sleutel) => veldVan(boom, sleutel, BASIS[sleutel]!));
  // De eigen velden per nodetype, in de volgorde van het schema.
  const velden = Object.fromEntries(
    NodeSchema.options.map((variant) => {
      const type = variant.shape.type.value as NodeType;
      const shape = variant.shape as unknown as Record<string, ZodVorm>;
      const eigen = Object.entries(shape)
        .filter(([sleutel]) => !STRUCTUUR.has(sleutel) && !(GEMEENSCHAPPELIJKE_SLEUTELS as readonly string[]).includes(sleutel))
        .map(([sleutel, schema]) => veldVan(boom, sleutel, schema));
      return [type, eigen];
    }),
  ) as Record<NodeType, Veld[]>;
  return { GEMEENSCHAPPELIJK: gemeenschappelijk, VELDEN: velden };
}

export const { GEMEENSCHAPPELIJK, VELDEN } = bouwVelden();
