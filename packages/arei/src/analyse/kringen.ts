import { BEVEILIGING_TYPES, PUNT_TYPES, type InstallatieDocument, type Node, type NodeId } from "@elentrik/model";
import type { Analyse, Kring } from "./types";

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
type OpenKring = { kring: Kring; volgendPunt: number };
type Kader = {
  id: NodeId;
  /** Dichtstbijzijnde verdeelbord erboven en de reeks waarin zijn kringen tellen. */
  bord: { id: NodeId; reeks: Reeks } | null;
  /** Dichtstbijzijnde kringbeveiliging (de node zelf of een voorouder). */
  kring: OpenKring | null;
};

export type KringAnalyse = Pick<Analyse, "kringen" | "kringVanNode" | "puntLabels" | "zonderKring">;

/**
 * Leidt de kringen af in één pre-order doorgang (diepte eerst, in de volgorde
 * van `kinderen`), iteratief met een expliciete stapel zodat diepe ketens geen
 * RangeError geven. Een node die al bezocht werd of niet bestaat, wordt
 * overgeslagen, zodat ook een structureel ongeldig document eindigt.
 *
 * - Een `automaat` of `zekering` met een `verdeelbord` als voorouder start een
 *   kring; alle nakomelingen tot de volgende beveiliging horen erbij.
 * - Elke kring telt in de reeks van zijn dichtstbijzijnde verdeelbord. Alle
 *   hoofdborden (zonder kring erboven) delen één reeks zonder prefix; een
 *   onderbord krijgt een eigen reeks met prefix `${naam of kringlabel}.`.
 * - Punten krijgen per kring een nummer vanaf 1: `${kringLabel}${n}`.
 */
export function leidKringenAf(doc: InstallatieDocument): KringAnalyse {
  const kringen: Kring[] = [];
  const kringVanNode: Record<NodeId, NodeId> = {};
  const puntLabels: Record<NodeId, string> = {};
  const zonderKring: NodeId[] = [];

  const hoofdReeks: Reeks = { prefix: "", volgende: 0 };
  const bezocht = new Set<NodeId>();
  const stapel: Kader[] = [{ id: doc.rootId, bord: null, kring: null }];

  while (stapel.length > 0) {
    const { id, bord: bordBoven, kring: kringBoven } = stapel.pop()!;
    if (bezocht.has(id) || !Object.hasOwn(doc.nodes, id)) continue;
    bezocht.add(id);
    const node = doc.nodes[id]!;

    let bord = bordBoven;
    let kring = kringBoven;
    if (node.type === "verdeelbord") {
      const reeks: Reeks = kringBoven
        ? { prefix: `${node.naam || kringBoven.kring.label}.`, volgende: 0 }
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
      kring = { kring: nieuw, volgendPunt: 1 };
    }

    if (kring) kringVanNode[id] = kring.kring.id;
    if (isPunt(node)) {
      if (kring) {
        kring.kring.puntIds.push(id);
        puntLabels[id] = `${kring.kring.label}${kring.volgendPunt++}`;
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
      stapel.push({ id: node.kinderen[i]!, bord, kring });
    }
  }

  return { kringen, kringVanNode, puntLabels, zonderKring };
}
