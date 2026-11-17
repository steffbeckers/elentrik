import { leidingLabel } from "@elentrik/layout";
import { analyseer } from "@elentrik/arei";
import {
  MAX_KRINGEN_PER_DIFFERENTIEEL,
  isKringSjabloon,
  type InstallatieDocument,
  type Node,
  type NodeId,
  type Sjabloon,
  type SjabloonDoel,
  type SjabloonGroep,
  type LichtschakelingDoel,
} from "@elentrik/model";

/** Alleen zichtbare, structureel geldige doelen. Een differentieel voor het bord ontbreekt. */
export function invoegBestemmingen(doc: InstallatieDocument): SjabloonDoel[] {
  const doelen: SjabloonDoel[] = [];
  const stapel = [{ id: doc.rootId, bordBoven: false }];
  const gezien = new Set<NodeId>();
  while (stapel.length) {
    const { id, bordBoven } = stapel.pop()!;
    if (gezien.has(id)) continue;
    gezien.add(id);
    const node = doc.nodes[id];
    if (!node) continue;
    if (node.type === "verdeelbord")
      doelen.push({ soort: "nieuw-op-bord", nodeId: id });
    if (node.type === "differentieel" && bordBoven)
      doelen.push({ soort: "bestaande-differentieel", nodeId: id });
    for (let i = node.kinderen.length - 1; i >= 0; i--) {
      stapel.push({
        id: node.kinderen[i]!,
        bordBoven: bordBoven || node.type === "verdeelbord",
      });
    }
  }
  return doelen;
}
export function doelBijSelectie<T extends { nodeId: NodeId }>(
  doelen: T[],
  selectie: NodeId[],
): T | undefined {
  return selectie.length === 1
    ? doelen.find((d) => d.nodeId === selectie[0])
    : undefined;
}
/** Technische waarden blijven taal-onafhankelijk; omschrijvingen blijven apart. */
export function invoegSpecificatie(node: Node): string {
  switch (node.type) {
    case "differentieel":
      return `${node.gevoeligheid_mA} mA / ${node.nominaal_A} A / ${node.klasse} / ${node.polen}P`;
    case "automaat":
      return `${node.curve}${node.nominaal_A} / ${node.polen}P`;
    case "leiding":
      return leidingLabel(node);
    case "lichtpunt":
      return `${node.aantal}`;
    default:
      return "";
  }
}

/** Het voorbeeld hoort bij een toegevoegd punt, ook wanneer latere kringen bestaan. */
export function nieuwePuntcode(
  voor: InstallatieDocument,
  na: InstallatieDocument,
): string | undefined {
  const labels = analyseer(na).puntLabels;
  return Object.keys(na.nodes)
    .filter((id) => !Object.hasOwn(voor.nodes, id))
    .map((id) => labels[id])
    .find(Boolean);
}

/** Een bord of differentieel blijft een bestemming voor een nieuwe kring, ook onder een voedingskring. */
export function lichtDoelBijSelectie(
  doc: InstallatieDocument,
  selectie: NodeId[],
): LichtschakelingDoel | undefined {
  const rail = doelBijSelectie(invoegBestemmingen(doc), selectie);
  if (rail) return rail;
  if (selectie.length !== 1) return undefined;
  const kringId = analyseer(doc).kringVanNode[selectie[0]!];
  return kringId ? { soort: "bestaande-kring", nodeId: kringId } : undefined;
}

/** De groepen van de sjablonen in het paneel Onderdelen, in de volgorde waarin het paneel ze toont. */
export const SJABLOONGROEPEN: readonly SjabloonGroep[] = ["kringen", "toestellen", "installatie"];

/**
 * De sjablonen per groep, in de volgorde van `SJABLOONGROEPEN` en binnen een groep in de gegeven
 * volgorde. Een sjabloon zonder groep is een kring. Een groep zonder sjablonen valt weg.
 */
export function sjablonenPerGroep(sjablonen: readonly Sjabloon[]): { groep: SjabloonGroep; sjablonen: Sjabloon[] }[] {
  return SJABLOONGROEPEN
    .map((groep) => ({ groep, sjablonen: sjablonen.filter((s) => (s.groep ?? "kringen") === groep) }))
    .filter((g) => g.sjablonen.length > 0);
}

/** Boven deze gevoeligheid geldt de grens van `MAX_KRINGEN_PER_DIFFERENTIEEL` niet. */
const LAAGGEVOELIG_MAX_mA = 30;

/** Hoeveel kringen een differentieel van maximaal 30 mA draagt, tegenover het hoogste aantal. */
export type Bezetting = { aantal: number; max: number; vol: boolean };

/**
 * De bezetting van een differentieel van maximaal 30 mA: de kringen waarvan het het dichtstbijzijnde
 * differentieel boven de beveiliging is (ook die van een onderbord zonder eigen differentieel), zoals
 * de AREI-regel ze telt. Undefined voor een differentieel boven 30 mA of een andere node: daar geldt
 * geen grens. Bedoeld voor een differentieel onder een verdeelbord (een bestemming); het algemene
 * differentieel is er geen.
 */
