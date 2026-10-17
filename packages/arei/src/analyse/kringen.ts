import {
  BEVEILIGING_TYPES,
  PUNT_TYPES,
  type InstallatieDocument,
  type Node,
  type NodeId,
  type Ruimte,
} from "@elentrik/model";
import type { Analyse, Keten, Kring } from "./types";

/** Bijectief base-26: 0 → "A", 25 → "Z", 26 → "AA", 27 → "AB", … */
export function kringLetter(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError(`kringLetter: ongeldige index ${index}`);
  }
  let letters = "";
  let rest = index + 1;
  while (rest > 0) {
    const cijfer = (rest - 1) % 26;
    letters = String.fromCharCode(65 + cijfer) + letters;
    rest = (rest - 1 - cijfer) / 26;
  }
  return letters;
}

const isBeveiliging = (node: Node): boolean => (BEVEILIGING_TYPES as readonly string[]).includes(node.type);
const isPunt = (node: Node): boolean => (PUNT_TYPES as readonly string[]).includes(node.type);

/** Letterreeks van één bord; alle hoofdborden delen één reeks. */
type Reeks = { prefix: string; volgende: number };
type OpenKring = { kring: Kring; volgendPunt: number; ruimtes: Set<Ruimte> };

/**
 * Onveranderlijke lijst van differentieel-voorouders, dichtstbijzijnde eerst.
 * Een differentieel maakt één nieuwe cel boven de bestaande lijst; alle
 * nakomelingen delen die cel. De array wordt pas opgebouwd (en onthouden) als
 * een punt of kringbeveiliging erom vraagt.
 */
type DiffCel = { id: NodeId; volgende: DiffCel | null; array?: NodeId[] };

function alsArray(cel: DiffCel | null): NodeId[] {
  if (cel === null) return [];
  if (cel.array) return cel.array;
  const ids: NodeId[] = [];
  let huidig: DiffCel | null = cel;
  while (huidig !== null && !huidig.array) {
    ids.push(huidig.id);
    huidig = huidig.volgende;
  }
  const resultaat = huidig?.array ? ids.concat(huidig.array) : ids;
  cel.array = resultaat;
  return resultaat;
}

type Kader = {
  id: NodeId;
  /** Dichtstbijzijnde verdeelbord erboven en de reeks waarin zijn kringen tellen. */
  bord: { id: NodeId; reeks: Reeks } | null;
  /** Dichtstbijzijnde kringbeveiliging (de node zelf of een voorouder). */
  kring: OpenKring | null;
  /** Dichtstbijzijnde `leiding` erboven. */
  leidingId: NodeId | null;
  /** Dichtstbijzijnde `automaat` of `zekering` erboven, ook zonder verdeelbord. */
  beveiligingId: NodeId | null;
  differentielen: DiffCel | null;
};

/**
 * Leidt de volledige analyse af in één pre-order doorgang (diepte eerst, in de
 * volgorde van `kinderen`), iteratief met een expliciete stapel zodat diepe
 * ketens geen RangeError geven. De voorouderinformatie voor de ketens reist
 * mee op de stapelframes, zodat de doorgang O(n) blijft. Een node die al
 * bezocht werd of niet bestaat, wordt overgeslagen, zodat ook een structureel
 * ongeldig document eindigt.
 *
 * - Een `automaat` of `zekering` met een `verdeelbord` als voorouder start een
 *   kring; alle nakomelingen tot de volgende beveiliging horen erbij.
 * - Elke kring telt in de reeks van zijn dichtstbijzijnde verdeelbord. Alle
 *   hoofdborden (zonder kring erboven) delen één reeks zonder prefix; een
 *   onderbord krijgt een eigen reeks met prefix `${naam of kringlabel}.`.
 * - Punten krijgen per kring een nummer vanaf 1: `${kringLabel}${n}`.
 * - Punten onder dezelfde dichtstbijzijnde differentieel delen dezelfde
 *   `Keten.differentielen`-array; die mag niet gemuteerd worden.
 */
