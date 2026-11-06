import { bordVanNode, differentieelNaam, differentieelPlaatsen } from "@elentrik/render";
import type { Analyse } from "@elentrik/arei";
import type { Aanknoping, InstallatieDocument, NodeType, NodeVan, LichtschakelingDoel } from "@elentrik/model";

/** A new selection never silently leaves insertion pointing at an unrelated circuit. */
export function invoegpuntBijSelectie<T extends Aanknoping>(analyse: Analyse, punten: readonly T[], id: string): T | undefined {
  const exact = punten.find(p => p.nodeId === id);
  if (exact) return exact;
  const punt = analyse.puntLabels[id];
  const aftakking = punt && punten.find(p => p.soort === "aftakking-einde" && analyse.puntLabels[p.nodeId] === punt);
  if (aftakking) return aftakking;
  const kring = analyse.kringVanNode[id] ?? analyse.kringen.find(k => k.beveiligingId === id)?.id;
  return kring ? punten.find(p => p.soort === "kring-einde" && analyse.kringVanNode[p.nodeId] === kring) : undefined;
}

/** De volledige elektrische structuur, ook nodes zonder puntlabel of eigen symboolvak. */
export function schemaKeuzes(doc: InstallatieDocument, analyse: Analyse, typeNaam: (type: NodeType) => string): { id: string; label: string }[] {
  const volgorde: { id: string; kring: string }[] = [];
  const kringen = new Map(analyse.kringen.map(k => [k.beveiligingId, k.label]));
  const gezien = new Set<string>();
  const stapel = [{ id: doc.rootId, kring: "" }];
  while (stapel.length) {
    const { id, kring: bovenliggendeKring } = stapel.pop()!;
    const node = doc.nodes[id];
    if (!node || gezien.has(id)) continue;
    gezien.add(id);
    const kring = kringen.get(id) ?? bovenliggendeKring;
    volgorde.push({ id, kring });
    for (let i = node.kinderen.length - 1; i >= 0; i--) stapel.push({ id: node.kinderen[i]!, kring });
  }
  const plaatsen = differentieelPlaatsen(doc, volgorde.map(v => v.id));
  return uniekeKeuzeLabels(volgorde.map(({ id, kring }) => {
    const node = doc.nodes[id]!;
    const delen = node.type === "differentieel"
      ? [differentieelNaam(node, plaatsen.get(id)!, typeNaam)]
      : [analyse.puntLabels[id] ?? (node.type === "verdeelbord" ? node.naam : kring), typeNaam(node.type)];
    return { id, label: [...delen, node.label].filter(Boolean).join(" · ") };
  }));
}

/** Reserve existing descriptions before assigning ordinals, including descriptions such as "Keuken 1". */
function uniekeKeuzeLabels<T extends { label: string }>(keuzes: T[]): T[] {
  const aantallen = new Map<string, number>();
  for (const keuze of keuzes) aantallen.set(keuze.label, (aantallen.get(keuze.label) ?? 0) + 1);
  const nummers = new Map<string, number>();
  // Reserve original descriptions as well as generated labels; e.g. "Keuken 1" may already exist.
  const bezet = new Set(keuzes.map(keuze => keuze.label));
  return keuzes.map(keuze => {
    if (aantallen.get(keuze.label)! < 2) return keuze;
    let nummer = (nummers.get(keuze.label) ?? 0) + 1;
    while (bezet.has(`${keuze.label} ${nummer}`)) nummer++;
    nummers.set(keuze.label, nummer);
    const label = `${keuze.label} ${nummer}`;
    bezet.add(label);
    return { ...keuze, label };
  });
}

function bordKeuzeLabels(doc: InstallatieDocument, structuur: {id: string; label: string}[], typeNaam: (type: NodeType) => string): Map<string, string> {
  const borden = structuur.filter(k => doc.nodes[k.id]!.type === "verdeelbord");
  return new Map(uniekeKeuzeLabels(borden.map((k, index) => {
    const node = doc.nodes[k.id]!;
    return { id: k.id, label: node.type === "verdeelbord" && node.naam?.trim() ? k.label : `${typeNaam("verdeelbord")} ${index + 1}` };
  })).map(k => [k.id, k.label]));
}

