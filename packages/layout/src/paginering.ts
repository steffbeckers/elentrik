import { analyseer, type Analyse } from "@elentrik/arei";
import type { InstallatieDocument } from "@elentrik/model";
import { maakStrook } from "./kolommen";
import { STANDAARD_PAPIER_A4, bruikbaar, type Papier } from "./papier";
import { STROOK_MARGE_MM, type SchemaElement, type Strook } from "./types";

/** Kleinste schaal. Is er een kleinere nodig om de strook in de hoogte te laten passen, dan volgt `SCHEMA_TE_HOOG`. */
export const MIN_SCHAAL = 0.5;

/** Tolerantie bij het vergelijken van x-posities in mm. */
const EPSILON = 1e-9;

/**
 * Valt ankerpunt `x` op de pagina `[xVan, xTot)`? Het interval is half open; de eerste pagina
 * neemt ook alles links van `xVan`, de laatste ook `xTot` en alles rechts ervan.
 */
function ankerOp(x: number, xVan: number, xTot: number, eerste: boolean, laatste: boolean): boolean {
  return (eerste || x >= xVan - EPSILON) && (laatste || x < xTot - EPSILON);
}

/**
 * Een pagina van het schema. De elementen staan in strookcoördinaten; render past toe
 * `translate(-xVan)` en daarna `scale(schaal)`.
 */
export type SchemaPagina = { index: number; xVan: number; xTot: number; schaal: number; elementen: SchemaElement[] };

export type Waarschuwing = { code: "SCHEMA_TE_HOOG" | "KRING_TE_BREED"; paginaIndex?: number };

export type SchemaOpmaak = { strook: Strook; papier: Papier; paginas: SchemaPagina[]; waarschuwingen: Waarschuwing[] };

/**
 * Legt het document op pagina's. Geef een al berekende `analyse` mee om ze niet opnieuw te
 * berekenen; ze moet bij `doc` horen.
 */
export function opmaak(
  doc: InstallatieDocument,
  papier: Papier = STANDAARD_PAPIER_A4,
  analyse: Analyse = analyseer(doc),
): SchemaOpmaak {
  return pagineer(maakStrook(doc, analyse), papier);
}

/**
 * Verdeelt een strook over pagina's: schaal naar de bruikbare hoogte (niet kleiner dan
 * `MIN_SCHAAL`), knip greedy op kringgrenzen (of anders op kolomgrenzen, met `KRING_TE_BREED`) en
 * wijs elk element toe aan een pagina. Horizontale
 * lijnen over een knip worden in stukken geknipt en krijgen aan beide kanten een vervolg.
 */
