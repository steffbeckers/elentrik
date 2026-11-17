// Pure afleiding van het bordoverzicht uit het document; expliciete imports (ruling E1).
import type { Analyse } from "@elentrik/arei";
import { MAX_KRINGEN_PER_DIFFERENTIEEL, type InstallatieDocument, type Node, type NodeId, type NodeVan, type Stroomtype } from "@elentrik/model";
import { differentieelPlaatsen } from "./differentieelnaam";

/** Een rij van een verdeelkast telt 18 modules. */
export const MODULES_PER_RIJ = 18;
/** De ruimte die het voorstel voor de kast vrijhoudt, in procent van de bezette modules. */
const RESERVE_PROCENT = 20;
// `MAX_KRINGEN_PER_DIFFERENTIEEL` (model): hoogstens zoveel kringen achter een differentieel van
// hoogstens `GEVOELIG_MAX_mA` dat niet het algemene is. Dezelfde werkhypothese als de AREI-controle;
// het overzicht kleurt alleen, de bevinding zelf komt uit @elentrik/arei.
export { MAX_KRINGEN_PER_DIFFERENTIEEL };
const GEVOELIG_MAX_mA = 30;

/**
 * Het aantal polen van een zekering: dat van het stroomtype, want het model kent geen polen per
 * zekering. Gelijk aan `polenPerStroomtype` in de parameters van @elentrik/arei.
 */
const POLEN_PER_STROOMTYPE: Readonly<Record<Stroomtype, number>> = { "2x230V": 2, "3x230V": 3, "3N400V": 4 };

/** De bezetting van één differentieel in een bord. */
export type BordDifferentieel = {
  nodeId: NodeId;
  /** Zijn plaats (vanaf 1) zoals `differentieelPlaatsen` ze telt, voor `differentieelNaam`. */
  plaats: number;
  gevoeligheid_mA: number;
  /** Het algemene differentieel van de installatie. */
  algemeen: boolean;
  /** De kringen waarvan dit het dichtstbijzijnde differentieel boven de beveiliging is. */
  kringen: number;
  /** De contactdoos-onderdelen van die kringen; een meervoudige contactdoos telt als één. */
  contactdozen: number;
  /** Meer dan `MAX_KRINGEN_PER_DIFFERENTIEEL` kringen achter een differentieel van hoogstens 30 mA dat niet het algemene is. */
  teVeelKringen: boolean;
};

/** Eén verdeelbord in het overzicht. Indicatief: een hulp bij het kiezen van de kast, geen berekening. */
export type BordOverzicht = {
  bordId: NodeId;
  /** De eigen naam van het bord, of "" als het er geen heeft. */
  naam: string;
  /** De plaats van het bord (vanaf 1) onder alle borden, in pre-order; voor een naamloos bord. */
  volgnummer: number;
  kringen: number;
  /** DIN-modules: één per pool van elke automaat, zekering en differentieel van dit bord. */
  modules: number;
  /** Het voorstel voor de kast: zoveel rijen van `MODULES_PER_RIJ` modules, met ongeveer 20 % reserve. */
  rijen: number;
  /** `rijen` × `MODULES_PER_RIJ`. */
  plaatsen: number;
  differentielen: BordDifferentieel[];
};

type Toestel = NodeVan<"automaat"> | NodeVan<"zekering"> | NodeVan<"differentieel">;

function isToestel(node: Node): node is Toestel {
  return node.type === "automaat" || node.type === "zekering" || node.type === "differentieel";
}

/** Het dichtstbijzijnde differentieel boven een node (de node zelf telt niet). */
function differentieelBoven(doc: InstallatieDocument, id: NodeId): NodeId | undefined {
  const gezien = new Set<NodeId>([id]);
  let ouder = doc.nodes[id]?.parentId;
  while (ouder !== null && ouder !== undefined && !gezien.has(ouder) && Object.hasOwn(doc.nodes, ouder)) {
    gezien.add(ouder);
    const node = doc.nodes[ouder]!;
    if (node.type === "differentieel") return node.id;
    ouder = node.parentId;
  }
  return undefined;
}

const GEEN_TOESTELLEN: readonly Toestel[] = [];

