// Bij "bewaren als kopie" kopieert de server de planbestanden naar het nieuwe project (nieuwe id's).
// Het document uit de editor wijst nog naar de bestanden van het origineel: deze hulp vraagt welke
// bestanden het kent en past de id's aan met de toewijzing die de server teruggeeft. Puur en zonder
// I/O; expliciete imports (ruling E1).
import type { InstallatieDocument } from "@elentrik/model";

/** Zoveel bestandsid's neemt de server per verzoek aan (`DupliceerSchema`). */
export const MAX_KOPIE_BESTANDEN = 200;

/** De planbestanden (origineel en raster) waarnaar de situatiepagina's van het document verwijzen. */
export function planBestandIds(document: InstallatieDocument): string[] {
  const ids = new Set<string>();
  for (const pagina of document.situatie.paginas) {
    if (!pagina.achtergrond) continue;
    ids.add(pagina.achtergrond.origineelBestandId);
    ids.add(pagina.achtergrond.rasterBestandId);
  }
  return [...ids].slice(0, MAX_KOPIE_BESTANDEN);
}

/** Het document met de nieuwe planbestand-id's (oud -> nieuw); een id zonder toewijzing blijft staan. */
export function metNieuweBestandIds(
  document: InstallatieDocument,
  nieuweIds: Readonly<Record<string, string>>,
): InstallatieDocument {
  if (Object.keys(nieuweIds).length === 0) return document;
  return {
    ...document,
    situatie: {
      ...document.situatie,
      paginas: document.situatie.paginas.map((pagina) =>
        pagina.achtergrond
          ? {
              ...pagina,
              achtergrond: {
                ...pagina.achtergrond,
                origineelBestandId: nieuweIds[pagina.achtergrond.origineelBestandId] ?? pagina.achtergrond.origineelBestandId,
                rasterBestandId: nieuweIds[pagina.achtergrond.rasterBestandId] ?? pagina.achtergrond.rasterBestandId,
              },
            }
          : pagina,
      ),
    },
  };
}
