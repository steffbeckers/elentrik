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
  const groepen = new Map<string, NodeId[]>();
  const kringIds = new Set<NodeId>();
  const gezien = new Set<NodeId>();
  const stapel = [
    { id: doc.rootId, reeks: "hoofd", bord: false, kring: false },
  ];
  while (stapel.length) {
    let { id, reeks, bord, kring } = stapel.pop()!;
    if (gezien.has(id)) continue;
    gezien.add(id);
    const node = doc.nodes[id];
    if (!node) continue;
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
      if (ander)
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
  const node = doc.nodes[nodeId];
  if (
    !node ||
    (node.type !== "automaat" && node.type !== "zekering") ||
    node.parentId === null ||
    !bepaalKringCodes(doc)[nodeId]
  )
    throw new DocumentFout("NIET_TOEGELATEN_KIND", {
      reden: "geen kring",
      nodeId,
    });
  if (!/^[A-Z]+$/.test(nieuweCode))
    throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "ongeldige kringcode" });
  const maak = (id: NodeId): SjabloonNode => {
    const {
      id: _id,
      parentId: _parent,
      kinderen: _kinderen,
      ...rest
    } = doc.nodes[id]!;
    return { ...rest, kinderen: [] } as SjabloonNode;
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
