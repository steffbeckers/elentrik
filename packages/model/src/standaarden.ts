import { DocumentFout } from "./fouten";
import { nieuwDocument } from "./document";
import { vereis, voegToe, type NodeInvoer, type OperatieResultaat, type Patch } from "./operaties";
import type { InstallatieDocument, NodeId, NodeVan, Polen, Stroomtype, Taal, Toestelsoort } from "./schema";
import { isKringSjabloon, pasSjabloonToe, type Sjabloon, type SjabloonNode } from "./sjablonen";
import { PUNT_TYPES } from "./structuur";
import type { DifferentieelInstellingen } from "./toevoegen";

/** De onderdelen in het paneel "Onderdelen" van de editor. */
export type Onderdeel =
  | "aardelektrode"
  | "aardingsonderbreker"
  | "contactdoos"
  | "lichtpunt"
  | "schakelaar"
  | "toestel"
  | "leiding"
  | "differentieel"
  | "zekering"
  | "onderbord";

/** Standaardwaarden van een nieuw onderdeel (spec §4.3). Een onderbord is een verdeelbord zonder naam. */
export const STANDAARD: { [O in Onderdeel]: NodeInvoer } = {
  aardelektrode: { type: "aardelektrode" },
  aardingsonderbreker: { type: "aardingsonderbreker" },
  contactdoos: {
    type: "contactdoos",
    aantal: 1,
    randaarde: true,
    kinderbeveiliging: true,
    waterdicht: false,
  },
  lichtpunt: { type: "lichtpunt", aantal: 1 },
  schakelaar: { type: "schakelaar", soort: "enkel", waterdicht: false },
  toestel: { type: "toestel", soort: "andere" },
  leiding: { type: "leiding", kabeltype: "XVB", doorsnede_mm2: 2.5, aantalGeleiders: 3 },
  differentieel: {
    type: "differentieel",
    gevoeligheid_mA: 30,
    nominaal_A: 40,
    polen: 2,
    klasse: "A",
  },
  zekering: { type: "zekering", nominaal_A: 16 },
  onderbord: { type: "verdeelbord" },
};

/**
 * De doorsnede (mm²) van de leiding van een nieuwe kring, bepaald door het eerste
 * onderdeel: verlichting (lichtpunt, schakelaar) 1,5 mm², al het andere 2,5 mm².
 * Eén bron voor `voegOnderdeelToe` en de sjablonen.
 */
export function doorsnedeVoorKring(eerste: Onderdeel): number {
  return eerste === "lichtpunt" || eerste === "schakelaar" ? 1.5 : 2.5;
}

/** De leiding van een nieuwe kring die met dit onderdeel begint. */
export function kringLeiding(eerste: Onderdeel): NodeInvoer {
  return { type: "leiding", kabeltype: "XVB", doorsnede_mm2: doorsnedeVoorKring(eerste), aantalGeleiders: 3 };
}

/** De instelling die een nieuw punt meekrijgt, bovenop `STANDAARD` (spec §4.3). */
export type Voorinstelling = {
  aantal?: number;
  randaarde?: boolean;
  kinderbeveiliging?: boolean;
  waterdicht?: boolean;
  soort?: string;
};

/** Per onderdeel de sleutels die een voorinstelling mag zetten; andere onderdelen: geen. */
export const VISUELE_VELDEN: Readonly<
  Partial<Record<Onderdeel, readonly (keyof Voorinstelling)[]>>
> = {
  contactdoos: ["aantal", "randaarde", "kinderbeveiliging", "waterdicht"],
  lichtpunt: ["aantal", "soort"],
  schakelaar: ["soort", "waterdicht"],
  toestel: ["soort"],
};

/** De beveiliging van een nieuwe kring op een rail. */
export const NIEUWE_KRING_AUTOMAAT: NodeInvoer = {
  type: "automaat",
  nominaal_A: 16,
  curve: "B",
  polen: 2,
};

/**
 * Aantal polen van het algemeen differentieel per stroomtype (ruling E6). Dit moet
 * overeenkomen met `polenPerStroomtype` in de parameters van @elentrik/arei
 * (regel 7); model mag arei niet importeren, dus staat het hier apart.
 */
const POLEN_PER_STROOMTYPE: Readonly<Record<Stroomtype, Polen>> = {
  "2x230V": 2,
  "3x230V": 3,
  "3N400V": 4,
};

