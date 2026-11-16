import { bruikbaar, papierMaat, type SchemaElement, type SchemaOpmaak } from "@elentrik/layout";
import { LIJNDIKTE_MM, escapeXml, getal } from "@elentrik/symbols";

/** Lengte en halve breedte van het vervolgpijltje in mm. */
const PIJL_LENGTE_MM = 2;
const PIJL_HALVE_BREEDTE_MM = 1;
/** Tekstgrootte van "p. N" in mm. */
const PIJL_TEKST_MM = 2.5;
/** Afstand van de tekstbasislijn boven de lijn waarop het vervolg staat, zodat de tekst de lijn niet raakt. */
const PIJL_LABEL_BOVEN_LIJN_MM = 1.2;

/** Extra ruimte rond een symbool waarin een klik het symbool nog raakt, in mm. */
const RAAKVLAK_MARGE_MM = 1.5;
/** Kleinste breedte en hoogte van een raakvlak, in mm: ook een leiding (een dunne lijn) is zo makkelijk aan te wijzen. */
const RAAKVLAK_MIN_MM = 8;

/**
 * Onzichtbaar raakvlak in de lokale coördinaten van het symbool: het vak van het symbool, rondom
 * iets ruimer en minstens `RAAKVLAK_MIN_MM` breed en hoog, gecentreerd. Het staat in de groep,
 * zodat `closest("[data-node-id]")` het vindt, en als eerste kind, zodat de getekende lijnen
 * erboven liggen. De kolommen (24 mm) en de verticale afstand (4 mm) houden de vlakken van
 * naburige symbolen uit elkaar.
 */
function raakvlakSvg(breedte: number, hoogte: number): string {
  const b = Math.max(RAAKVLAK_MIN_MM, breedte + 2 * RAAKVLAK_MARGE_MM);
  const h = Math.max(RAAKVLAK_MIN_MM, hoogte + 2 * RAAKVLAK_MARGE_MM);
  return (
    `<rect class="raakvlak" x="${getal((breedte - b) / 2)}" y="${getal((hoogte - h) / 2)}" ` +
    `width="${getal(b)}" height="${getal(h)}" fill="none" pointer-events="all"/>`
  );
}

function elementSvg(element: SchemaElement, metRaakvlak = false): string {
  switch (element.soort) {
    case "symbool":
      return (
        `<g data-node-id="${escapeXml(element.nodeId)}" transform="translate(${getal(element.x)} ${getal(element.y)})">` +
        `${metRaakvlak ? raakvlakSvg(element.symbool.maat.breedte, element.symbool.maat.hoogte) : ""}${element.symbool.svg}</g>`
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
      // The pair identifier sits below the rail. Extending the page label horizontally can
      // collide with the first circuit letter beside the left continuation.
      const paar = element.verbindingsnummer === undefined ? "" : tekstSvg(
        "vervolg", element.x - richting * (PIJL_LENGTE_MM + 0.5), element.y + 3.5,
        PIJL_TEKST_MM, element.richting === "rechts" ? "end" : "start", `#${element.verbindingsnummer}`,
      );
      return `<g class="vervolg">${pijl}${label}${paar}</g>`;
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
  const maat = papierMaat(papier.formaat, papier.orientatie);
  const ruimte = bruikbaar(papier);
  const marge = getal(papier.marge_mm);
  // Naar beneden afgerond op 2 decimalen: een afgeronde schaal mag de hoogte nooit overschrijden.
  const schaal = getal(Math.floor(pagina.schaal * 100 + 1e-9) / 100);

  // Uniek per pagina, zodat meerdere pagina's samen in één HTML-document kunnen staan.
  const clipId = `schema-inhoud-${paginaIndex}`;
  const clip =
    `<clipPath id="${clipId}"><rect x="${marge}" y="${marge}" ` +
    `width="${getal(ruimte.breedte)}" height="${getal(ruimte.hoogte)}"/></clipPath>`;
  const inhoud = pagina.elementen.map((element) => elementSvg(element)).join("");
  return root(
    maat.breedte,
    maat.hoogte,
    `${clip}<g clip-path="url(#${clipId})"><g transform="translate(${marge} ${marge}) scale(${schaal}) ` +
      `translate(${getal(-pagina.xVan)} ${getal(-(pagina.yVan ?? 0))})">${inhoud}</g></g>`,
  );
}

/**
 * De hele strook op schaal 1, zonder clip, voor de editor. Elk symbool krijgt een onzichtbaar
 * raakvlak, zodat selecteren geen mikken op de lijnen vraagt; de afdruk heeft er geen.
 */
export function schemaStripSvg(opmaak: SchemaOpmaak): string {
  const { strook } = opmaak;
  return root(strook.breedte, strook.hoogte, strook.elementen.map((element) => elementSvg(element, true)).join(""));
}
