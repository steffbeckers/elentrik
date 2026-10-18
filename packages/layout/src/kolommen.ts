import { analyseer, type Analyse } from "@elentrik/arei";
import type { InstallatieDocument, Node, NodeId } from "@elentrik/model";
import { KOLOM_BREEDTE_MM, tekenSymbool, type Symbool } from "@elentrik/symbols";
import { heeftKringEinde, heeftRailEinde } from "./aanknopingen";
import { beveiligingLabel, leidingLabel, tekstBreedte } from "./labels";
import {
  KRING_EINDE_AFSTAND_MM,
  RAIL_AFSTAND_MM,
  STROOK_MARGE_MM,
  VERTICALE_AFSTAND_MM,
  type Aanknoping,
  type SchemaElement,
  type Strook,
  type Vak,
} from "./types";

type TekstElement = Extract<SchemaElement, { soort: "tekst" }>;

/** Ruimte tussen het meest linkse element van een kolom en de kolom ernaast, in mm. */
const KOLOM_TUSSENRUIMTE_MM = 1;

/** Hoogte van een hoofdletter als fractie van de tekstgrootte; bepaalt hoe een tekst bij het omkeren zijn basislijn krijgt. */
const TEKST_GLYPH_HOOGTE = 0.7;

/**
 * Legt het document in één strook: elk blad krijgt een eigen kolom en een node met kinderen staat
 * in de kolom van zijn eerste kind. Per node volgen op elkaar: het symbool, de teksten (kring,
 * beveiliging, leiding, punt, onderbord) en de verbindingen naar de kinderen. Alle doorlopingen
 * zijn iteratief. De teksten blijven ruw; escapen gebeurt in render. Een meegegeven `analyse` moet
 * bij `doc` horen.
 *
 * Het schema groeit naar boven: de root staat onderaan (de grootste y), elk kind boven zijn ouder.
 * Een verbinding loopt van `uit` van de ouder (bovenkant) omhoog naar `in` van het kind (onderkant),
 * en een rail ligt boven de vertakkende node. Naast de elementen levert de strook het vak van elk
 * symbool en de aanknopingspunten (`kring-einde`, `rail-einde`), in pre-order.
 *
 * Kolommen zijn minstens `KOLOM_BREEDTE_MM` breed en groeien met wat erin staat: links van de
 * kolomlijn het verste symbool of de verste tekst plus 1 mm, rechts het verste symbool of de
 * verste tekst. Tekstbreedtes zijn geschat met `tekstBreedte`.
 */
