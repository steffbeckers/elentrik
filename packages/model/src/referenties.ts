import { DocumentFout } from "./fouten";
import { resultaat, type OperatieResultaat } from "./operaties";
import type { InstallatieDocument, NodeId } from "./schema";
import { pasSjabloonToe, type SjabloonNode } from "./sjablonen";

/** Bijectief base-26; gedeeld door modelcommando's en analyse. */
export function kringLetter(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new RangeError(`kringLetter: ongeldige index ${index}`);
  let n = index + 1,
    tekst = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    tekst = String.fromCharCode(65 + r) + tekst;
    n = (n - 1 - r) / 26;
  }
  return tekst;
}
/** Nummerreeksen volgen de analyse: hoofdborden delen een reeks, onderborden een eigen reeks. */
function nummerReeksen(doc: InstallatieDocument) {
  const hoofdReeks = Symbol("hoofd");
  const groepen = new Map<string | symbol, NodeId[]>();
  const kringIds = new Set<NodeId>();
  const gezien = new Set<NodeId>();
  const stapel: { id: NodeId; reeks: string | symbol; bord: boolean; kring: boolean }[] = [
    { id: doc.rootId, reeks: hoofdReeks, bord: false, kring: false },
  ];
  while (stapel.length) {
    let { id, reeks, bord, kring } = stapel.pop()!;
    if (gezien.has(id)) continue;
    gezien.add(id);
    if (!Object.hasOwn(doc.nodes, id)) continue;
    const node = doc.nodes[id]!;
    if (node.type === "verdeelbord") {
      if (kring) reeks = id;
      bord = true;
    }
    if (bord && (node.type === "automaat" || node.type === "zekering")) {
      kringIds.add(id);
      kring = true;
    }
    if (node.type === "differentieel" || kringIds.has(id)) {
      const lijst = groepen.get(reeks) ?? [];
      lijst.push(id);
      groepen.set(reeks, lijst);
    }
    for (let i = node.kinderen.length - 1; i >= 0; i--)
      stapel.push({ id: node.kinderen[i]!, reeks, bord, kring });
  }
  return { groepen, kringIds };
}
/** Reserveert alle vaste codes vóór de eerste automatische toekenning. */
export function bepaalKringCodes(
  doc: InstallatieDocument,
  negeerVasteCodes = false,
): Record<NodeId, string> {
  const { groepen, kringIds } = nummerReeksen(doc);
  const codes: Record<NodeId, string> = Object.create(null);
  for (const ids of groepen.values()) {
    const bezet = new Map<string, NodeId>();
    for (const id of ids) {
      const n = doc.nodes[id]!;
      const code =
        n.type === "differentieel"
          ? n.referentie
          : !negeerVasteCodes &&
              (n.type === "automaat" || n.type === "zekering")
            ? n.kringCode
            : undefined;
      if (!code) continue;
      const ander = bezet.get(code);
      if (ander !== undefined)
        throw new DocumentFout("ONGELDIG_SCHEMA", {
          reden: "dubbele referentie",
          code,
          nodeIds: [ander, id],
        });
      bezet.set(code, id);
      if (kringIds.has(id)) codes[id] = code;
    }
    let volgende = 0;
    for (const id of ids) {
      if (!kringIds.has(id) || codes[id]) continue;
      let code: string;
      do {
        code = kringLetter(volgende++);
      } while (bezet.has(code));
      codes[id] = code;
      bezet.set(code, id);
    }
  }
  return codes;
}
export function legKringCodesVast(doc: InstallatieDocument): OperatieResultaat {
  const codes = bepaalKringCodes(doc);
  return resultaat(doc, (d) => {
    for (const [id, code] of Object.entries(codes)) {
      const n = d.nodes[id]!;
      if (n.type === "automaat" || n.type === "zekering") n.kringCode = code;
    }
  });
}
/**
 * Houdt bestaande kringcodes stabiel na een toevoegende operatie: elke kring die in `voor` en `na`
 * bestaat en in `na` geen vaste code heeft, krijgt de code die hij in `voor` had. Verschuift er
 * niets, dan blijft `na` ongewijzigd.
 */
