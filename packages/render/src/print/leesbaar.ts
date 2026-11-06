/** Print at native millimetres, then tile at gaps between symbols and labels. */
import { bruikbaar, maakStrook, pagineer, tekstBreedte, type Papier, type SchemaElement, type SchemaOpmaak } from "@elentrik/layout";
import type { InstallatieDocument } from "@elentrik/model";
import type { Analyse } from "@elentrik/arei";
import { zonderAantallen } from "../aantallen";

/** Includes glyph/label extents, not just their anchors. Lines keep every electrical connection. */
function verticaalBereik(e: SchemaElement): { van: number; tot: number } {
  switch (e.soort) {
    case "symbool": return { van: e.y - .5, tot: e.y + e.symbool.maat.hoogte + .5 };
    case "tekst": return { van: e.y - e.grootte, tot: e.y + e.grootte * .35 };
    case "lijn": return { van: Math.min(e.y1, e.y2), tot: Math.max(e.y1, e.y2) };
    // Printed pair identifier is below the rail (3.5mm baseline + descender).
    case "vervolg": return { van: e.y - 3.7, tot: e.y + 4.375 };
  }
}

export function leesbareSchemaOpmaak(doc: InstallatieDocument, papier: Papier, analyse: Analyse): SchemaOpmaak {
  const strook = maakStrook(doc, analyse, 2.5);
  // De editor behoudt zijn oorspronkelijke kleine symbooltekst. Op papier krijgt het aantal
  // een eigen leesbare regel, buiten het pictogram en de bestaande puntreferentie.
  strook.elementen = strook.elementen.flatMap((e): SchemaElement[] => {
    if (e.soort !== "symbool") return [e];
    const node = doc.nodes[e.nodeId];
    if (!node || !(node.type === "contactdoos" || node.type === "lichtpunt") || node.aantal <= 1) return [e];
    const { breedte, hoogte, in: invoer } = e.symbool.maat;
    const horizontaal = invoer.x === 0;
    return [
      { ...e, symbool: { ...e.symbool, svg: zonderAantallen(e.symbool.svg) } },
      { soort: "tekst", rol: "aantal", tekst: `×${node.aantal}`, grootte: 2.5,
        // Horizontale samenstellingen hebben 4mm vrije ruimte tussen hun rijen.
        // Verticale punten gebruiken de vrije linkerkant onder hun puntreferentie.
        x: horizontaal ? e.x + breedte / 2 : e.x - 1,
        y: horizontaal ? e.y + hoogte + 2.5 : e.y + hoogte - 1,
        anker: horizontaal ? "middle" : "end" },
    ];
  });
  const basis = pagineer(strook, papier, 1);
  const ruimte = bruikbaar(papier);
  // A tile normally keeps 4mm above and below its content, room for the "p. N" references at a cut.
  const hoogte = ruimte.hoogte - 8;
  const paginas: SchemaOpmaak['paginas'] = [];
  const bronnen: { horizontaal: number; yVan: number; yTot: number; marge: number }[] = [];
  const verticaleLinks: { index: number; vorig: boolean; x: number; y: number; verbinding: string }[] = [];
  for (const horizontaal of basis.paginas) {
    if (!horizontaal.elementen.length) continue;
    const bereiken = horizontaal.elementen.filter(e => e.soort !== 'lijn').map(verticaalBereik);
    const inhoud = horizontaal.elementen.map(verticaalBereik);
    // Separate disconnected bands only across genuinely empty space, including all lines.
    // In particular, the PE group below the circuits need not consume their intervening blank area.
    const banden: { van: number; tot: number }[] = [];
    for (const bereik of inhoud.sort((a, b) => a.van - b.van)) {
      const vorige = banden.at(-1);
      if (vorige && bereik.van <= vorige.tot + 12) vorige.tot = Math.max(vorige.tot, bereik.tot);
      else banden.push({ ...bereik });
    }
    for (const band of banden) {
    // A short circuit on the right must not inherit the empty space above it from a tall left circuit.
    let yVan = banden.length === 1 && strook.hoogte <= hoogte ? 0 : band.van;
    const einde = band.tot;
    // A band that fits the sheet at full scale stays whole: it is never cut for the sake of its margins.
    // Without a cut it needs no reference room, so its margin shrinks to what the sheet leaves.
    const heel = einde - yVan > hoogte && einde - band.van <= ruimte.hoogte;
    if (heel) yVan = band.van;
    const marge = heel ? (ruimte.hoogte - (einde - yVan)) / 2 : 4;
    const tegelLimiet = heel ? einde - yVan : hoogte;
    while (yVan < einde) {
      let yTot = Math.min(einde, yVan + tegelLimiet);
      if (yTot < einde) {
        for (let n = 0; n <= bereiken.length; n++) {
          const doorsneden = bereiken.filter(b => b.van < yTot && b.tot > yTot);
          if (!doorsneden.length) break;
          const veilig = Math.min(...doorsneden.map(b => b.van)) - .5;
          if (veilig <= yVan + 1) break;
          yTot = veilig;
        }
      }
      const index = paginas.length;
      const elementen: SchemaElement[] = [];
      for (const [elementIndex, e] of horizontaal.elementen.entries()) {
        if (e.soort === 'lijn') {
          if (Math.max(e.y1, e.y2) < yVan || Math.min(e.y1, e.y2) > yTot) continue;
          const van = Math.min(e.y1, e.y2), tot = Math.max(e.y1, e.y2);
          if (e.x1 === e.x2) {
            if (van < yVan) verticaleLinks.push({ index, vorig: true, x: e.x1 + 1, y: yVan - 1, verbinding: `v:${horizontaal.index}:${elementIndex}:${yVan}` });
            if (tot > yTot) verticaleLinks.push({ index, vorig: false, x: e.x1 + 1, y: yTot + 3, verbinding: `v:${horizontaal.index}:${elementIndex}:${yTot}` });
          }
          elementen.push({ ...e, y1: Math.max(yVan, Math.min(yTot, e.y1)), y2: Math.max(yVan, Math.min(yTot, e.y2)) });
        } else if (e.soort === 'symbool' ? e.y + e.symbool.maat.hoogte > yVan && e.y < yTot : e.y >= yVan && e.y < yTot) elementen.push({ ...e });
      }
      if (elementen.length) {
        paginas.push({ ...horizontaal, index, yVan: yVan - marge, elementen });
        bronnen.push({ horizontaal: horizontaal.index, yVan, yTot, marge });
      }
      if (yTot >= einde) break;
      yVan = yTot;
    }
    }
  }
  // Follow the rail to the tile containing its Y, rather than the first tile of that horizontal slice.
  const horizontaleLinks = new Map<SchemaElement, string>();
  const gelijkeRails = new Map<string, number>();
  for (const pagina of paginas) for (const e of pagina.elementen) if (e.soort === 'vervolg') {
    const van = bronnen[pagina.index]!.horizontaal;
    const naar = e.paginaNummer - 1;
    const rail = `h:${Math.min(van, naar)}:${Math.max(van, naar)}:${e.y}`;
    // Coincident rails still get distinct pairs, in their original traversal order on either side.
    const sleutel = `${van}:${rail}`;
    const volgnummer = gelijkeRails.get(sleutel) ?? 0;
    gelijkeRails.set(sleutel, volgnummer + 1);
    horizontaleLinks.set(e, `${rail}:${volgnummer}`);
    const doel = bronnen.findIndex(bron => bron.horizontaal === e.paginaNummer - 1 && e.y >= bron.yVan && e.y < bron.yTot);
    if (doel === -1) throw new RangeError("Geen vervolgblad voor de horizontale verbinding");
    e.paginaNummer = doel + 1;
  }
  // Pack fragments in rows without changing scale. Narrow disconnected fragments (such as PE)
  // can share the supply row; row heights are finalized before calculating any translations.
  // Every continuation gets a unique
  // paired number: moved fragments no longer share a common Y, even across different pages.
  type Rij = { tegels: { index: number; x: number }[]; hoogte: number; breedte: number };
  const indeling: { rijen: Rij[]; pagina: SchemaOpmaak['paginas'][number] }[] = [];
  const plaatsingen: { pagina: number; dx: number; dy: number }[] = [];
  const tussenruimte = 4;
  const gebruikteHoogte = (rijen: Rij[]) => rijen.reduce((som, rij) => som + rij.hoogte, 0) + Math.max(0, rijen.length - 1) * tussenruimte;
  // Reserve 0.96em per character (also used by the print appendix), including wide glyphs.
  const veiligeTekstBreedte = (tekst: string, grootte: number) => tekstBreedte(tekst, grootte) * 1.6;
  const paginaLabelBreedte = veiligeTekstBreedte(`p. ${paginas.length}`, 2.5);
  const paarLabelBreedte = veiligeTekstBreedte(`#${verticaleLinks.length + horizontaleLinks.size}`, 2.5);
  const rechterrand = (e: SchemaElement): number => {
    switch (e.soort) {
      case 'lijn': return Math.max(e.x1, e.x2);
      case 'symbool': return e.x + e.symbool.maat.breedte + .5;
      case 'tekst': return e.x + veiligeTekstBreedte(e.tekst, e.grootte) * (e.anker === 'end' ? 0 : e.anker === 'middle' ? .5 : 1);
      case 'vervolg': return e.richting === 'rechts' ? e.x : e.x + 2.5 + Math.max(paginaLabelBreedte, paarLabelBreedte);
    }
  };
  for (const tegel of paginas) {
    const bron = bronnen[tegel.index]!;
    const tegelHoogte = bron.yTot - bron.yVan + 2 * bron.marge;
    const verticaleRanden = verticaleLinks.filter(link => link.index === tegel.index).map(link => link.x + paginaLabelBreedte + 1.5 + paarLabelBreedte);
    const tegelBreedte = Math.max(...tegel.elementen.map(rechterrand), ...verticaleRanden) - tegel.xVan;
    let rij: Rij | undefined;
    for (const groep of indeling) {
      const gebruikt = gebruikteHoogte(groep.rijen);
      rij = groep.rijen.find(r => r.breedte + tussenruimte + tegelBreedte <= ruimte.breedte && gebruikt + Math.max(0, tegelHoogte - r.hoogte) <= ruimte.hoogte);
      if (rij) break;
      if (gebruikt + tussenruimte + tegelHoogte <= ruimte.hoogte) {
        rij = { tegels: [], hoogte: 0, breedte: 0 };
        groep.rijen.push(rij);
        break;
      }
    }
    if (!rij) {
      rij = { tegels: [], hoogte: 0, breedte: 0 };
      indeling.push({ rijen: [rij], pagina: { ...tegel, index: indeling.length, elementen: [] } });
    }
    const x = rij.breedte + (rij.tegels.length ? tussenruimte : 0);
    rij.tegels.push({ index: tegel.index, x });
    rij.breedte = x + tegelBreedte;
    rij.hoogte = Math.max(rij.hoogte, tegelHoogte);
  }
  for (const groep of indeling) {
    let y = 0;
    for (const rij of groep.rijen) {
      for (const plek of rij.tegels) {
        const tegel = paginas[plek.index]!;
        plaatsingen[plek.index] = { pagina: groep.pagina.index, dx: groep.pagina.xVan + plek.x - tegel.xVan,
          dy: (groep.pagina.yVan ?? 0) + y - (tegel.yVan ?? 0) };
      }
      y += rij.hoogte + tussenruimte;
    }
  }
  const verbindingsnummers = new Map<string, number>();
  const nummerVan = (verbinding: string): number => {
    if (!verbindingsnummers.has(verbinding)) verbindingsnummers.set(verbinding, verbindingsnummers.size + 1);
    return verbindingsnummers.get(verbinding)!;
  };
  for (const link of verticaleLinks) {
    const doel = plaatsingen[link.index + (link.vorig ? -1 : 1)]!;
    paginas[link.index]!.elementen.push({ soort: 'tekst', rol: 'punt', x: link.x, y: link.y, grootte: 2.5, anker: 'start', tekst: `p. ${doel.pagina + 1} #${nummerVan(link.verbinding)}` });
  }
  for (const tegel of paginas) {
    const { pagina, dx, dy } = plaatsingen[tegel.index]!;
    for (const e of tegel.elementen) {
      const vervolg = e.soort === 'vervolg' ? { paginaNummer: plaatsingen[e.paginaNummer - 1]!.pagina + 1,
        verbindingsnummer: nummerVan(horizontaleLinks.get(e)!) } : {};
      indeling[pagina]!.pagina.elementen.push(e.soort === 'lijn'
        ? { ...e, x1: e.x1 + dx, x2: e.x2 + dx, y1: e.y1 + dy, y2: e.y2 + dy }
        : { ...e, x: e.x + dx, y: e.y + dy, ...vervolg });
    }
  }
  return { ...basis, paginas: indeling.map(p => p.pagina) };
}
