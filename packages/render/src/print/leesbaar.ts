/** Print at native millimetres, then tile at gaps between symbols and labels. */
import { bruikbaar, maakStrook, pagineer, type Papier, type SchemaElement, type SchemaOpmaak } from "@elentrik/layout";
import type { InstallatieDocument } from "@elentrik/model";
import type { Analyse } from "@elentrik/arei";

export function leesbareSchemaOpmaak(doc: InstallatieDocument, papier: Papier, analyse: Analyse): SchemaOpmaak {
  const strook = maakStrook(doc, analyse, 2.5);
  const basis = pagineer(strook, papier, 1);
  const hoogte = bruikbaar(papier).hoogte - 8;
  const paginas: SchemaOpmaak['paginas'] = [];
  const bronnen: number[] = [];
  const verticaleLinks: { index: number; vorig: boolean; x: number; y: number }[] = [];
  for (const horizontaal of basis.paginas) {
    const bereiken = horizontaal.elementen.flatMap(e => e.soort === 'symbool' ? [{ van: e.y - .5, tot: e.y + e.symbool.maat.hoogte + .5 }] : e.soort === 'tekst' ? [{ van: e.y - e.grootte, tot: e.y + e.grootte * .35 }] : []);
    let yVan = 0;
    while (yVan < strook.hoogte) {
      let yTot = Math.min(strook.hoogte, yVan + hoogte);
      if (yTot < strook.hoogte) {
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
      for (const e of horizontaal.elementen) {
        if (e.soort === 'lijn') {
          if (Math.max(e.y1, e.y2) < yVan || Math.min(e.y1, e.y2) > yTot) continue;
          const van = Math.min(e.y1, e.y2), tot = Math.max(e.y1, e.y2);
          if (e.x1 === e.x2) {
            if (van < yVan) verticaleLinks.push({ index, vorig: true, x: e.x1 + 1, y: yVan - 1 });
            if (tot > yTot) verticaleLinks.push({ index, vorig: false, x: e.x1 + 1, y: yTot + 3 });
          }
          elementen.push({ ...e, y1: Math.max(yVan, Math.min(yTot, e.y1)), y2: Math.max(yVan, Math.min(yTot, e.y2)) });
        } else if (e.soort === 'symbool' ? e.y + e.symbool.maat.hoogte > yVan && e.y < yTot : e.y >= yVan && e.y < yTot) elementen.push({ ...e });
      }
      if (elementen.length) {
        paginas.push({ ...horizontaal, index, yVan: yVan - 4, elementen });
        bronnen.push(horizontaal.index);
      }
      if (yTot >= strook.hoogte) break;
      yVan = yTot;
    }
  }
  // Horizontal links originally referred to horizontal slices; resolve them after vertical tiling.
  for (const pagina of paginas) for (const e of pagina.elementen) if (e.soort === 'vervolg') e.paginaNummer = bronnen.indexOf(e.paginaNummer - 1) + 1;
  for (const link of verticaleLinks) paginas[link.index]?.elementen.push({ soort: 'tekst', rol: 'punt', x: link.x, y: link.y, grootte: 2.5, anker: 'start', tekst: `p. ${link.index + (link.vorig ? 0 : 2)}` });
  return { ...basis, paginas };
}
