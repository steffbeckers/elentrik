import { DocumentFout } from "./fouten";
import { isAftakkingNode } from "./aftakkingen";
import { controleerType, vereis, type NodeInvoer, type OperatieResultaat } from "./operaties";
import { NodeSchema, type InstallatieDocument, type NodeId } from "./schema";
import { pasSjabloonToe, type Sjabloon, type SjabloonNode } from "./sjablonen";
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
export type Aanknoping = { soort: "kring-einde" | "rail-einde" | "aftakking" | "aftakking-einde"; nodeId: NodeId };

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
  if (aanknoping.soort === "aftakking" || aanknoping.soort === "aftakking-einde") {
    const geldigDoel = aanknoping.soort === "aftakking"
      ? node.type === "leiding"
      : isAftakkingNode(node) && node.kinderen.length === 0;
    if (!geldigDoel || !["schakelaar", "lichtpunt", "contactdoos", "toestel"].includes(onderdeel)) {
      throw nietToegelaten({ reden: "ongeldige aftakking", nodeId: node.id, onderdeel });
    }
    return [{ ...onderdeelInvoer(onderdeel, voorinstelling), aftakking: true } as NodeInvoer];
  }
  if (aanknoping.soort === "kring-einde") {
    if (isAftakkingNode(node)) throw nietToegelaten({ reden: "gebruik aftakking-einde", nodeId: node.id });
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
  const basis = [NIEUWE_KRING_AUTOMAAT, STANDAARD.leiding];
  // De leiding is al deel van de nieuwe kring. Elk ander gekozen onderdeel
  // hoort meteen mee in dezelfde operatie, inclusief zijn voorinstelling.
  return onderdeel === "leiding" ? basis : [...basis, onderdeelInvoer(onderdeel, voorinstelling)];
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

/** Een nieuwe beveiliging wordt alleen op expliciet verzoek op een bord toegevoegd. */
export type SjabloonDoel = { soort: "bestaande-differentieel"; nodeId: NodeId } | { soort: "nieuw-op-bord"; nodeId: NodeId };
export type DifferentieelInstellingen = Pick<import("./schema").NodeVan<"differentieel">, "gevoeligheid_mA" | "nominaal_A" | "polen" | "klasse">;

function controleerSjabloonDoel(doc: InstallatieDocument, doel: SjabloonDoel): void {
 const node=vereis(doc,doel.nodeId);
 if(doel.soort==="nieuw-op-bord" && node.type==="verdeelbord") return;
 if(doel.soort==="bestaande-differentieel" && node.type==="differentieel") {
  const gezien=new Set<NodeId>();let ouder=node.parentId;
  while(ouder!==null&&!gezien.has(ouder)){gezien.add(ouder);const n=vereis(doc,ouder);if(n.type==="verdeelbord")return;ouder=n.parentId;}
 }
 throw nietToegelaten({reden:"ongeldige sjabloonbestemming",nodeId:node.id});
}
function boomVoorDoel(boom:SjabloonNode,doel:SjabloonDoel,instellingen?:DifferentieelInstellingen):SjabloonNode {
 const kring=boom.type==="differentieel"?boom.kinderen?.[0]:boom;
 if(!kring)throw new DocumentFout("ONGELDIG_SCHEMA",{reden:"sjabloon zonder kring"});
 return doel.soort==="bestaande-differentieel"?kring:{...STANDAARD.differentieel,...instellingen,kinderen:[kring]} as SjabloonNode;
}
export function voegSjabloonToe(doc: InstallatieDocument, doel:SjabloonDoel, sjabloonId:string, instellingen?:DifferentieelInstellingen): OperatieResultaat & {id:NodeId} {
 controleerSjabloonDoel(doc,doel);
 const origineel=sjabloonVoor(sjabloonId,doc.voeding.stroomtype);
 return pasSjabloonToe(doc,doel.nodeId,{...origineel,boom:boomVoorDoel(origineel.boom,doel,instellingen)});
}
export type LichtschakelingOpties = { schakeling:"enkel"|"wissel"|"kruis"; aantal:number; lichtsoort?:import("./schema").NodeVan<"lichtpunt">["soort"] };
export type LichtschakelingDoel = SjabloonDoel | {soort:"bestaande-kring";nodeId:NodeId};
/** Zoekt de leiding van de geselecteerde kring; nooit een leiding van een onderbord. */
export function lichtschakelingLeiding(doc:InstallatieDocument,nodeId:NodeId):NodeId {
 let n=vereis(doc,nodeId);const gezien=new Set<NodeId>();
 while(n.type!=="automaat"&&n.type!=="zekering") {if(n.parentId===null||gezien.has(n.id))throw nietToegelaten({reden:"geen bestaande kring"});gezien.add(n.id);n=vereis(doc,n.parentId);}
 const stapel=[...n.kinderen].reverse();
 while(stapel.length){const kind=vereis(doc,stapel.pop()!);if(kind.type==="leiding")return kind.id;if(kind.type==="verdeelbord"||kind.type==="automaat"||kind.type==="zekering")continue;stapel.push(...kind.kinderen.slice().reverse());}
 throw nietToegelaten({reden:"kring zonder leiding",nodeId:n.id});
}
export function voegLichtschakelingToe(doc:InstallatieDocument,doel:LichtschakelingDoel,opties:LichtschakelingOpties,instellingen?:DifferentieelInstellingen):OperatieResultaat & {id:NodeId} {
 if(!["enkel","wissel","kruis"].includes(opties.schakeling))throw new DocumentFout("ONGELDIG_SCHEMA",{reden:"onbekende lichtschakeling"});
 const soorten=opties.schakeling==="enkel"?["enkel"]:opties.schakeling==="wissel"?["wissel","wissel"]:["wissel","kruis","wissel"];
 const schakelaars=soorten.map(soort=>({...STANDAARD.schakelaar,soort,aftakking:true}) as NodeInvoer);
 if(!Number.isSafeInteger(opties.aantal)||opties.aantal<1||opties.aantal>1000)throw new DocumentFout("ONGELDIG_SCHEMA",{reden:"ongeldig aantal lichtpunten"});
 const lamp={type:"lichtpunt",aantal:1,...(opties.lichtsoort?{soort:opties.lichtsoort}:{}),aftakking:true} as NodeInvoer;
 const aftakking=keten(schakelaars[0]!,...schakelaars.slice(1),...Array.from({length:opties.aantal},()=>lamp));
 if(doel.soort==="bestaande-kring")return pasSjabloonToe(doc,lichtschakelingLeiding(doc,doel.nodeId),{id:"lichtschakeling",naam:"lichtschakeling",boom:aftakking});
 controleerSjabloonDoel(doc,doel);
 const boom={...NIEUWE_KRING_AUTOMAAT,kinderen:[{...STANDAARD.leiding,doorsnede_mm2:1.5,kinderen:[aftakking]}]} as SjabloonNode;
 return pasSjabloonToe(doc,doel.nodeId,{id:"lichtschakeling",naam:"lichtschakeling",boom:boomVoorDoel(boom,doel,instellingen)});
}
