import type { InstallatieDocument, Node, NodeId, NodeType } from "./schema";

export const PUNT_TYPES = ["contactdoos", "lichtpunt", "schakelaar", "toestel"] as const;
export const BEVEILIGING_TYPES = ["automaat", "zekering"] as const;

const NA_TELLER = ["differentieel", "automaat", "zekering", "verdeelbord", "leiding"] as const;
const NA_BEVEILIGING = ["leiding", "verdeelbord", "differentieel"] as const;
const NA_PUNT = [...PUNT_TYPES, "leiding"] as const;

export const TOEGELATEN_KINDEREN: Readonly<Record<NodeType, readonly NodeType[]>> = {
  aansluiting: ["teller"],
  teller: NA_TELLER,
  differentieel: NA_TELLER,
  verdeelbord: ["differentieel", "automaat", "zekering", "leiding"],
  automaat: NA_BEVEILIGING,
  zekering: NA_BEVEILIGING,
  leiding: [...PUNT_TYPES, "leiding", "verdeelbord", "differentieel"],
  contactdoos: NA_PUNT,
  lichtpunt: NA_PUNT,
  schakelaar: NA_PUNT,
  toestel: NA_PUNT,
};

export type StructuurProbleem = {
  code:
    | "ROOT_ONGELDIG"
    | "ONBEREIKBAAR"
    | "CYCLUS"
    | "OUDER_INCONSISTENT"
    | "DUBBEL_KIND"
    | "NIET_TOEGELATEN_KIND"
    | "ONBEKENDE_VERWIJZING";
  nodeId: NodeId;
};

/**
 * Controleert de boomstructuur van een document. Doorloopt de graaf iteratief
 * (expliciete stapel), zodat diepe ketens geen RangeError geven.
 *
 * Elk probleem wordt hooguit één keer gemeld per (code, nodeId). Betekenis van
 * `nodeId` per code:
 * - ROOT_ONGELDIG: `rootId`;
 * - ONBEREIKBAAR / CYCLUS: de betrokken node (elke node op een cyclus krijgt
 *   CYCLUS; een node op een niet-bereikbare cyclus krijgt daarnaast ook
 *   ONBEREIKBAAR, de controles zijn onafhankelijk);
 * - OUDER_INCONSISTENT / DUBBEL_KIND / NIET_TOEGELATEN_KIND: het kind;
 * - ONBEKENDE_VERWIJZING: het niet-bestaande id.
 *
 * De volgorde van het resultaat volgt de volgorde van de controles.
 */
export function valideerStructuur(doc: InstallatieDocument): StructuurProbleem[] {
  const problemen: StructuurProbleem[] = [];
  const gemeld = new Set<string>();
  const meld = (code: StructuurProbleem["code"], nodeId: NodeId): void => {
    const sleutel = `${code}\u0000${nodeId}`;
    if (gemeld.has(sleutel)) return;
    gemeld.add(sleutel);
    problemen.push({ code, nodeId });
  };

  const nodes = doc.nodes;
  // Object.hasOwn: ids als "constructor" mogen niet via de prototype resolven.
  const haal = (id: NodeId): Node | undefined =>
    Object.hasOwn(nodes, id) ? nodes[id] : undefined;
  const ids = Object.keys(nodes);

  // 1. Root
  const root = haal(doc.rootId);
  if (!root || root.parentId !== null || root.type !== "aansluiting") {
    meld("ROOT_ONGELDIG", doc.rootId);
  }

  // 2. Bereikbaarheid vanaf de root
  const bereikt = new Set<NodeId>();
  if (root) {
    const stapel: NodeId[] = [doc.rootId];
    bereikt.add(doc.rootId);
    while (stapel.length > 0) {
      const huidig = haal(stapel.pop()!);
      if (!huidig) continue;
      for (const kindId of huidig.kinderen) {
        if (bereikt.has(kindId) || !haal(kindId)) continue;
        bereikt.add(kindId);
        stapel.push(kindId);
      }
    }
  }
  for (const id of ids) {
    if (!bereikt.has(id)) meld("ONBEREIKBAAR", id);
  }

  // 3. Cycli: iteratieve Tarjan (sterk samenhangende componenten) over alle
  // nodes. Elke node in een component van meer dan één node, of met een
  // verwijzing naar zichzelf, ligt op een cyclus en krijgt CYCLUS. Het resultaat
  // hangt niet af van de volgorde van de sleutels.
  const index = new Map<NodeId, number>();
  const laag = new Map<NodeId, number>();
  const opStapel = new Set<NodeId>();
  const componentStapel: NodeId[] = [];
  let volgnummer = 0;
  const betreed = (id: NodeId): void => {
    index.set(id, volgnummer);
    laag.set(id, volgnummer);
    volgnummer++;
    componentStapel.push(id);
    opStapel.add(id);
  };
  for (const start of ids) {
    if (index.has(start)) continue;
    const pad: { id: NodeId; volgende: number }[] = [{ id: start, volgende: 0 }];
    betreed(start);
    while (pad.length > 0) {
      const top = pad[pad.length - 1]!;
      const kinderen = haal(top.id)?.kinderen ?? [];
      if (top.volgende < kinderen.length) {
        const kindId = kinderen[top.volgende++]!;
        if (!haal(kindId)) continue;
        if (!index.has(kindId)) {
          betreed(kindId);
          pad.push({ id: kindId, volgende: 0 });
        } else if (opStapel.has(kindId)) {
          laag.set(top.id, Math.min(laag.get(top.id)!, index.get(kindId)!));
        }
        continue;
      }
      pad.pop();
      const ouder = pad[pad.length - 1];
      if (ouder) laag.set(ouder.id, Math.min(laag.get(ouder.id)!, laag.get(top.id)!));
      if (laag.get(top.id) !== index.get(top.id)) continue;
      const component: NodeId[] = [];
      let lid: NodeId;
      do {
        lid = componentStapel.pop()!;
        opStapel.delete(lid);
        component.push(lid);
      } while (lid !== top.id);
      if (component.length > 1 || kinderen.includes(top.id)) {
        for (const id of component) meld("CYCLUS", id);
      }
    }
  }

  // 4. Per kinderlijst: ouder, dubbele kinderen, toegelaten types, bestaan
  const voorkomens = new Map<NodeId, number>();
  for (const ouderId of ids) {
    const ouder = haal(ouderId);
    if (!ouder) continue;
    for (const kindId of ouder.kinderen) {
      voorkomens.set(kindId, (voorkomens.get(kindId) ?? 0) + 1);
      const kind = haal(kindId);
      if (!kind) {
        meld("ONBEKENDE_VERWIJZING", kindId);
        continue;
      }
      if (kind.parentId !== ouder.id) meld("OUDER_INCONSISTENT", kindId);
      if (!TOEGELATEN_KINDEREN[ouder.type].includes(kind.type)) {
        meld("NIET_TOEGELATEN_KIND", kindId);
      }
    }
  }
  for (const [kindId, aantal] of voorkomens) {
    if (aantal > 1) meld("DUBBEL_KIND", kindId);
  }

  // 5. Verwijzingen vanuit situatie en afwijkingen
  for (const pagina of doc.situatie.paginas) {
    for (const plaatsing of pagina.plaatsingen) {
      if (!haal(plaatsing.nodeId)) meld("ONBEKENDE_VERWIJZING", plaatsing.nodeId);
    }
  }
  for (const afwijking of doc.afwijkingen) {
    if (!haal(afwijking.nodeId)) meld("ONBEKENDE_VERWIJZING", afwijking.nodeId);
  }

  return problemen;
}