/** Unique node labels, source references and board context for template and lighting destinations. */
export function invoegDoelKeuzes(
  doc: InstallatieDocument,
  analyse: Analyse,
  doelen: readonly LichtschakelingDoel[],
  typeNaam: (type: NodeType) => string,
  doelNaam: (soort: LichtschakelingDoel["soort"]) => string,
): {value: string; label: string}[] {
  const structuur = schemaKeuzes(doc, analyse, typeNaam);
  const namen = new Map(structuur.map(k => [k.id, k.label]));
  const borden = bordKeuzeLabels(doc, structuur, typeNaam);
  return uniekeKeuzeLabels(doelen.map(doel => {
    const bordId = bordVanNode(doc, doel.nodeId);
    const context = bordId !== undefined && bordId !== doel.nodeId ? borden.get(bordId) : undefined;
    return {
      value: `${doel.soort}:${doel.nodeId}`,
      label: [borden.get(doel.nodeId) ?? namen.get(doel.nodeId), context, doelNaam(doel.soort)].filter(Boolean).join(" — "),
    };
  }));
}

/** Sorteer bestemmingen los van de geometrische volgorde van de plusknoppen. */
export function schemaInvoegKeuzes(
  doc: InstallatieDocument,
  analyse: Analyse,
  aanknopingen: readonly Aanknoping[],
  typeNaam: (type: NodeType) => string,
  tekst: (sleutel: string, waarden: Record<string, string | number>) => string,
): (Aanknoping & { sleutel: string; label: string; bordId: string; bord: string })[] {
  const structuur = schemaKeuzes(doc, analyse, typeNaam);
  const bordIds = structuur.filter(n => doc.nodes[n.id]?.type === "verdeelbord").map(n => n.id);
  const bordLabels = bordKeuzeLabels(doc, structuur, typeNaam);
  const differentielen = structuur.filter(n => doc.nodes[n.id]?.type === "differentieel").map(n => n.id);
  const plaatsen = differentieelPlaatsen(doc, differentielen);
  const kringIndex = new Map(analyse.kringen.map((k, index) => [k.id, index]));
  const natuurlijk = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  function ligtOnder(id: string, voorouderId: string): boolean {
    const gezien = new Set<string>();
    let node = doc.nodes[id];
    while (node && !gezien.has(node.id)) {
      if (node.id === voorouderId) return true;
      gezien.add(node.id);
      node = node.parentId ? doc.nodes[node.parentId] : undefined;
    }
    return false;
  }
  return aanknopingen.filter(a => !!doc.nodes[a.nodeId]).map(a => {
    const node = doc.nodes[a.nodeId]!;
    const bordId = bordVanNode(doc, node.id) ?? "";
    const bord = bordLabels.get(bordId) ?? typeNaam("aansluiting");
    const kring = analyse.kringen.find(k => k.id === analyse.kringVanNode[node.id]);
    let label: string;
    if (a.soort === "kring-einde" || a.soort === "aftakking-einde") {
      const punt = analyse.puntLabels[node.id] || typeNaam(node.type);
      label = tekst("kringBestemming", { kring: kring?.label ?? "—", punt });
      if (node.label) label += ` · ${node.label}`;
    } else if (node.type === "differentieel") {
      const kringen = analyse.kringen.filter(k => ligtOnder(k.beveiligingId, node.id)).map(k => k.label);
      label = `${differentieelNaam(node, plaatsen.get(node.id) ?? 1, typeNaam)} · ${node.nominaal_A} A · ${node.polen}P · ${node.klasse}`;
      if (node.label) label += ` · ${node.label}`;
      if (kringen.length) label += ` · ${tekst("voorKringen", { kringen: kringen.join(", ") })}`;
    } else {
      label = tekst("rechtstreeksOpBord", { bord });
    }
    return { ...a, sleutel: `${a.soort}:${a.nodeId}`, label, bordId, bord };
  }).sort((a, b) => {
    const volgorde = { "kring-einde": 0, "aftakking-einde": 1, "aftakking": 2, "rail-einde": 3 };
    if (a.soort !== b.soort) return volgorde[a.soort] - volgorde[b.soort];
    if (a.bordId !== b.bordId) return natuurlijk.compare(a.bord, b.bord) || bordIds.indexOf(a.bordId) - bordIds.indexOf(b.bordId);
    if (a.soort === "kring-einde" || a.soort === "aftakking-einde") {
      // De analyse telt A…Z, AA…; lexicografisch sorteren zou AA vóór B zetten.
      const verschil = (kringIndex.get(analyse.kringVanNode[a.nodeId]!) ?? Infinity) - (kringIndex.get(analyse.kringVanNode[b.nodeId]!) ?? Infinity);
      if (verschil) return verschil;
      return natuurlijk.compare(analyse.puntLabels[a.nodeId] ?? a.label, analyse.puntLabels[b.nodeId] ?? b.label);
    }
    const aBord = doc.nodes[a.nodeId]?.type === "verdeelbord";
    const bBord = doc.nodes[b.nodeId]?.type === "verdeelbord";
    if (aBord !== bBord) return aBord ? -1 : 1;
    return differentielen.indexOf(a.nodeId) - differentielen.indexOf(b.nodeId);
  });
}

export { bordVanNode, differentieelNaam };