export function differentieelBezetting(doc: InstallatieDocument, differentieelId: NodeId): Bezetting | undefined {
  const differentieel = Object.hasOwn(doc.nodes, differentieelId) ? doc.nodes[differentieelId] : undefined;
  if (differentieel?.type !== "differentieel" || differentieel.gevoeligheid_mA > LAAGGEVOELIG_MAX_mA) return undefined;
  let aantal = 0;
  const gezien = new Set<NodeId>([differentieelId]);
  const stapel = [...differentieel.kinderen];
  while (stapel.length) {
    const id = stapel.pop()!;
    const node = Object.hasOwn(doc.nodes, id) ? doc.nodes[id] : undefined;
    // Onder een dieper differentieel tellen de kringen bij dat differentieel.
    if (!node || gezien.has(id) || node.type === "differentieel") continue;
    gezien.add(id);
    if (node.type === "automaat" || node.type === "zekering") aantal++;
    stapel.push(...node.kinderen);
  }
  return { aantal, max: MAX_KRINGEN_PER_DIFFERENTIEEL, vol: aantal >= MAX_KRINGEN_PER_DIFFERENTIEEL };
}

/**
 * De standaardbestemming voor een nieuwe kring: het differentieel van de huidige selectie, anders
 * het laatst gebruikte differentieel in dit bord (`laatste`: bord-id → differentieel-id), anders
 * het bord. Een geselecteerd bord blijft het bord. Zonder bord in de selectie geldt het eerste bord.
 * Een differentieel van maximaal 30 mA dat al vol zit (`differentieelBezetting`) wordt nooit
 * voorgesteld: de volgende keuze in de rij geldt, tot het bord (een nieuw differentieel).
 */
export function kringBestemming<T extends { nodeId: NodeId }>(
  doc: InstallatieDocument,
  doelen: readonly T[],
  selectie: readonly NodeId[],
  laatste: Readonly<Record<NodeId, NodeId>>,
): T | undefined {
  const doelVan = (id: NodeId) => doelen.find((d) => d.nodeId === id);
  const isBord = (d: T) => doc.nodes[d.nodeId]?.type === "verdeelbord";
  const heeftPlaats = (d: T) => !differentieelBezetting(doc, d.nodeId)?.vol;
  let bord: T | undefined;
  if (selectie.length === 1) {
    const gezien = new Set<NodeId>();
    let node = Object.hasOwn(doc.nodes, selectie[0]!) ? doc.nodes[selectie[0]!] : undefined;
    while (node && !gezien.has(node.id)) {
      gezien.add(node.id);
      const doel = doelVan(node.id);
      if (doel && !isBord(doel) && heeftPlaats(doel)) return doel;
      if (doel && isBord(doel)) {
        if (node.id === selectie[0]) return doel;
        bord = doel;
        break;
      }
      node = node.parentId ? doc.nodes[node.parentId] : undefined;
    }
  }
  bord ??= doelen.find(isBord);
  if (!bord) return undefined;
  const vorig = laatste[bord.nodeId];
  const differentieel = vorig === undefined ? undefined : doelVan(vorig);
  return differentieel && !isBord(differentieel) && heeftPlaats(differentieel) ? differentieel : bord;
}

/**
 * De bestemmingen die bij een sjabloon passen. Een kring kan op elk bord (achter een nieuw
 * differentieel) en achter elk bestaand differentieel; een sjabloon dat geen kring is (de aarding)
 * komt alleen rechtstreeks op een bord.
 */
export function sjabloonBestemmingen(doc: InstallatieDocument, sjabloon: Sjabloon): SjabloonDoel[] {
  const doelen = invoegBestemmingen(doc);
  return isKringSjabloon(sjabloon) ? doelen : doelen.filter((d) => d.soort === "nieuw-op-bord");
}

/**
 * De standaardbestemming voor een sjabloon. Een gewone kring volgt `kringBestemming`. Een sjabloon
 * dat een eigen differentieel vraagt (de laadpaal) of geen kring is (de aarding) komt op het bord
 * van de selectie, anders op het eerste bord.
 */
export function sjabloonBestemming(
  doc: InstallatieDocument,
  sjabloon: Sjabloon,
  selectie: readonly NodeId[],
  laatste: Readonly<Record<NodeId, NodeId>>,
): SjabloonDoel | undefined {
  const doelen = sjabloonBestemmingen(doc, sjabloon);
  if (isKringSjabloon(sjabloon) && !sjabloon.eigenDifferentieel) return kringBestemming(doc, doelen, selectie, laatste);
  const borden = doelen.filter((d) => d.soort === "nieuw-op-bord");
  // Zonder differentiëlen in de lijst en zonder laatst gebruikte blijft alleen het bord van de selectie over.
  return kringBestemming(doc, borden, selectie, {});
}