export function maakStrook(doc: InstallatieDocument, analyse: Analyse = analyseer(doc)): Strook {
  // Een structureel ongeldig document moet ook eindigen: elke node wordt hoogstens één keer
  // bezocht, en een verwijzing naar een ontbrekende of al bezochte node wordt overgeslagen. Een
  // kind dat meermaals voorkomt, hangt zo alleen onder de ouder die het eerst in pre-order bereikt.
  const kinderenVanNode = new Map<NodeId, NodeId[]>();
  const kinderenVan = (id: NodeId): NodeId[] => kinderenVanNode.get(id)!;

  const ouderVan = new Map<NodeId, NodeId>();
  const preOrder: NodeId[] = [];
  const bezocht = new Set<NodeId>();
  const stapel: { id: NodeId; ouder: NodeId | null }[] = [{ id: doc.rootId, ouder: null }];
  while (stapel.length > 0) {
    const { id, ouder } = stapel.pop()!;
    if (bezocht.has(id) || !Object.hasOwn(doc.nodes, id)) continue;
    bezocht.add(id);
    preOrder.push(id);
    kinderenVanNode.set(id, []);
    if (ouder !== null) {
      kinderenVanNode.get(ouder)!.push(id);
      ouderVan.set(id, ouder);
    }
    const kinderen = doc.nodes[id]!.kinderen;
    for (let i = kinderen.length - 1; i >= 0; i--) stapel.push({ id: kinderen[i]!, ouder: id });
  }

  // Omgekeerde pre-order: elk kind komt voor zijn ouder.
  const bladen = new Map<NodeId, number>();
  for (let i = preOrder.length - 1; i >= 0; i--) {
    const id = preOrder[i]!;
    const kinderen = kinderenVan(id);
    let som = 0;
    for (const kind of kinderen) som += bladen.get(kind)!;
    bladen.set(id, kinderen.length === 0 ? 1 : som);
  }

  // Pre-order: het eerste kind start in de kolom van de ouder, elk volgend kind na de vorige subboom.
  const kolomVan = new Map<NodeId, number>([[doc.rootId, 0]]);
  for (const id of preOrder) {
    let kolom = kolomVan.get(id)!;
    for (const kind of kinderenVan(id)) {
      kolomVan.set(kind, kolom);
      kolom += bladen.get(kind)!;
    }
  }

  const kringLabelVan = new Map<NodeId, string>();
  for (const kring of analyse.kringen) kringLabelVan.set(kring.beveiligingId, kring.label);

  const symbolen = new Map<NodeId, Symbool>();
  const tekstenVanNode = new Map<NodeId, TekstElement[]>();
  for (const id of preOrder) {
    const node = doc.nodes[id]!;
    const symbool = tekenSymbool(node);
    symbolen.set(id, symbool);
    const puntLabel = Object.hasOwn(analyse.puntLabels, id) ? analyse.puntLabels[id] : undefined;
    tekstenVanNode.set(id, teksten(node, symbool, kringLabelVan.get(id), puntLabel));
  }

  // Budget per bladkolom: hoe ver de elementen met hun anker in die kolom links en rechts van de
  // kolomlijn reiken. De teksten staan hier nog ten opzichte van de kolomlijn.
  const aantalKolommen = preOrder.length === 0 ? 0 : bladen.get(doc.rootId)!;
  const links = new Array<number>(aantalKolommen).fill(KOLOM_BREEDTE_MM / 2);
  const rechts = new Array<number>(aantalKolommen).fill(KOLOM_BREEDTE_MM / 2);
  for (const id of preOrder) {
    const kolom = kolomVan.get(id)!;
    const half = symbolen.get(id)!.maat.breedte / 2;
    let naarLinks = half;
    let naarRechts = half;
    for (const tekst of tekstenVanNode.get(id)!) {
      const { van, tot } = tekstBereik(tekst);
      naarLinks = Math.max(naarLinks, -van);
      naarRechts = Math.max(naarRechts, tot);
    }
    links[kolom] = Math.max(links[kolom]!, naarLinks + KOLOM_TUSSENRUIMTE_MM);
    rechts[kolom] = Math.max(rechts[kolom]!, naarRechts);
  }

  const kolomGrenzen: number[] = [];
  const kolomLijn: number[] = [];
  let kolomStart = STROOK_MARGE_MM;
  for (let k = 0; k < aantalKolommen; k++) {
    kolomGrenzen.push(kolomStart);
    kolomLijn.push(kolomStart + links[k]!);
    kolomStart += links[k]! + rechts[k]!;
  }
  const breedte = kolomStart + STROOK_MARGE_MM;
  kolomGrenzen.push(breedte);

  const cx = (id: NodeId): number => kolomLijn[kolomVan.get(id)!]!;

  // Eerst wordt alles opgemaakt als afstand `d` vanaf de voeding: de root begint op `STROOK_MARGE_MM`
  // en een kind staat verder weg dan zijn ouder. In deze fase staat `y` van de elementen voor `d`.
  // Daarna wordt elke `d` omgezet naar een y die van onder naar boven loopt.
  const dVan = new Map<NodeId, number>([[doc.rootId, STROOK_MARGE_MM]]);
  const afstanden: SchemaElement[] = [];
  const afstandAanknopingen: { soort: Aanknoping["soort"]; nodeId: NodeId; x: number; d: number }[] = [];
  let verste = STROOK_MARGE_MM;

  // Afstand vanaf de voeding van een aansluitpunt van een symbool op afstand `d`. `maat` meet de y van
  // boven naar beneden in het getekende symbool, dus `in` (onderaan) ligt op `d` en `uit` op `d + hoogte`.
  const afstandVan = (d: number, symbool: Symbool, punt: "in" | "uit"): number =>
    d + symbool.maat.hoogte - symbool.maat[punt].y;

  // In pre-order ligt de plaats van de ouder vast voordat de kinderen aan bod komen.
  for (const id of preOrder) {
    const node = doc.nodes[id]!;
    const symbool = symbolen.get(id)!;
    const { breedte: symboolBreedte, hoogte } = symbool.maat;
    const x = cx(id);
    const d = dVan.get(id)!;
    afstanden.push({ soort: "symbool", nodeId: id, x: x - symboolBreedte / 2, y: d, symbool });
    verste = Math.max(verste, d + hoogte);
    for (const tekst of tekstenVanNode.get(id)!) afstanden.push({ ...tekst, x: x + tekst.x, y: d + tekst.y });

    const kinderen = kinderenVan(id);
    const ouderId = ouderVan.get(id);
    const metRailEinde = heeftRailEinde(node, ouderId === undefined ? undefined : doc.nodes[ouderId]);
    if (kinderen.length === 0) {
      // De bovenkant van het vak is het enige dat boven de node nog vrij is.
      if (metRailEinde) afstandAanknopingen.push({ soort: "rail-einde", nodeId: id, x: x + KOLOM_BREEDTE_MM / 2, d: d + hoogte });
      if (heeftKringEinde(node, 0)) {
        const dEinde = d + hoogte + KRING_EINDE_AFSTAND_MM;
        verste = Math.max(verste, dEinde);
        afstandAanknopingen.push({ soort: "kring-einde", nodeId: id, x, d: dEinde });
      }
      continue;
    }
    const dUit = afstandVan(d, symbool, "uit");
    const dRail = dUit + VERTICALE_AFSTAND_MM;
    const dKind = kinderen.length > 1 ? dRail + RAIL_AFSTAND_MM : dRail;
    for (const kind of kinderen) dVan.set(kind, dKind);
    const dIn = (kind: NodeId): number => afstandVan(dKind, symbolen.get(kind)!, "in");
    if (metRailEinde) {
      const laatste = kinderen[kinderen.length - 1]!;
      afstandAanknopingen.push({ soort: "rail-einde", nodeId: id, x: cx(laatste) + KOLOM_BREEDTE_MM / 2, d: dRail });
    }

    if (kinderen.length === 1) {
      const kind = kinderen[0]!;
      afstanden.push({ soort: "lijn", x1: x, y1: dUit, x2: cx(kind), y2: dIn(kind), rol: "verbinding" });
      continue;
    }
    afstanden.push({ soort: "lijn", x1: x, y1: dUit, x2: x, y2: dRail, rol: "verbinding" });
    afstanden.push({
      soort: "lijn",
      x1: cx(kinderen[0]!),
      y1: dRail,
      x2: cx(kinderen[kinderen.length - 1]!),
      y2: dRail,
      rol: node.type === "verdeelbord" ? "rail" : "verbinding",
    });
    for (const kind of kinderen) {
      afstanden.push({ soort: "lijn", x1: cx(kind), y1: dRail, x2: cx(kind), y2: dIn(kind), rol: "verbinding" });
    }
  }

  // Omzetten: de voeding staat onderaan, dus y = hoogte − d. De bovenkant van een symbool ligt op
  // hoogte − (d + h). Een tekst houdt zijn glyph (ca. 0,7 × grootte hoog) op dezelfde plek, gespiegeld,
  // zodat zijn basislijn op hoogte − d + 0,7 × grootte komt. Teksten blijven rechtop. Een `kring-einde`
  // telt mee in `verste`, zodat ook het bovenste einde binnen de marge van de strook blijft.
  const hoogteStrook = verste + STROOK_MARGE_MM;
  const vakken: Record<NodeId, Vak> = Object.create(null);
  const elementen = afstanden.map((element): SchemaElement => {
    switch (element.soort) {
      case "symbool": {
        const { breedte: vakBreedte, hoogte: vakHoogte } = element.symbool.maat;
        const y = hoogteStrook - (element.y + vakHoogte);
        vakken[element.nodeId] = { x: element.x, y, breedte: vakBreedte, hoogte: vakHoogte };
        return { ...element, y };
      }
      case "lijn":
        return { ...element, y1: hoogteStrook - element.y1, y2: hoogteStrook - element.y2 };
      case "tekst":
        return { ...element, y: hoogteStrook - element.y + TEKST_GLYPH_HOOGTE * element.grootte };
      case "vervolg":
        return element;
    }
  });

  const grenzen = new Set<number>();
  for (const kring of analyse.kringen) {
    const kolom = kolomVan.get(kring.beveiligingId);
    if (kolom !== undefined) grenzen.add(kolomGrenzen[kolom]!);
  }

  return {
    breedte,
    hoogte: hoogteStrook,
    elementen,
    kolomVan: alsRecord(kolomVan),
    kringGrenzen: [...grenzen].sort((a, b) => a - b),
    kolomGrenzen,
    vakken,
    aanknopingen: afstandAanknopingen.map(({ soort, nodeId, x, d }): Aanknoping => ({ soort, nodeId, x, y: hoogteStrook - d })),
  };
}

