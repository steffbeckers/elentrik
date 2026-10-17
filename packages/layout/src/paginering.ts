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
 * `MIN_SCHAAL`), knip greedy op kringgrenzen en wijs elk element toe aan een pagina. Horizontale
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
    const ankerOp = (x: number): boolean => (eerste || x >= xVan - EPSILON) && (laatste || x < xTot - EPSILON);
    return bereiken.some(
      ({ van, tot }) => ankerOp(van) || (!eerste && tot - van > EPSILON && van < xVan - EPSILON && tot > xVan + EPSILON),
    );
  };

  // Knippen: telkens de verste kandidaat die nog op de pagina past. Grenzen op of links van de
  // linkerrand van de inhoud vallen af, anders ontstaat een lege eerste pagina.
  const kandidaten = [...strook.kringGrenzen.filter((x) => x > STROOK_MARGE_MM + EPSILON), strook.breedte];
  const paginas: SchemaPagina[] = [];
  let xVan = 0;
  for (;;) {
    const grens = xVan + paginaBreedte;
    let xTot = Number.NEGATIVE_INFINITY;
    for (const kandidaat of kandidaten) {
      if (kandidaat > xVan + EPSILON && kandidaat <= grens + EPSILON && kandidaat > xTot) xTot = kandidaat;
    }
    // Een knip die een lege pagina geeft, wijkt voor een knip op de volle paginabreedte. Dat kan
    // alleen als die nog voor de rechterrand valt; een lege laatste pagina is niet te vermijden.
    const leeg = xTot !== Number.NEGATIVE_INFINITY && grens < strook.breedte - EPSILON && !heeftElementen(xVan, xTot);
    if (xTot === Number.NEGATIVE_INFINITY || leeg) {
      xTot = grens;
      waarschuwingen.push({ code: "KRING_TE_BREED", paginaIndex: paginas.length });
    }
    paginas.push({ index: paginas.length, xVan, xTot, schaal, elementen: [] });
    if (xTot >= strook.breedte) break;
    xVan = xTot;
  }

  const laatste = paginas.length - 1;
  /** Pagina van een ankerpunt: half open `[xVan, xTot)`, de laatste pagina neemt ook `xTot`. */
  const paginaVan = (x: number): number => {
    let laag = 0;
    let hoog = laatste;
    while (laag < hoog) {
      const midden = (laag + hoog) >> 1;
      if (x < paginas[midden]!.xTot - EPSILON) hoog = midden;
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
