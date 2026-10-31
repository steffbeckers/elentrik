import { DocumentFout } from "./fouten";
import { controleerType, vereis, type NodeInvoer, type OperatieResultaat } from "./operaties";
import { NodeSchema, type InstallatieDocument, type NodeId } from "./schema";
import { pasSjabloonToe, type Sjabloon } from "./sjablonen";
import {
  NIEUWE_KRING_AUTOMAAT,
  STANDAARD,
  VISUELE_VELDEN,
  keten,
  sjabloonVoor,
  type Onderdeel,
  type Voorinstelling,
} from "./standaarden";

/**
 * Waar een onderdeel bijkomt: op het einde van een kring (een node zonder kinderen)
 * of op het einde van een rail (een verdeelbord of een differentieel).
 */
export type Aanknoping = { soort: "kring-einde" | "rail-einde"; nodeId: NodeId };

type Plan = { ouderId: NodeId; sjabloon: Sjabloon; aantal: number };

function nietToegelaten(details: object): DocumentFout {
  return new DocumentFout("NIET_TOEGELATEN_KIND", details);
}

/** `STANDAARD` met daarover de sleutels van de voorinstelling die dit onderdeel mag zetten. */
function onderdeelInvoer(onderdeel: Onderdeel, voorinstelling?: Voorinstelling): NodeInvoer {
  const toegelaten = VISUELE_VELDEN[onderdeel];
  if (!voorinstelling || !toegelaten) return STANDAARD[onderdeel];
  const invoer: Record<string, unknown> = { ...STANDAARD[onderdeel] };
  for (const sleutel of toegelaten) {
    if (voorinstelling[sleutel] !== undefined) invoer[sleutel] = voorinstelling[sleutel];
  }
  return invoer as NodeInvoer;
}

/** De nieuwe nodes van boven naar onder (elke node is het kind van de vorige). */
function nieuweNodes(
  doc: InstallatieDocument,
  aanknoping: Aanknoping,
  onderdeel: Onderdeel,
  voorinstelling?: Voorinstelling,
): NodeInvoer[] {
  const node = vereis(doc, aanknoping.nodeId);
  if (aanknoping.soort === "kring-einde") {
    if (node.kinderen.length > 0) throw nietToegelaten({ reden: "geen einde", nodeId: node.id });
    if (onderdeel === "differentieel" || onderdeel === "zekering") {
      throw nietToegelaten({ reden: "geen beveiliging op een kring-einde", onderdeel });
    }
    if (onderdeel === "onderbord") {
      return node.type === "leiding"
        ? [STANDAARD.onderbord]
        : [STANDAARD.leiding, STANDAARD.onderbord];
    }
    return [onderdeelInvoer(onderdeel, voorinstelling)];
  }

  if (node.type !== "verdeelbord" && node.type !== "differentieel") {
    throw nietToegelaten({ reden: "geen rail", nodeId: node.id, type: node.type });
  }
  if (onderdeel === "differentieel") return [STANDAARD.differentieel];
  if (onderdeel === "zekering") return [STANDAARD.zekering, STANDAARD.leiding];
  return [NIEUWE_KRING_AUTOMAAT, STANDAARD.leiding];
}

/**
 * Bouwt de toe te voegen keten als sjabloon en controleert elke schakel tegen
 * `TOEGELATEN_KINDEREN`. Gooit een `DocumentFout` als het niet kan. Beide
 * publieke functies gebruiken dit, zodat ze nooit uiteenlopen.
 */
function maakPlan(
  doc: InstallatieDocument,
  aanknoping: Aanknoping,
  onderdeel: Onderdeel,
  voorinstelling?: Voorinstelling,
): Plan {
  const nodes = nieuweNodes(doc, aanknoping, onderdeel, voorinstelling);
  let ouderType = vereis(doc, aanknoping.nodeId).type;
  for (const invoer of nodes) {
    controleerType({ type: ouderType }, invoer);
    // Een ongeldige voorinstelling (een onbekende soort, aantal 0) mag niet pas bij het toepassen falen.
    const geparsed = NodeSchema.safeParse({
      ...invoer,
      id: "controle",
      parentId: "controle",
      kinderen: [],
    });
    if (!geparsed.success) {
      throw new DocumentFout("ONGELDIG_SCHEMA", { issues: geparsed.error.issues });
    }
    ouderType = invoer.type;
  }
  const [eerste, ...rest] = nodes as [NodeInvoer, ...NodeInvoer[]];
  return {
    ouderId: aanknoping.nodeId,
    sjabloon: { id: `onderdeel-${onderdeel}`, naam: onderdeel, boom: keten(eerste, ...rest) },
    aantal: nodes.length,
  };
}

/** Geeft `true` precies dan als `voegOnderdeelToe` met dezelfde argumenten niet zou gooien. */
export function magToevoegen(
  doc: InstallatieDocument,
  aanknoping: Aanknoping,
  onderdeel: Onderdeel,
  voorinstelling?: Voorinstelling,
): boolean {
  try {
    maakPlan(doc, aanknoping, onderdeel, voorinstelling);
    return true;
  } catch (fout) {
    if (fout instanceof DocumentFout) return false;
    throw fout;
  }
}

/**
 * Voegt een onderdeel toe volgens de regels van spec §4.3, in één operatie
 * (één undo-stap). `ids` zijn de nieuwe node-id's van onder naar boven.
 * Gooit `ONBEKENDE_NODE`, `NIET_TOEGELATEN_KIND` of `ONGELDIG_SCHEMA` (ongeldige voorinstelling).
 */
export function voegOnderdeelToe(
  doc: InstallatieDocument,
  aanknoping: Aanknoping,
  onderdeel: Onderdeel,
  voorinstelling?: Voorinstelling,
): OperatieResultaat & { ids: NodeId[] } {
  const plan = maakPlan(doc, aanknoping, onderdeel, voorinstelling);
  const r = pasSjabloonToe(doc, plan.ouderId, plan.sjabloon);
  const ids: NodeId[] = [r.id];
  while (ids.length < plan.aantal) {
    const kind = r.doc.nodes[ids[ids.length - 1]!]!.kinderen[0]!;
    ids.push(kind);
  }
  return { doc: r.doc, patches: r.patches, inversePatches: r.inversePatches, ids };
}

/**
 * Past een sjabloon toe op de rail van een verdeelbord of differentieel, in één
 * operatie. Het sjabloon volgt het stroomtype van het document.
 */
export function voegSjabloonToe(
  doc: InstallatieDocument,
  bordOfDifferentieelId: NodeId,
  sjabloonId: string,
): OperatieResultaat & { id: NodeId } {
  const doel = vereis(doc, bordOfDifferentieelId);
  if (doel.type !== "verdeelbord" && doel.type !== "differentieel") {
    throw nietToegelaten({ reden: "geen rail", nodeId: doel.id, type: doel.type });
  }
  return pasSjabloonToe(doc, doel.id, sjabloonVoor(sjabloonId, doc.voeding.stroomtype));
}
