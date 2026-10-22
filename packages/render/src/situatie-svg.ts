import { escapeXml, getal, type Symbool } from "@elentrik/symbols";

/** Eén geplaatst symbool op het plan: positie en rotatie in rasterpixels en graden. */
export type SituatieItem = {
  nodeId: string;
  symbool: Symbool;
  x: number;
  y: number;
  rotatie: number;
  label: string;
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
  const { breedte, hoogte } = item.symbool.maat;
  const lang = Math.max(breedte, hoogte);
  // Een symbool zonder afmetingen (lang <= 0) kan niet geschaald worden; geen NaN/Infinity in de uitvoer.
  const schaal = lang > 0 ? grootte_px / lang : 1;
  const symbool =
    `<g transform="rotate(${getal(item.rotatie)}) scale(${schaalGetal(schaal)}) ` +
    `translate(${getal(-breedte / 2)} ${getal(-hoogte / 2)})">${item.symbool.svg}</g>`;
  const label =
    `<text x="${getal(grootte_px * LABEL_X)}" y="${getal(grootte_px * LABEL_Y)}" ` +
    `font-size="${getal(grootte_px * LABEL_GROOTTE)}" text-anchor="start" font-family="sans-serif" ` +
    `fill="currentColor">${escapeXml(item.label)}</text>`;
  // Onzichtbaar raakvlak: ook de lege ruimte binnen het symbool is aanwijsbaar. Het staat in de
  // groep, zodat `closest("[data-node-id]")` het vindt, en tekent niets (ook niet in een export).
  const hoek = getal(-grootte_px / 2);
  const raakvlak =
    `<rect x="${hoek}" y="${hoek}" width="${getal(grootte_px)}" height="${getal(grootte_px)}" ` +
    `fill="none" pointer-events="all"/>`;
  return (
    `<g data-node-id="${escapeXml(item.nodeId)}" transform="translate(${getal(item.x)} ${getal(item.y)})">` +
    `${raakvlak}${symbool}${label}</g>`
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
