import { DocumentFout } from "./fouten";
import { nieuwDocument } from "./document";
import { voegToe, type NodeInvoer } from "./operaties";
import type { InstallatieDocument, Polen, Stroomtype } from "./schema";
import type { Sjabloon, SjabloonNode } from "./sjablonen";

/** De onderdelen in het paneel "Onderdelen" van de editor. */
export type Onderdeel =
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
}): InstallatieDocument {
  const basis = nieuwDocument(opties);
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

const contactdoos = (ruimte?: "badkamer"): NodeInvoer => ({
  ...STANDAARD.contactdoos,
  ...(ruimte ? { ruimte } : {}),
});
const lichtpunt = (): NodeInvoer => ({ ...STANDAARD.lichtpunt });
const leiding = (doorsnede_mm2: number, aantalGeleiders = 3): NodeInvoer => ({
  type: "leiding",
  kabeltype: "XVB",
  doorsnede_mm2,
  aantalGeleiders,
});

function kookplaat(polen: 2 | 4, aantalGeleiders: 3 | 5): Sjabloon {
  return {
    id: "kookplaat",
    naam: "Kookplaat",
    boom: keten(
      { type: "automaat", nominaal_A: 32, curve: "B", polen },
      leiding(6, aantalGeleiders),
      { type: "toestel", soort: "kookplaat", ruimte: "keuken" },
    ),
  };
}

/**
 * De sjablonen uit spec §4.7.1. De waarden passen binnen de voorlopige
 * AREI-parameters en moeten nog mee nagekeken worden. De kookplaat hier is de
 * variant voor 2x230V en 3x230V; `sjabloonVoor` geeft die voor 3N400V.
 */
export const SJABLONEN: readonly Sjabloon[] = [
  {
    id: "kring-stopcontacten",
    naam: "Kring stopcontacten",
    boom: keten(
      { type: "automaat", nominaal_A: 20, curve: "B", polen: 2 },
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
    boom: keten(
      { type: "automaat", nominaal_A: 16, curve: "B", polen: 2 },
      leiding(1.5),
      STANDAARD.schakelaar,
      lichtpunt(),
      lichtpunt(),
      lichtpunt(),
      lichtpunt(),
    ),
  },
  kookplaat(2, 3),
  {
    // Ruling E5: de wasmachine heeft een eigen differentieel van 30 mA. Zonder
    // dat meldt AREI-regel 2 (aardlekbeveiliging 30 mA) een fout op een gewoon
    // bord met alleen het algemene differentieel van 300 mA.
    id: "wasmachine",
    naam: "Wasmachine",
    boom: keten(
      STANDAARD.differentieel,
      { type: "automaat", nominaal_A: 20, curve: "B", polen: 2 },
      leiding(2.5),
      { type: "toestel", soort: "wasmachine", ruimte: "wasplaats" },
    ),
  },
  {
    id: "badkamer",
    naam: "Badkamer",
    boom: keten(
      STANDAARD.differentieel,
      { type: "automaat", nominaal_A: 16, curve: "B", polen: 2 },
      leiding(2.5),
      contactdoos("badkamer"),
      contactdoos("badkamer"),
    ),
  },
];

/** Het sjabloon met de id, aangepast aan het stroomtype (kookplaat bij 3N400V: 4 polen, 5 geleiders). */
export function sjabloonVoor(id: string, stroomtype: Stroomtype): Sjabloon {
  if (id === "kookplaat" && stroomtype === "3N400V") return kookplaat(4, 5);
  const sjabloon = SJABLONEN.find((s) => s.id === id);
  if (!sjabloon) throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "onbekend sjabloon", id });
  return sjabloon;
}
