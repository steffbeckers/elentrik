import { bruikbaar, papierMaat, type SchemaElement, type SchemaOpmaak } from "@elentrik/layout";
import { LIJNDIKTE_MM, escapeXml, getal } from "@elentrik/symbols";


/** Lengte en halve breedte van het vervolgpijltje in mm. */
const PIJL_LENGTE_MM = 2;
const PIJL_HALVE_BREEDTE_MM = 1;
/** Tekstgrootte van "p. N" in mm. */
const PIJL_TEKST_MM = 2;
/** Afstand van de tekstbasislijn boven de lijn waarop het vervolg staat, zodat de tekst de lijn niet raakt. */
const PIJL_LABEL_BOVEN_LIJN_MM = 1.2;

function elementSvg(element: SchemaElement): string {
  switch (element.soort) {
    case "symbool":
      return (
        `<g data-node-id="${escapeXml(element.nodeId)}" transform="translate(${getal(element.x)} ${getal(element.y)})">` +
        `${element.symbool.svg}</g>`
      );
    case "lijn":
      return (
        `<line class="lijn-${escapeXml(element.rol)}" x1="${getal(element.x1)}" y1="${getal(element.y1)}" ` +
        `x2="${getal(element.x2)}" y2="${getal(element.y2)}" stroke="currentColor" ` +
        `stroke-width="${getal(LIJNDIKTE_MM)}" fill="none"/>`
      );
    case "tekst":
      return tekstSvg(element.rol, element.x, element.y, element.grootte, element.anker, element.tekst);
    case "vervolg": {
      // De punt van het pijltje staat op (x, y); de tekst staat aan de binnenkant van de pagina.
      const richting = element.richting === "rechts" ? 1 : -1;
      const basis = element.x - richting * PIJL_LENGTE_MM;
      const pijl =
        `<path d="M${getal(element.x)} ${getal(element.y)} L${getal(basis)} ${getal(element.y - PIJL_HALVE_BREEDTE_MM)} ` +
        `L${getal(basis)} ${getal(element.y + PIJL_HALVE_BREEDTE_MM)} Z" fill="currentColor"/>`;
      const label = tekstSvg(
        "vervolg",
        element.x - richting * (PIJL_LENGTE_MM + 0.5),
        element.y - PIJL_LABEL_BOVEN_LIJN_MM,
        PIJL_TEKST_MM,
        element.richting === "rechts" ? "end" : "start",
        `p. ${element.paginaNummer}`,
      );
      return `<g class="vervolg">${pijl}${label}</g>`;
    }
  }
}

function tekstSvg(
  rol: string,
  x: number,
  y: number,
  grootte: number,
  anker: "start" | "middle" | "end",
  tekst: string,
): string {
  return (
    `<text class="tekst-${escapeXml(rol)}" x="${getal(x)}" y="${getal(y)}" font-size="${getal(grootte)}" ` +
    `text-anchor="${escapeXml(anker)}" font-family="sans-serif" fill="currentColor">${escapeXml(tekst)}</text>`
  );
}

function root(breedte: number, hoogte: number, inhoud: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="elentrik-schema" width="${getal(breedte)}mm" ` +
    `height="${getal(hoogte)}mm" viewBox="0 0 ${getal(breedte)} ${getal(hoogte)}">${inhoud}</svg>`
  );
}

/**
 * Eén pagina van het schema als volledige SVG op papiermaat (mm). De inhoud wordt geclipt op de
 * bruikbare ruimte, zodat niets in de marges of de (lege) cartouchezone komt. Gooit een
 * `RangeError` bij een ongeldige `paginaIndex`.
 */
export function schemaPaginaSvg(opmaak: SchemaOpmaak, paginaIndex: number): string {
  const pagina = Number.isInteger(paginaIndex) ? opmaak.paginas[paginaIndex] : undefined;
  if (pagina === undefined) {
    throw new RangeError(`Pagina ${paginaIndex} bestaat niet (0 tot en met ${opmaak.paginas.length - 1})`);
  }
  const { papier } = opmaak;
  const maat = papierMaat(papier.formaat);
  const ruimte = bruikbaar(papier);
  const marge = getal(papier.marge_mm);
  // Naar beneden afgerond op 2 decimalen: een afgeronde schaal mag de hoogte nooit overschrijden.
  const schaal = getal(Math.floor(pagina.schaal * 100 + 1e-9) / 100);

  // Uniek per pagina, zodat meerdere pagina's samen in één HTML-document kunnen staan.
  const clipId = `schema-inhoud-${paginaIndex}`;
  const clip =
    `<clipPath id="${clipId}"><rect x="${marge}" y="${marge}" ` +
    `width="${getal(ruimte.breedte)}" height="${getal(ruimte.hoogte)}"/></clipPath>`;
  const inhoud = pagina.elementen.map(elementSvg).join("");
  return root(
    maat.breedte,
    maat.hoogte,
    `${clip}<g clip-path="url(#${clipId})"><g transform="translate(${marge} ${marge}) scale(${schaal}) ` +
      `translate(${getal(-pagina.xVan)} 0)">${inhoud}</g></g>`,
  );
}

/** De hele strook op schaal 1, zonder clip, voor de editor. */
export function schemaStripSvg(opmaak: SchemaOpmaak): string {
  const { strook } = opmaak;
  return root(strook.breedte, strook.hoogte, strook.elementen.map(elementSvg).join(""));
}
