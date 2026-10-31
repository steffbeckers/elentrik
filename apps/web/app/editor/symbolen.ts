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
const DUMMY = { id: "voorbeeld", parentId: "voorbeeld-ouder", kinderen: [] as string[] };

/** Een geldige node voor `tekenSymbool`: de standaard van het onderdeel met daarover de voorinstelling. */
export function voorbeeldNode(kaart: Kaart, voorinstelling: Voorinstelling): Node {
  const { onderdeel } = kaart;
  if (onderdeel === null) {
    const invoer = kaart.type === "automaat" ? NIEUWE_KRING_AUTOMAAT : { type: kaart.type };
    return { ...DUMMY, parentId: kaart.type === "aansluiting" ? null : DUMMY.parentId, ...invoer } as Node;
  }
  const invoer: Record<string, unknown> = { ...STANDAARD[onderdeel] };
  for (const sleutel of VISUELE_VELDEN[onderdeel] ?? []) {
    if (voorinstelling[sleutel] !== undefined) invoer[sleutel] = voorinstelling[sleutel];
  }
  return { ...DUMMY, ...invoer } as Node;
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
