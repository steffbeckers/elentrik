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
import { veldWaarde } from "./werkconcept";

export type Veld = {
  sleutel: string;
  /** De vertaalsleutel van het label. */
  labelSleutel: string;
  soort: "getal" | "tekst" | "keuze" | "schakelaar";
  eenheid?: string;
  /** Zonder `labelSleutel` toont een optie haar waarde zelf: een getal (polen) of een symbool (curve B). */
  suggesties?: string[];
  /** Alleen een weergavestandaard; schrijft geen attribuut naar het document. */
  standaard?: boolean | string;
  opties?: { waarde: string | number; labelSleutel?: string }[];
  min?: number;
  stap?: number;
  /** Het veld mag leeg; leegmaken stuurt `undefined`, wat de eigenschap verwijdert. */
  optioneel?: boolean;
  /** De groep met een eigen kop in het paneel (`editor.eigenschappen.groepen.<groep>`). */
  groep: VeldGroep;
};

/** De groepen van het paneel, in de volgorde waarin het ze toont. */
export const VELDGROEPEN = ["elektrisch", "uitvoering", "benaming", "ruimte", "test"] as const;
export type VeldGroep = (typeof VELDGROEPEN)[number];

/** Een deelboom van een vertaalbestand. */
type Boom = { [sleutel: string]: string | Boom };

/** Sleutels die geen veld krijgen (structuur), en de sleutels uit `GEMEENSCHAPPELIJK`. */
const STRUCTUUR = new Set(["id", "type", "parentId", "kinderen", "aftakking"]);
const GEMEENSCHAPPELIJKE_SLEUTELS = ["label", "ruimte", "ruimteNaam"] as const;

/** Eenheden per sleutel: letterlijk, in elke taal dezelfde. */
const EENHEDEN: Readonly<Record<string, string>> = {
  gevoeligheid_mA: "mA",
  nominaal_A: "A",
  kortsluitvermogen_kA: "kA",
  doorsnede_mm2: "mm²",
  vermogen_W: "W",
  schijnbaarVermogen_kVA: "kVA",
  dcDetectie_mA: "mA DC",
  lengte_m: "m",
  uitschakeltijd_ms: "ms",
};

/**
 * De groep per sleutel. Elektrisch: de beveiliging en de leiding (In, polen, curve, Icn, gevoeligheid...).
 * Benaming en plan: hoe het onderdeel heet en op het plan staat. Ruimte: de soort ruimte. Test: de
 * geregistreerde differentieeltest, nooit beoordeeld. Al de rest valt onder Uitvoering.
 */
const GROEPEN: Readonly<Record<string, VeldGroep>> = {
  gevoeligheid_mA: "elektrisch",
  nominaal_A: "elektrisch",
  polen: "elektrisch",
  klasse: "elektrisch",
  curve: "elektrisch",
  kortsluitvermogen_kA: "elektrisch",
  kabeltype: "elektrisch",
  doorsnede_mm2: "elektrisch",
  aantalGeleiders: "elektrisch",
  metBeschermingsgeleider: "elektrisch",
  vermogen_W: "elektrisch",
  schijnbaarVermogen_kVA: "elektrisch",
  dcDetectie_mA: "elektrisch",
  label: "benaming",
  ruimteNaam: "benaming",
  kringCode: "benaming",
  referentie: "benaming",
  naam: "benaming",
  puntReferentie: "benaming",
  ruimte: "ruimte",
  testResultaat: "test",
  uitschakeltijd_ms: "test",
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
  shape?: Record<string,ZodVorm>;
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
  const veld: Veld = {
    sleutel,
    labelSleutel: vereis(boom, `velden.${sleutel}.label`),
    soort: "tekst",
    groep: GROEPEN[sleutel] ?? "uitvoering",
  };
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
  if (sleutel === "metBeschermingsgeleider") veld.standaard = true;
  if (sleutel === "puntReferentie") veld.standaard = "automatisch";
  if (sleutel === "brandreactieklasse") veld.suggesties = ["Eca", "Cca"];
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
        .flatMap(([sleutel, schema]) => {
          if(sleutel !== "aanleg") return [veldVan(boom,sleutel,schema)];
          const object=schema.def.innerType!;
          return Object.entries(object.shape!).map(([deel,zod])=>({...veldVan(boom,`aanleg.${deel}`,zod),optioneel:true}));
        });
      return [type, eigen];
    }),
  ) as Record<NodeType, Veld[]>;
  return { GEMEENSCHAPPELIJK: gemeenschappelijk, VELDEN: velden };
}

export const { GEMEENSCHAPPELIJK, VELDEN } = bouwVelden();

/** Verbindt de optionele veldwaarde met dezelfde standaard die de gedeelde labels gebruiken. */
export function veldWeergaveWaarde(node: unknown, veld: Pick<Veld, "sleutel" | "standaard">): unknown {
  const waarde = veldWaarde(node, veld.sleutel);
  return waarde === undefined ? veld.standaard : waarde;
}

/** De velden per groep, in de volgorde van `VELDGROEPEN`; binnen een groep in de volgorde van `velden`. Lege groepen vallen weg. */
export function veldGroepen(velden: readonly Veld[]): { groep: VeldGroep; velden: Veld[] }[] {
  return VELDGROEPEN.map((groep) => ({ groep, velden: velden.filter((v) => v.groep === groep) })).filter(
    (g) => g.velden.length > 0,
  );
}