/**
 * De teksten van een node in volgorde (kring, beveiliging, leiding, punt, onderbord), met `x` ten
 * opzichte van de kolomlijn en `y` als afstand vanaf de voedingskant van het symbool (zijn `in`-kant), nog niet omgezet naar een strook-y.
 */
function teksten(node: Node, symbool: Symbool, kringLabel: string | undefined, puntLabel: string | undefined): TekstElement[] {
  const { breedte, hoogte } = symbool.maat;
  const rechts = breedte / 2 + 1;
  const midden = hoogte / 2;
  const resultaat: TekstElement[] = [];
  if (kringLabel !== undefined) {
    // Links van de lijn, tussen de rail en de beveiliging (aan de voedingskant), zodat de verbinding de letter niet doorsnijdt.
    resultaat.push({ soort: "tekst", x: -1, y: -1, tekst: kringLabel, grootte: 3, anker: "end", rol: "kring" });
  }
  if (node.type === "automaat" || node.type === "zekering" || node.type === "differentieel") {
    resultaat.push({
      soort: "tekst",
      x: rechts,
      y: midden + 0.7,
      tekst: beveiligingLabel(node),
      grootte: 2,
      anker: "start",
      rol: "beveiliging",
    });
  }
  if (node.type === "leiding") {
    resultaat.push({
      soort: "tekst",
      x: 2,
      y: midden + 0.7,
      tekst: leidingLabel(node),
      grootte: 2,
      anker: "start",
      rol: "leiding",
    });
  }
  if (puntLabel !== undefined) {
    resultaat.push({
      soort: "tekst",
      x: -breedte / 2 - 1,
      y: midden + 0.9,
      tekst: puntLabel,
      grootte: 2.5,
      anker: "end",
      rol: "punt",
    });
  }
  if (node.type === "verdeelbord" && node.naam !== undefined && node.naam.trim() !== "") {
    resultaat.push({
      soort: "tekst",
      x: rechts,
      y: midden + 0.7,
      tekst: node.naam,
      grootte: 2.5,
      anker: "start",
      rol: "onderbord",
    });
  }
  return resultaat;
}

/** Geschat horizontaal bereik van een tekst, volgens zijn anker. */
function tekstBereik(tekst: TekstElement): { van: number; tot: number } {
  const w = tekstBreedte(tekst.tekst, tekst.grootte);
  if (tekst.anker === "start") return { van: tekst.x, tot: tekst.x + w };
  if (tekst.anker === "end") return { van: tekst.x - w, tot: tekst.x };
  return { van: tekst.x - w / 2, tot: tekst.x + w / 2 };
}

/** Een record zonder prototype, zodat ook een id als `__proto__` een gewone sleutel is. */
function alsRecord(kaart: ReadonlyMap<NodeId, number>): Record<NodeId, number> {
  const record: Record<NodeId, number> = Object.create(null);
  for (const [id, waarde] of kaart) record[id] = waarde;
  return record;
}
