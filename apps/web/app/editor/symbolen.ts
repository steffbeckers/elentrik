// Puur, met expliciete imports (ruling E1): de kaartenbron van het symbolenvenster (spec §4.1).
// Eén beschrijving van alle kaarten, gedeeld door de editor en de tests. De soortwaarden komen uit
// de Zod-schema's van het model, zodat een nieuwe soort vanzelf in het raster komt. De teksten
// (naam, uitleg, variantnamen) staan niet hier maar in de vertaalbestanden; `zoekKaarten` krijgt
// ze van de aanroeper, zodat het zoeken de actieve taal volgt.
import {
  NIEUWE_KRING_AUTOMAAT,
  NodeSchema,
  STANDAARD,
  ToestelsoortSchema,
  VISUELE_VELDEN,
  type Node,
  type NodeType,
  type Onderdeel,
  type Voorinstelling,
} from "@elentrik/model";

export type Categorie = "punten" | "leidingenEnBorden" | "beveiliging" | "voeding";

/** De rubriek van AREI tabel 2.23 waar het symbool staat. */
export type AreiRubriek = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type Kaart = {
  type: NodeType;
  /** `null` = niet te kiezen. */
  onderdeel: Onderdeel | null;
  /** Waarom een kaart niet te kiezen is: de automaat komt met een nieuwe kring, de rest staat in elk schema. */
  waaromNiet?: "automatisch" | "altijd";
  categorie: Categorie;
  rubriek: AreiRubriek;
  /** Visuele velden met hun waarden, in de volgorde van het raster. `aantal` zit hier niet in. */
  velden: readonly { sleutel: "randaarde" | "kinderbeveiliging" | "waterdicht" | "soort"; waarden: readonly (boolean | string)[] }[];
  heeftAantal: boolean;
};

/** De opties van het enumveld `soort` van een nodetype, uit het schema van het model. */
function soortenVan(type: NodeType): readonly string[] {
  const variant = NodeSchema.options.find((optie) => optie.shape.type.value === type);
  const vorm = variant?.shape as unknown as
    | Record<string, { def: { type: string; innerType?: { options: readonly string[] } }; options?: readonly string[] }>
    | undefined;
  const soort = vorm?.["soort"];
  const opties = soort?.def.type === "optional" ? soort.def.innerType?.options : soort?.options;
  if (!opties) throw new Error(`symbolen.ts: ${type} heeft geen enumveld soort`);
  return opties;
}

const JA_NEE = [false, true] as const;

/** Een kaart zonder visuele velden. */
const kaart = (
  type: NodeType,
  onderdeel: Onderdeel | null,
  categorie: Categorie,
  rubriek: AreiRubriek,
  extra: Partial<Pick<Kaart, "velden" | "heeftAantal" | "waaromNiet">> = {},
): Kaart => ({ type, onderdeel, categorie, rubriek, velden: [], heeftAantal: false, ...extra });

export const KAARTEN: readonly Kaart[] = [
  kaart("contactdoos", "contactdoos", "punten", "F", {
    heeftAantal: true,
    velden: [
      { sleutel: "randaarde", waarden: JA_NEE },
      { sleutel: "kinderbeveiliging", waarden: JA_NEE },
      { sleutel: "waterdicht", waarden: JA_NEE },
    ],
  }),
  // "standaard" staat voor "geen soort".
  kaart("lichtpunt", "lichtpunt", "punten", "G", {
    heeftAantal: true,
    velden: [{ sleutel: "soort", waarden: soortenVan("lichtpunt") }],
  }),
  kaart("schakelaar", "schakelaar", "punten", "E", {
    velden: [
      { sleutel: "soort", waarden: soortenVan("schakelaar") },
      { sleutel: "waterdicht", waarden: JA_NEE },
    ],
  }),
  kaart("toestel", "toestel", "punten", "G", { velden: [{ sleutel: "soort", waarden: ToestelsoortSchema.options }] }),
  kaart("leiding", "leiding", "leidingenEnBorden", "C"),
  kaart("verdeelbord", "onderbord", "leidingenEnBorden", "B"),
  kaart("differentieel", "differentieel", "beveiliging", "D"),
  kaart("zekering", "zekering", "beveiliging", "D"),
  kaart("automaat", null, "beveiliging", "D", { waaromNiet: "automatisch" }),
  kaart("aansluiting", null, "voeding", "A", { waaromNiet: "altijd" }),
  kaart("teller", null, "voeding", "G", { waaromNiet: "altijd" }),
];

/** Het cartesisch product van de velden van een kaart; een kaart zonder velden geeft de lege voorinstelling. */
export function combinaties(kaart: Kaart): Voorinstelling[] {
  return kaart.velden.reduce<Voorinstelling[]>(
    (tot, veld) => tot.flatMap((voor) => veld.waarden.map((waarde) => ({ ...voor, [veld.sleutel]: waarde }))),
    [{}],
  );
}

/** Een vaste dummy-structuur: een voorbeeld hoort in geen document. */
const DUMMY = { id: "voorbeeld", parentId: "voorbeeld-ouder" };