/**
 * Een nieuw project: aansluiting > teller > algemeen differentieel (300 mA, 40 A,
 * klasse A; 2, 3 of 4 polen bij 2x230V, 3x230V of 3N400V) > verdeelbord.
 */
export function nieuwProjectDocument(opties: {
  klantNaam: string;
  stroomtype: Stroomtype;
  datum?: string;
  dossierTaal?: Taal;
}): InstallatieDocument {
  const basis = nieuwDocument(opties);
  basis.meta.installatieContext = "onbekend";
  const tellerId = basis.nodes[basis.rootId]!.kinderen[0]!;
  const differentieel = voegToe(basis, tellerId, {
    type: "differentieel",
    gevoeligheid_mA: 300,
    nominaal_A: 40,
    polen: POLEN_PER_STROOMTYPE[opties.stroomtype],
    klasse: "A",
  });
  return voegToe(differentieel.doc, differentieel.id, { type: "verdeelbord" }).doc;
}

/** Bouwt een keten van boven naar onder: elke node is het enige kind van de vorige. */
export function keten(eerste: NodeInvoer, ...rest: NodeInvoer[]): SjabloonNode {
  const nodes = [eerste, ...rest];
  let onder: SjabloonNode | undefined;
  for (let i = nodes.length - 1; i >= 0; i--) {
    onder = onder
      ? ({ ...nodes[i]!, kinderen: [onder] } as SjabloonNode)
      : ({ ...nodes[i]! } as SjabloonNode);
  }
  return onder!;
}

const contactdoos = (extra?: Partial<Pick<NodeVan<"contactdoos">, "aantal" | "waterdicht">>): NodeInvoer => ({
  ...STANDAARD.contactdoos,
  ...extra,
});
const lichtpunt = (): NodeInvoer => ({ ...STANDAARD.lichtpunt });
const leiding = (doorsnede_mm2: number, aantalGeleiders = 3): NodeInvoer => ({
  type: "leiding",
  kabeltype: "XVB",
  doorsnede_mm2,
  aantalGeleiders,
});
const automaat = (nominaal_A: number, polen: Polen = 2, curve: "B" | "C" = "B"): NodeInvoer => ({
  type: "automaat",
  nominaal_A,
  curve,
  polen,
});

/** Eenfasig (2 polen, 3 geleiders) of driefasig met nulgeleider (4 polen, 5 geleiders, bij 3N400V). */
type Fasen = { polen: 2 | 4; aantalGeleiders: 3 | 5 };
const EEN_FASE: Fasen = { polen: 2, aantalGeleiders: 3 };
const DRIE_FASEN: Fasen = { polen: 4, aantalGeleiders: 5 };

/**
 * Een toestel op een eigen kring. Met `differentieel` begint het sjabloon met een eigen
 * differentieel; zonder mag de kring rechtstreeks onder het algemene differentieel.
 */
function toestelKring(
  id: string,
  naam: string,
  soort: Toestelsoort,
  kring: { nominaal_A: number; doorsnede_mm2: number; curve?: "B" | "C"; fasen?: Fasen; differentieel?: NodeInvoer },
): Sjabloon {
  const fasen = kring.fasen ?? EEN_FASE;
  const nodes: [NodeInvoer, ...NodeInvoer[]] = [
    automaat(kring.nominaal_A, fasen.polen, kring.curve),
    leiding(kring.doorsnede_mm2, fasen.aantalGeleiders),
    { type: "toestel", soort },
  ];
  return {
    id,
    naam,
    groep: "toestellen",
    boom: kring.differentieel ? keten(kring.differentieel, ...nodes) : keten(...nodes),
  };
}

function kookplaat(fasen: Fasen): Sjabloon {
  return toestelKring("kookplaat", "Kookplaat", "kookplaat", { nominaal_A: 32, doorsnede_mm2: 6, fasen });
}

/** Een compressor heeft een hoge aanloopstroom: curve C. */
function warmtepomp(fasen: Fasen): Sjabloon {
  return toestelKring("warmtepomp", "Warmtepomp", "warmtepomp", { nominaal_A: 20, doorsnede_mm2: 2.5, curve: "C", fasen });
}