export function behoudKringCodes(
  voor: InstallatieDocument,
  na: InstallatieDocument,
): OperatieResultaat {
  const oud = bepaalKringCodes(voor);
  const nu = bepaalKringCodes(na);
  // Schuift er geen enkele code op, dan is vastleggen overbodig en blijft het document ongewijzigd.
  const verschoven = Object.entries(oud).some(
    ([id, code]) => Object.hasOwn(nu, id) && nu[id] !== code,
  );
  return resultaat(na, (d) => {
    if (!verschoven) return;
    for (const [id, code] of Object.entries(oud)) {
      if (!Object.hasOwn(d.nodes, id)) continue;
      const n = d.nodes[id]!;
      if ((n.type === "automaat" || n.type === "zekering") && !n.kringCode)
        n.kringCode = code;
    }
  });
}
export type Hernummering = { nodeId: NodeId; oud: string; nieuw: string };
export function voorbeeldHernummering(
  doc: InstallatieDocument,
): Hernummering[] {
  const oud = bepaalKringCodes(doc),
    nieuw = bepaalKringCodes(doc, true);
  return Object.entries(nieuw).map(([nodeId, code]) => ({
    nodeId,
    oud: oud[nodeId]!,
    nieuw: code,
  }));
}
export function hernummerKringen(doc: InstallatieDocument): OperatieResultaat {
  const codes = bepaalKringCodes(doc, true);
  return resultaat(doc, (d) => {
    for (const [id, code] of Object.entries(codes)) {
      const n = d.nodes[id]!;
      if (n.type === "automaat" || n.type === "zekering") n.kringCode = code;
    }
  });
}
/** Kopieert een kring zonder plaatsingen; de gebruiker kiest bewust een vrije code. */
export function dupliceerKring(
  doc: InstallatieDocument,
  nodeId: NodeId,
  nieuweCode: string,
): OperatieResultaat & { id: NodeId } {
  const node = Object.hasOwn(doc.nodes, nodeId) ? doc.nodes[nodeId] : undefined;
  const codes = bepaalKringCodes(doc);
  if (
    !node ||
    (node.type !== "automaat" && node.type !== "zekering") ||
    node.parentId === null ||
    !codes[nodeId]
  )
    throw new DocumentFout("NIET_TOEGELATEN_KIND", {
      reden: "geen kring",
      nodeId,
    });
  if (!/^[A-Z]+$/.test(nieuweCode))
    throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "ongeldige kringcode" });
  // An automatic reference is occupied too: reserving it for the clone would renumber its owner.
  const { groepen } = nummerReeksen(doc);
  const reeks = [...groepen.values()].find((ids) => ids.includes(nodeId))!;
  const bezetDoor = reeks.find((id) => {
    const n = doc.nodes[id]!;
    return (
      codes[id] === nieuweCode ||
      (n.type === "differentieel" && n.referentie === nieuweCode)
    );
  });
  if (bezetDoor !== undefined) {
    throw new DocumentFout("ONGELDIG_SCHEMA", {
      reden: "dubbele referentie",
      code: nieuweCode,
      nodeIds: [bezetDoor, nodeId],
    });
  }
  const maak = (id: NodeId): SjabloonNode => {
    const {
      id: _id,
      parentId: _parent,
      kinderen: _kinderen,
      ...rest
    } = doc.nodes[id]!;
    const kopie = { ...rest, kinderen: [] } as SjabloonNode;
    // A copy has never been tested: the RCD test data stays with the original.
    if (kopie.type === "differentieel") {
      delete kopie.testResultaat;
      delete kopie.uitschakeltijd_ms;
    }
    return kopie;
  };
  const boom = maak(nodeId);
  if (boom.type === "automaat" || boom.type === "zekering")
    boom.kringCode = nieuweCode;
  const stapel = [{ id: nodeId, doel: boom }];
  while (stapel.length) {
    const { id, doel } = stapel.pop()!;
    for (const kindId of doc.nodes[id]!.kinderen) {
      const kind = maak(kindId);
      doel.kinderen!.push(kind);
      stapel.push({ id: kindId, doel: kind });
    }
  }
  return pasSjabloonToe(doc, node.parentId, {
    id: "kopie-kring",
    naam: "kopie-kring",
    boom,
  });
}