/**
 * Het overzicht per verdeelbord, in pre-order: het aantal kringen, de modules, een voorstel voor
 * de kast en de bezetting van elk differentieel.
 *
 * - Een automaat, zekering of differentieel hoort bij het dichtstbijzijnde bord erboven. Staat er
 *   geen bord boven (het algemene differentieel vóór het hoofdbord), dan telt het bij het eerste
 *   bord eronder.
 * - Een kring telt bij het bord van zijn beveiliging (`Kring.verdeelbordId`) en bij het
 *   dichtstbijzijnde differentieel boven die beveiliging. Een kring zonder differentieel telt
 *   alleen bij het bord.
 * - De kast: de modules plus 20 % reserve, naar boven afgerond op hele rijen van 18 modules.
 *
 * Een node die al bezocht werd of niet bestaat, wordt overgeslagen, zodat ook een structureel
 * ongeldig document eindigt.
 */
export function bordOverzicht(doc: InstallatieDocument, analyse: Analyse): BordOverzicht[] {
  const borden: BordOverzicht[] = [];
  const bordVanId = new Map<NodeId, BordOverzicht>();
  const differentieelVanId = new Map<NodeId, BordDifferentieel>();
  const differentieelIds: NodeId[] = [];
  const toegewezen = new Set<NodeId>();

  function wijsToe(toestel: Toestel, bord: BordOverzicht): void {
    if (toegewezen.has(toestel.id)) return;
    toegewezen.add(toestel.id);
    bord.modules += toestel.type === "zekering" ? POLEN_PER_STROOMTYPE[doc.voeding.stroomtype] : toestel.polen;
    if (toestel.type !== "differentieel") return;
    const algemeen = toestel.id === analyse.algemeenDifferentieelId;
    const differentieel: BordDifferentieel = {
      nodeId: toestel.id, plaats: 1, gevoeligheid_mA: toestel.gevoeligheid_mA, algemeen, kringen: 0, contactdozen: 0, teVeelKringen: false,
    };
    bord.differentielen.push(differentieel);
    differentieelVanId.set(toestel.id, differentieel);
  }

  /** `voorBord`: de toestellen op het pad die nog geen bord boven zich hebben. */
  type Kader = { id: NodeId; bord: BordOverzicht | null; voorBord: readonly Toestel[] };
  const stapel: Kader[] = [{ id: doc.rootId, bord: null, voorBord: GEEN_TOESTELLEN }];
  const bezocht = new Set<NodeId>();
  while (stapel.length > 0) {
    const kader = stapel.pop()!;
    if (bezocht.has(kader.id) || !Object.hasOwn(doc.nodes, kader.id)) continue;
    bezocht.add(kader.id);
    const node = doc.nodes[kader.id]!;
    let { bord, voorBord } = kader;
    if (node.type === "verdeelbord") {
      bord = {
        bordId: node.id, naam: node.naam?.trim() ?? "", volgnummer: borden.length + 1,
        kringen: 0, modules: 0, rijen: 0, plaatsen: 0, differentielen: [],
      };
      borden.push(bord);
      bordVanId.set(node.id, bord);
      for (const toestel of voorBord) wijsToe(toestel, bord);
      voorBord = GEEN_TOESTELLEN;
    } else if (isToestel(node)) {
      if (node.type === "differentieel") differentieelIds.push(node.id);
      if (bord) wijsToe(node, bord);
      else voorBord = [...voorBord, node];
    }
    for (let i = node.kinderen.length - 1; i >= 0; i--) stapel.push({ id: node.kinderen[i]!, bord, voorBord });
  }

  for (const kring of analyse.kringen) {
    const bord = bordVanId.get(kring.verdeelbordId);
    if (bord) bord.kringen++;
    const differentieelId = differentieelBoven(doc, kring.beveiligingId);
    const differentieel = differentieelId === undefined ? undefined : differentieelVanId.get(differentieelId);
    if (!differentieel) continue;
    differentieel.kringen++;
    for (const puntId of kring.puntIds) if (doc.nodes[puntId]?.type === "contactdoos") differentieel.contactdozen++;
  }

  const plaatsen = differentieelPlaatsen(doc, differentieelIds);
  for (const bord of borden) {
    // In gehele getallen: 15 modules met 20 % reserve vullen precies één rij.
    bord.rijen = Math.ceil((bord.modules * (100 + RESERVE_PROCENT)) / (100 * MODULES_PER_RIJ));
    bord.plaatsen = bord.rijen * MODULES_PER_RIJ;
    for (const differentieel of bord.differentielen) {
      differentieel.plaats = plaatsen.get(differentieel.nodeId) ?? 1;
      differentieel.teVeelKringen =
        !differentieel.algemeen && differentieel.gevoeligheid_mA <= GEVOELIG_MAX_mA && differentieel.kringen > MAX_KRINGEN_PER_DIFFERENTIEEL;
    }
  }
  return borden;
}