/**
 * De laadpaal zit achter een eigen differentieel van 30 mA klasse B (gelijkstroomlek). Eenfasig
 * 32 A op 6 mm² (7,4 kW); bij 3N400V driefasig 16 A op 2,5 mm² (11 kW).
 */
function laadpaal(fasen: Fasen): Sjabloon {
  const driefasig = fasen.polen === 4;
  return {
    ...toestelKring("laadpaal", "Laadpaal", "laadpaal", {
      nominaal_A: driefasig ? 16 : 32,
      doorsnede_mm2: driefasig ? 2.5 : 6,
      curve: "C",
      fasen,
      differentieel: { ...STANDAARD.differentieel, polen: fasen.polen, klasse: "B" } as NodeInvoer,
    }),
    eigenDifferentieel: true,
  };
}

/**
 * De sjablonen (spec §4.7.1 en het ontwerp van de elektricienreview), in de volgorde van het
 * paneel: kringen, toestellen, installatie. De waarden zijn voorinstellingen; ze passen binnen de
 * voorlopige AREI-parameters en moeten nog mee nagekeken worden. Kookplaat, warmtepomp en laadpaal
 * staan hier in de variant voor 2x230V en 3x230V; `sjabloonVoor` geeft die voor 3N400V.
 */
export const SJABLONEN: readonly Sjabloon[] = [
  {
    id: "kring-stopcontacten",
    naam: "Kring stopcontacten",
    groep: "kringen",
    boom: keten(
      STANDAARD.differentieel,
      automaat(20),
      leiding(2.5),
      contactdoos(),
      contactdoos(),
      contactdoos(),
      contactdoos(),
      contactdoos(),
      contactdoos(),
    ),
  },
  {
    id: "kring-verlichting",
    naam: "Kring verlichting",
    groep: "kringen",
    boom: keten(
      STANDAARD.differentieel,
      automaat(16),
      leiding(doorsnedeVoorKring("schakelaar")),
      STANDAARD.schakelaar,
      lichtpunt(),
      lichtpunt(),
      lichtpunt(),
      lichtpunt(),
    ),
  },
  {
    // De contactdozen boven het werkblad: vier dubbele dozen op een eigen kring.
    id: "keuken",
    naam: "Keuken",
    groep: "kringen",
    ruimte: "keuken",
    boom: keten(
      STANDAARD.differentieel,
      automaat(20),
      leiding(2.5),
      contactdoos({ aantal: 2 }),
      contactdoos({ aantal: 2 }),
      contactdoos({ aantal: 2 }),
      contactdoos({ aantal: 2 }),
    ),
  },
  {
    id: "badkamer",
    naam: "Badkamer",
    groep: "kringen",
    ruimte: "badkamer",
    boom: keten(STANDAARD.differentieel, automaat(16), leiding(2.5), contactdoos(), contactdoos()),
  },
  {
    // Terras of tuin: waterdichte contactdozen en een lichtpunt op één kring van 2,5 mm².
    id: "buiten",
    naam: "Buiten",
    groep: "kringen",
    ruimte: "buiten",
    boom: keten(
      STANDAARD.differentieel,
      automaat(16),
      leiding(2.5),
      contactdoos({ waterdicht: true }),
      contactdoos({ waterdicht: true }),
      { ...STANDAARD.lichtpunt, soort: "wand" } as NodeInvoer,
    ),
  },
  kookplaat(EEN_FASE),
  toestelKring("oven", "Oven", "oven", { nominaal_A: 20, doorsnede_mm2: 2.5 }),
  // Ruling E5: vaatwasser, wasmachine en droogkast hebben een eigen differentieel van 30 mA.
  // Zonder dat meldt AREI-regel 2 (aardlekbeveiliging 30 mA) een fout op een gewoon bord met
  // alleen het algemene differentieel van 300 mA.
  toestelKring("vaatwasser", "Vaatwasser", "vaatwasser", { nominaal_A: 20, doorsnede_mm2: 2.5, differentieel: STANDAARD.differentieel }),
  toestelKring("wasmachine", "Wasmachine", "wasmachine", { nominaal_A: 20, doorsnede_mm2: 2.5, differentieel: STANDAARD.differentieel }),
  toestelKring("droogkast", "Droogkast", "droogkast", { nominaal_A: 20, doorsnede_mm2: 2.5, differentieel: STANDAARD.differentieel }),
  toestelKring("boiler", "Boiler", "boiler", { nominaal_A: 20, doorsnede_mm2: 2.5 }),
  warmtepomp(EEN_FASE),
  laadpaal(EEN_FASE),
  {
    // Een eenfasige omvormer tot 5 kVA: 25 A op 4 mm². De panelen hangen achter de DC-leiding.
    id: "zonnepanelen",
    naam: "Zonnepanelen",
    groep: "toestellen",
    boom: keten(
      automaat(25),
      leiding(4),
      { type: "toestel", soort: "omvormer" },
      { type: "leiding", kabeltype: "H1Z2Z2-K", doorsnede_mm2: 6, aantalGeleiders: 2, metBeschermingsgeleider: false },
      { type: "toestel", soort: "pvPaneel" },
    ),
  },
  {
    id: "aarding",
    naam: "Aarding",
    groep: "installatie",
    boom: keten(STANDAARD.aardingsonderbreker, STANDAARD.aardelektrode),
  },
];