export function leidAnalyseAf(doc: InstallatieDocument): Analyse {
  const kringen: Kring[] = [];
  const kringVanNode: Record<NodeId, NodeId> = {};
  const puntLabels: Record<NodeId, string> = {};
  const ketens: Record<NodeId, Keten> = {};
  const zonderKring: NodeId[] = [];
  const puntenInVolgorde: NodeId[] = [];
  /** Per kring (in volgorde van `kringen`): de differentielen boven de beveiliging, dichtstbijzijnde eerst. */
  const differentielenBovenKring: NodeId[][] = [];
  let tellerId: NodeId | null = null;

  const hoofdReeks: Reeks = { prefix: "", volgende: 0 };
  const bezocht = new Set<NodeId>();
  const stapel: Kader[] = [
    { id: doc.rootId, bord: null, kring: null, leidingId: null, beveiligingId: null, differentielen: null },
  ];

  while (stapel.length > 0) {
    const frame = stapel.pop()!;
    const { id, bord: bordBoven, kring: kringBoven } = frame;
    if (bezocht.has(id) || !Object.hasOwn(doc.nodes, id)) continue;
    bezocht.add(id);
    const node = doc.nodes[id]!;

    let bord = bordBoven;
    let kring = kringBoven;
    let leidingId = frame.leidingId;
    let beveiligingId = frame.beveiligingId;
    let differentielen = frame.differentielen;

    if (node.type === "teller") {
      tellerId ??= id;
    } else if (node.type === "differentieel") {
      differentielen = { id, volgende: frame.differentielen };
    } else if (node.type === "leiding") {
      leidingId = id;
    } else if (isBeveiliging(node)) {
      beveiligingId = id;
    }

    if (node.type === "verdeelbord") {
      // Een naam van alleen witruimte telt als leeg.
      const eigenNaam = node.naam?.trim();
      const reeks: Reeks = kringBoven
        ? { prefix: `${eigenNaam || kringBoven.kring.label}.`, volgende: 0 }
        : hoofdReeks;
      bord = { id, reeks };
    } else if (bordBoven && isBeveiliging(node)) {
      const nieuw: Kring = {
        id,
        label: bordBoven.reeks.prefix + kringLetter(bordBoven.reeks.volgende++),
        beveiligingId: id,
        verdeelbordId: bordBoven.id,
        puntIds: [],
        leidingIds: [],
        tellingen: { contactdozen: 0, lichtpunten: 0, schakelaars: 0, toestellen: 0 },
        ruimtes: [],
        minDoorsnede_mm2: null,
      };
      kringen.push(nieuw);
      differentielenBovenKring.push(alsArray(differentielen));
      kring = { kring: nieuw, volgendPunt: 1, ruimtes: new Set() };
    }

    if (kring) {
      kringVanNode[id] = kring.kring.id;
      if (node.type === "leiding") kring.kring.leidingIds.push(id);
    }
    if (isPunt(node)) {
      puntenInVolgorde.push(id);
      ketens[id] = { leidingId, beveiligingId, differentielen: alsArray(differentielen) };
      if (kring) {
        kring.kring.puntIds.push(id);
        puntLabels[id] = `${kring.kring.label}${kring.volgendPunt++}`;
        if (node.ruimte !== undefined && !kring.ruimtes.has(node.ruimte)) {
          kring.ruimtes.add(node.ruimte);
          kring.kring.ruimtes.push(node.ruimte);
        }
        const tellingen = kring.kring.tellingen;
        if (node.type === "contactdoos") tellingen.contactdozen += node.aantal;
        else if (node.type === "lichtpunt") tellingen.lichtpunten += node.aantal;
        else if (node.type === "schakelaar") tellingen.schakelaars++;
        else if (node.type === "toestel") tellingen.toestellen++;
      } else {
        zonderKring.push(id);
      }
    }

    for (let i = node.kinderen.length - 1; i >= 0; i--) {
      stapel.push({ id: node.kinderen[i]!, bord, kring, leidingId, beveiligingId, differentielen });
    }
  }

  for (const kring of kringen) {
    let min: number | null = null;
    for (const leidingId of kring.leidingIds) {
      const node = doc.nodes[leidingId]!;
      // 0 betekent "niet ingevuld".
      if (node.type === "leiding" && node.doorsnede_mm2 > 0 && (min === null || node.doorsnede_mm2 < min)) {
        min = node.doorsnede_mm2;
      }
    }
    kring.minDoorsnede_mm2 = min;
  }

  const geplaatst = new Set<NodeId>();
  for (const pagina of doc.situatie.paginas) {
    for (const plaatsing of pagina.plaatsingen) geplaatst.add(plaatsing.nodeId);
  }

  return {
    kringen,
    kringVanNode,
    puntLabels,
    ketens,
    zonderKring,
    tellerId,
    algemeenDifferentieelId: vindAlgemeenDifferentieel(differentielenBovenKring),
    nietGeplaatst: puntenInVolgorde.filter((id) => !geplaatst.has(id)),
  };
}

/**
 * De differentielen boven een node vormen een stuk van het pad vanaf de root;
 * de gedeelde differentielen van alle kringen zijn dus het gemeenschappelijke
 * begin van die paden. De eerste in pre-order is de buitenste, dus het laatste
 * element van elke lijst (die begint bij de dichtstbijzijnde).
 */
function vindAlgemeenDifferentieel(lijsten: NodeId[][]): NodeId | null {
  const eerste = lijsten[0];
  if (eerste === undefined) return null;
  let gedeeld = eerste.length;
  for (const lijst of lijsten) {
    let i = 0;
    const max = Math.min(gedeeld, lijst.length);
    while (i < max && lijst[lijst.length - 1 - i] === eerste[eerste.length - 1 - i]) i++;
    gedeeld = i;
    if (gedeeld === 0) return null;
  }
  return eerste[eerste.length - 1] ?? null;
}
