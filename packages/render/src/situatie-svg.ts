import { escapeXml, getal, type Symbool } from "@elentrik/symbols";
import { zonderAantallen } from "./aantallen";

/** Eén geplaatst symbool op het plan: positie en rotatie in rasterpixels en graden. */
export type SituatieItem = {
  nodeId: string;
  symbool: Symbool;
  x: number;
  y: number;
  rotatie: number;
  label: string;
  symboolGrootte_px?: number;
  labelGrootte_px?: number;
  labelOffset?: { x: number; y: number };
  /** Alleen print: een expliciet aantal op een tweede, ongedraaide labelregel. */
  aantalLabel?: string;
  /** Alleen print: houd het label buiten een vergroot of gedraaid symbool. */
  labelBuitenSymbool?: boolean;
};

/** Label-offset en tekstgrootte, als fractie van de symboolgrootte in pixels. */
const LABEL_X = 0.6;
const LABEL_Y = 0.15;
const LABEL_GROOTTE = 0.45;

/** De schaal met 4 decimalen: bij een rasterfoto van duizenden pixels telt een tweede decimaal te grof. */
function schaalGetal(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`Geen eindig getal: ${n}`);
  const afgerond = Math.round(Number(`${Math.abs(n)}e4`)) / 1e4;
  return afgerond === 0 ? "0" : n < 0 ? `-${afgerond}` : String(afgerond);
}

function itemSvg(item: SituatieItem, grootte_px: number): string {
  grootte_px = item.symboolGrootte_px ?? grootte_px;
  const { breedte, hoogte } = item.symbool.maat;
  const lang = Math.max(breedte, hoogte);
  // Een symbool zonder afmetingen (lang <= 0) kan niet geschaald worden; geen NaN/Infinity in de uitvoer.
  const schaal = lang > 0 ? grootte_px / lang : 1;
  const symbool =
    `<g transform="rotate(${getal(item.rotatie)}) scale(${schaalGetal(schaal)}) ` +
    `translate(${getal(-breedte / 2)} ${getal(-hoogte / 2)})">${item.aantalLabel ? zonderAantallen(item.symbool.svg) : item.symbool.svg}</g>`;
  const rad = item.rotatie * Math.PI / 180;
  const halfBreedte = schaal * (Math.abs(Math.cos(rad)) * breedte + Math.abs(Math.sin(rad)) * hoogte) / 2;
  const gekozenX = grootte_px * LABEL_X + (item.labelOffset?.x ?? 0);
  const labelY = grootte_px * LABEL_Y + (item.labelOffset?.y ?? 0);
  const font = item.labelGrootte_px ?? grootte_px * LABEL_GROOTTE;
  const labelX = item.labelBuitenSymbool
    ? gekozenX < 0 ? Math.min(gekozenX, -halfBreedte - font * .2) : Math.max(gekozenX, halfBreedte + font * .2)
    : gekozenX;
  const labelAnker = item.labelBuitenSymbool && labelX < 0 ? "end" : "start";
  const label =
    `<text x="${getal(labelX)}" y="${getal(labelY)}" ` +
    `font-size="${getal(font)}" text-anchor="${labelAnker}" font-family="sans-serif" ` +
    `fill="currentColor">${escapeXml(item.label)}</text>`;
  const links = labelX < 0;
  const aantalX = links ? Math.min(labelX, -halfBreedte - font * .1) : Math.max(labelX, halfBreedte + font * .1);
  const aantal = item.aantalLabel
    ? `<text class="tekst-aantal" x="${getal(aantalX)}" y="${getal(labelY + font * 1.3)}" font-size="${getal(font)}" text-anchor="${links ? "end" : "start"}" font-family="sans-serif" fill="currentColor">${escapeXml(item.aantalLabel)}</text>`
    : "";
  // Onzichtbaar raakvlak: ook de lege ruimte binnen het symbool is aanwijsbaar. Het staat in de
  // groep, zodat `closest("[data-node-id]")` het vindt, en tekent niets (ook niet in een export).
  const hoek = getal(-grootte_px / 2);
  const raakvlak =
    `<rect x="${hoek}" y="${hoek}" width="${getal(grootte_px)}" height="${getal(grootte_px)}" ` +
    `fill="none" pointer-events="all"/>`;
  return (
    `<g data-node-id="${escapeXml(item.nodeId)}" transform="translate(${getal(item.x)} ${getal(item.y)})">` +
    `${raakvlak}${symbool}${label}${aantal}</g>`
  );
}

/**
 * De symbolen van het situatieschema als inhoud van een `<g>` in rasterpixels. Elk symbool wordt
 * geschaald zodat zijn lange zijde `grootte_px` pixels meet, rond zijn middelpunt gedraaid; het
 * label draait niet mee.
 */
export function situatieLaagSvg(items: readonly SituatieItem[], grootte_px: number): string {
  return items.map((item) => itemSvg(item, grootte_px)).join("");
}