export function pagineer(strook: Strook, papier: Papier): SchemaOpmaak {
  const ruimte = bruikbaar(papier);
  const waarschuwingen: Waarschuwing[] = [];

  let schaal = Math.min(1, ruimte.hoogte / strook.hoogte);
  if (schaal < MIN_SCHAAL) {
    schaal = MIN_SCHAAL;
    waarschuwingen.push({ code: "SCHEMA_TE_HOOG" });
  }
  const paginaBreedte = ruimte.breedte / schaal;

  // Per element het x-bereik dat de toewijzing bepaalt: een ankerpunt, of een horizontale lijn.
  const bereiken = strook.elementen.map((e): { van: number; tot: number } => {
    if (e.soort === "symbool") {
      const anker = e.x + e.symbool.maat.breedte / 2;
      return { van: anker, tot: anker };
    }
    if (e.soort !== "lijn") return { van: e.x, tot: e.x };
    return { van: Math.min(e.x1, e.x2), tot: Math.max(e.x1, e.x2) };
  });
  /** Krijgt de pagina `[xVan, xTot)` minstens één element? Volgt dezelfde regels als de toewijzing hieronder. */
  const heeftElementen = (xVan: number, xTot: number): boolean => {
    const eerste = xVan === 0;
    const laatste = xTot >= strook.breedte;
    return bereiken.some(
      ({ van, tot }) =>
        ankerOp(van, xVan, xTot, eerste, laatste) ||
        (!eerste && tot - van > EPSILON && van < xVan - EPSILON && tot > xVan + EPSILON),
    );
  };

  // Knippen: telkens de verste kandidaat die nog op de pagina past en geen lege pagina geeft, of
  // anders de rechterrand van de strook. Eerst de kringgrenzen; past er geen, dan een kolomgrens
  // binnen een kring, zodat geen symbool doormidden gaat. Alleen als ook geen kolomgrens past,
  // wordt geknipt op de volle paginabreedte. Grenzen op de linkerrand van de inhoud vallen af,
  // anders ontstaat een lege eerste pagina.
  const linkerrand = strook.kolomGrenzen[0] ?? STROOK_MARGE_MM;
  const binnen = (x: number): boolean => x > linkerrand + EPSILON && x < strook.breedte - EPSILON;
  const kringKandidaten = [...strook.kringGrenzen.filter(binnen), strook.breedte];
  const kolomKandidaten = [...strook.kolomGrenzen.filter(binnen), strook.breedte];
  const verste = (kandidaten: readonly number[], xVan: number, grens: number): number | undefined => {
    let beste: number | undefined;
    for (const kandidaat of kandidaten) {
      if (kandidaat <= xVan + EPSILON || kandidaat > grens + EPSILON) continue;
      if (beste !== undefined && kandidaat <= beste) continue;
      if (kandidaat >= strook.breedte || heeftElementen(xVan, kandidaat)) beste = kandidaat;
    }
    return beste;
  };
  const paginas: SchemaPagina[] = [];
  let xVan = 0;
  for (;;) {
    const grens = xVan + paginaBreedte;
    let xTot = verste(kringKandidaten, xVan, grens);
    if (xTot === undefined) {
      xTot = verste(kolomKandidaten, xVan, grens) ?? grens;
      waarschuwingen.push({ code: "KRING_TE_BREED", paginaIndex: paginas.length });
    }
    paginas.push({ index: paginas.length, xVan, xTot, schaal, elementen: [] });
    if (xTot >= strook.breedte) break;
    xVan = xTot;
  }

  const laatste = paginas.length - 1;
  /** Pagina van een ankerpunt, volgens `ankerOp`. De pagina's sluiten aan, dus binair zoeken volstaat. */
  const paginaVan = (x: number): number => {
    let laag = 0;
    let hoog = laatste;
    while (laag < hoog) {
      const midden = (laag + hoog) >> 1;
      const { xVan: van, xTot: tot } = paginas[midden]!;
      if (ankerOp(x, van, tot, midden === 0, midden === laatste)) return midden;
      if (midden > 0 && x < van - EPSILON) hoog = midden - 1;
      else laag = midden + 1;
    }
    return laag;
  };

  /** Knipt een horizontale lijn op de paginagrenzen; een stuk over een knip krijgt daar een vervolg. */
  const knip = (lijn: Extract<SchemaElement, { soort: "lijn" }>): void => {
    const links = Math.min(lijn.x1, lijn.x2);
    const rechts = Math.max(lijn.x1, lijn.x2);
    const eerste = paginaVan(links);
    for (let i = eerste; i <= laatste && (i === eerste || paginas[i]!.xVan < rechts - EPSILON); i++) {
      const pagina = paginas[i]!;
      const vanLinks = i > 0 && links < pagina.xVan - EPSILON;
      const naarRechts = i < laatste && rechts > pagina.xTot + EPSILON;
      if (!vanLinks && !naarRechts) {
        pagina.elementen.push(lijn);
        continue;
      }
      const van = vanLinks ? pagina.xVan : links;
      const tot = naarRechts ? pagina.xTot : rechts;
      pagina.elementen.push(lijn.x1 <= lijn.x2 ? { ...lijn, x1: van, x2: tot } : { ...lijn, x1: tot, x2: van });
      if (vanLinks) {
        pagina.elementen.push({ soort: "vervolg", x: pagina.xVan, y: lijn.y1, richting: "links", paginaNummer: i });
      }
      if (naarRechts) {
        pagina.elementen.push({ soort: "vervolg", x: pagina.xTot, y: lijn.y1, richting: "rechts", paginaNummer: i + 2 });
      }
    }
  };

  // In strookvolgorde, zodat de volgorde per pagina behouden blijft.
  for (const element of strook.elementen) {
    if (element.soort === "symbool") {
      paginas[paginaVan(element.x + element.symbool.maat.breedte / 2)]!.elementen.push(element);
    } else if (element.soort !== "lijn") {
      paginas[paginaVan(element.x)]!.elementen.push(element);
    } else if (Math.abs(element.x1 - element.x2) <= EPSILON) {
      paginas[paginaVan(element.x1)]!.elementen.push(element);
    } else {
      knip(element);
    }
  }

  return { strook, papier, paginas, waarschuwingen };
}