/** Een geldige node voor `tekenSymbool`: de standaard van het onderdeel met daarover de voorinstelling. */
export function voorbeeldNode(kaart: Kaart, voorinstelling: Voorinstelling): Node {
  const { onderdeel } = kaart;
  if (onderdeel === null) {
    const invoer = kaart.type === "automaat" ? NIEUWE_KRING_AUTOMAAT : { type: kaart.type };
    return { ...DUMMY, kinderen: [] as string[], parentId: kaart.type === "aansluiting" ? null : DUMMY.parentId, ...invoer } as Node;
  }
  const invoer: Record<string, unknown> = { ...STANDAARD[onderdeel] };
  for (const sleutel of VISUELE_VELDEN[onderdeel] ?? []) {
    if (voorinstelling[sleutel] !== undefined) invoer[sleutel] = voorinstelling[sleutel];
  }
  return { ...DUMMY, kinderen: [] as string[], ...invoer } as Node;
}

/** Kleine letters zonder accenten, zodat "Prisé" en "PRISE" hetzelfde zoeken. */
function normaliseer(tekst: string): string {
  return tekst.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * De kaarten waarvan `tekst(kaart)` (naam, uitleg en variantnamen, in de actieve taal) de zoekterm
 * bevat, zonder acht te slaan op hoofdletters en accenten. Een lege zoekterm geeft alle kaarten.
 */
export function zoekKaarten(kaarten: readonly Kaart[], zoek: string, tekst: (k: Kaart) => string): Kaart[] {
  const term = normaliseer(zoek).trim();
  if (term === "") return [...kaarten];
  return kaarten.filter((k) => normaliseer(tekst(k)).includes(term));
}

/** De waarde die een veld heeft zonder voorinstelling: die van `STANDAARD`, anders de eerste (lichtpunt: "standaard"). */
function standaardWaarde(kaart: Kaart, veld: Kaart["velden"][number]): boolean | string | undefined {
  const standaard = kaart.onderdeel === null ? undefined : (STANDAARD[kaart.onderdeel] as Record<string, unknown>);
  const waarde = standaard?.[veld.sleutel];
  return typeof waarde === "boolean" || typeof waarde === "string" ? waarde : veld.waarden[0];
}

/**
 * De volledige stand van de bediening voor een voorinstelling: elk veld van de kaart krijgt een
 * waarde (die van de voorinstelling, anders de standaard), plus het aantal als de kaart er een heeft.
 */
export function bediening(kaart: Kaart, voorinstelling: Voorinstelling): Voorinstelling {
  const stand: Record<string, unknown> = {};
  for (const veld of kaart.velden) stand[veld.sleutel] = voorinstelling[veld.sleutel] ?? standaardWaarde(kaart, veld);
  if (kaart.heeftAantal && kaart.onderdeel !== null) {
    const standaard = STANDAARD[kaart.onderdeel] as { aantal?: number };
    stand.aantal = voorinstelling.aantal ?? standaard.aantal ?? 1;
  }
  return stand as Voorinstelling;
}

/** De voorinstelling om te kiezen uit een stand van de bediening. Lichtpunt "standaard" is geen soort. */
export function naarVoorinstelling(kaart: Kaart, stand: Voorinstelling): Voorinstelling {
  const uit: Record<string, unknown> = {};
  for (const veld of kaart.velden) {
    const waarde = stand[veld.sleutel];
    if (waarde === undefined || (kaart.type === "lichtpunt" && veld.sleutel === "soort" && waarde === "standaard")) continue;
    uit[veld.sleutel] = waarde;
  }
  if (kaart.heeftAantal && stand.aantal !== undefined) uit.aantal = stand.aantal;
  return uit as Voorinstelling;
}

/** Of twee voorinstellingen dezelfde combinatie van het raster geven (het aantal telt niet mee). */
export function zelfdeCombinatie(kaart: Kaart, a: Voorinstelling, b: Voorinstelling): boolean {
  const x = bediening(kaart, a);
  const y = bediening(kaart, b);
  return kaart.velden.every((veld) => x[veld.sleutel] === y[veld.sleutel]);
}

/** Of een voorinstelling iets anders tekent dan de beginwaarde, het aantal inbegrepen. */
export function wijktAf(kaart: Kaart, voorinstelling: Voorinstelling, begin: Voorinstelling): boolean {
  return (
    !zelfdeCombinatie(kaart, voorinstelling, begin) ||
    bediening(kaart, voorinstelling).aantal !== bediening(kaart, begin).aantal
  );
}

/** Een deel van de korte naam van een combinatie: de soort, of een ja/nee-veld dat aan staat. */
export type NaamDeel = { soort: string } | { veld: "randaarde" | "kinderbeveiliging" | "waterdicht" };

/** De delen van de korte naam (bv. "randaarde, kinderbeveiliging"), in de volgorde van de velden. */
export function aanDelen(kaart: Kaart, voorinstelling: Voorinstelling): NaamDeel[] {
  const stand = bediening(kaart, voorinstelling);
  return kaart.velden.flatMap((veld): NaamDeel[] => {
    if (veld.sleutel === "soort") return [{ soort: String(stand.soort) }];
    return stand[veld.sleutel] === true ? [{ veld: veld.sleutel }] : [];
  });
}