/** De sjablonen met een eigen variant bij 3N400V: 4 polen en 5 geleiders. */
const DRIEFASIG: Readonly<Record<string, (fasen: Fasen) => Sjabloon>> = { kookplaat, warmtepomp, laadpaal };

/** Het sjabloon met de id, aangepast aan het stroomtype (kookplaat, warmtepomp en laadpaal bij 3N400V: 4 polen, 5 geleiders). */
export function sjabloonVoor(id: string, stroomtype: Stroomtype): Sjabloon {
  if (stroomtype === "3N400V" && Object.hasOwn(DRIEFASIG, id)) return DRIEFASIG[id]!(DRIE_FASEN);
  const sjabloon = SJABLONEN.find((s) => s.id === id);
  if (!sjabloon) throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "onbekend sjabloon", id });
  return sjabloon;
}

/**
 * De instellingen van het differentieel waarmee een sjabloon begint, of undefined als het er geen
 * heeft. De editor gebruikt ze als voorinstelling voor een nieuw differentieel, zodat de laadpaal
 * zijn klasse B houdt.
 */
export function sjabloonDifferentieel(sjabloon: Sjabloon): DifferentieelInstellingen | undefined {
  const boom = sjabloon.boom;
  if (boom.type !== "differentieel") return undefined;
  return { gevoeligheid_mA: boom.gevoeligheid_mA, nominaal_A: boom.nominaal_A, polen: boom.polen, klasse: boom.klasse };
}

function nietToegelaten(reden: string, details?: object): DocumentFout {
  return new DocumentFout("NIET_TOEGELATEN_KIND", { reden, ...details });
}

/**
 * Zet een sjabloon dat geen kring is (de aarding) rechtstreeks op een verdeelbord, als één
 * operatie. Een kring gaat via `voegSjabloonToe`, met de keuze van het differentieel.
 */
export function voegBordSjabloonToe(
  doc: InstallatieDocument,
  bordId: NodeId,
  sjabloonId: string,
): OperatieResultaat & { id: NodeId } {
  const bord = vereis(doc, bordId);
  const sjabloon = sjabloonVoor(sjabloonId, doc.voeding.stroomtype);
  if (bord.type !== "verdeelbord") throw nietToegelaten("geen verdeelbord", { nodeId: bordId, type: bord.type });
  if (isKringSjabloon(sjabloon)) throw nietToegelaten("een kring vraagt een sjabloonbestemming", { sjabloonId });
  return pasSjabloonToe(doc, bordId, sjabloon);
}

/** Het hoogste aantal kringen achter één differentieel van maximaal 30 mA (AREI Boek 1, 4.2.4.3, sinds 1 juni 2023). */
export const MAX_KRINGEN_PER_DIFFERENTIEEL = 8;

const PUNTEN: ReadonlySet<string> = new Set(PUNT_TYPES);

/** De kring van een sjabloon (zonder zijn eigen differentieel), met de voorgestelde ruimte op de punten. */
function kringVan(sjabloon: Sjabloon): SjabloonNode {
  const kring = sjabloon.boom.type === "differentieel" ? sjabloon.boom.kinderen?.[0] : sjabloon.boom;
  if (!kring) throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "sjabloon zonder kring", id: sjabloon.id });
  const ruimte = sjabloon.ruimte;
  if (ruimte === undefined) return kring;
  const metRuimte = (node: SjabloonNode): SjabloonNode => {
    const { kinderen, ...eigen } = node;
    const nieuw = (PUNTEN.has(eigen.type) ? { ...eigen, ruimte } : eigen) as SjabloonNode;
    return kinderen ? ({ ...nieuw, kinderen: kinderen.map(metRuimte) } as SjabloonNode) : nieuw;
  };
  return metRuimte(kring);
}

/** De kringen van de startwoning achter elk differentieel van 30 mA, en die rechtstreeks op het bord. */
const STARTWONING = {
  differentielen: [
    ["kring-verlichting", "kring-verlichting", "kring-stopcontacten", "kring-stopcontacten", "keuken"],
    ["badkamer", "wasmachine", "droogkast", "vaatwasser"],
  ],
  opBord: ["kookplaat", "oven"],
} as const;

/** Het eerste verdeelbord in pre-order: het hoofdbord. */
function hoofdbord(doc: InstallatieDocument): NodeId | undefined {
  const stapel: NodeId[] = [doc.rootId];
  const gezien = new Set<NodeId>();
  while (stapel.length > 0) {
    const id = stapel.pop()!;
    if (gezien.has(id) || !Object.hasOwn(doc.nodes, id)) continue;
    gezien.add(id);
    const node = doc.nodes[id]!;
    if (node.type === "verdeelbord") return id;
    for (let i = node.kinderen.length - 1; i >= 0; i--) stapel.push(node.kinderen[i]!);
  }
  return undefined;
}

/**
 * Zet een gewone woning op het hoofdbord, als één operatie (één undo-stap): de aarding; een
 * differentieel van 30 mA met twee kringen verlichting, twee kringen contactdozen en de keuken;
 * een tweede van 30 mA met badkamer, wasmachine, droogkast en vaatwasser; kookplaat en oven
 * rechtstreeks op het bord. Achter elk differentieel blijven er hoogstens
 * `MAX_KRINGEN_PER_DIFFERENTIEEL` kringen. De differentiëlen krijgen de polen van het stroomtype,
 * zoals een nieuw differentieel in de editor. Staat er al een aarding, dan komt er geen tweede.
 *
 * Alleen in een document zonder kringen: anders gooit dit `NIET_TOEGELATEN_KIND`, net als zonder
 * verdeelbord. `bordId` is het bord dat de woning kreeg.
 */
export function startWoning(doc: InstallatieDocument): OperatieResultaat & { bordId: NodeId } {
  const nodes = Object.values(doc.nodes);
  if (nodes.some((node) => node.type === "automaat" || node.type === "zekering")) {
    throw nietToegelaten("de startwoning kan alleen in een schema zonder kringen");
  }
  const bordId = hoofdbord(doc);
  if (bordId === undefined) throw nietToegelaten("geen verdeelbord");

  const stroomtype = doc.voeding.stroomtype;
  const kring = (id: string): SjabloonNode => kringVan(sjabloonVoor(id, stroomtype));
  const differentieel = { ...STANDAARD.differentieel, polen: POLEN_PER_STROOMTYPE[stroomtype] };
  const bomen: SjabloonNode[] = [
    ...STARTWONING.differentielen.map((kringen) => ({ ...differentieel, kinderen: kringen.map(kring) }) as SjabloonNode),
    ...STARTWONING.opBord.map(kring),
  ];
  const heeftAarding = nodes.some((node) => node.type === "aardingsonderbreker" || node.type === "aardelektrode");

  let huidig = doc;
  const patches: Patch[] = [];
  const inversePatches: Patch[] = [];
  const pasToe = (boom: SjabloonNode, index?: number): void => {
    const r = pasSjabloonToe(huidig, bordId, { id: "startwoning", naam: "Startwoning", boom }, index);
    huidig = r.doc;
    patches.push(...r.patches);
    // De omgekeerde patches lopen van de laatste stap terug naar de eerste.
    inversePatches.unshift(...r.inversePatches);
  };
  // De aarding staat vooraan op het bord; de kringen volgen in de volgorde van de kringcodes.
  if (!heeftAarding) pasToe(sjabloonVoor("aarding", stroomtype).boom, 0);
  for (const boom of bomen) pasToe(boom);
  return { doc: huidig, patches, inversePatches, bordId };
}
