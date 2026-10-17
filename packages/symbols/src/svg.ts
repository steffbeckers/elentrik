import { LIJNDIKTE_MM, TEKSTGROOTTE_MM } from "./types";

/** Extra `data-*` attributen; sleutels zonder het voorvoegsel `data-`. */
export type DataAttributen = Readonly<Record<string, string>>;

type MetData = { data?: DataAttributen };

const MAX_ABS = 1e15;
const DATA_SLEUTEL = /^[a-z][a-z-]*$/;
// Bewust ` \t\n\r` in plaats van `\s`: `\s` laat ook U+000B/U+000C en Unicode-spaties toe,
// en die zijn deels ongeldig in XML 1.0.
const PAD_TEKENS = /^[0-9MmLlHhVvCcSsQqTtAaZz., \t\n\r+\-eE]*$/;

/**
 * Rondt af op maximaal 2 decimalen, "half weg van nul" (2.005 wordt "2.01", -2.005 wordt "-2.01").
 * `Math.round(n * 100)` geeft door floating point 2.00 voor 2.005; daarom wordt het getal als
 * decimale string met exponent 2 verschoven (`"2.005e2"` is exact 200.5). Het resultaat gaat via
 * `String()`, dus zonder afsluitende nullen en nooit met `-0`. Alles onder 0.005 wordt "0"
 * (ook om exponentschrijfwijze bij zeer kleine getallen te vermijden). `NaN`, `Infinity` en
 * waarden vanaf 1e15 gooien een `RangeError`: coördinaten worden nooit zo groot, en `String()`
 * zou daar exponentschrijfwijze geven.
 */
export function getal(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError(`Geen eindig getal: ${n}`);
  const abs = Math.abs(n);
  if (abs >= MAX_ABS) throw new RangeError(`Getal te groot voor SVG-uitvoer: ${n}`);
  if (abs < 0.005) return "0";
  const afgerond = Math.round(Number(`${abs}e2`)) / 100;
  return n < 0 ? `-${afgerond}` : String(afgerond);
}

/**
 * Tekens die in XML 1.0 niet mogen voorkomen: C0-besturingstekens behalve tab, LF en CR,
 * losse surrogaten (met de `u`-vlag matcht `\p{Surrogate}` alleen een los surrogaat, geldige
 * paren zoals emoji blijven één teken) en U+FFFE/U+FFFF.
 */
const ONGELDIG_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|\p{Surrogate}/gu;

/**
 * Verwijdert eerst de tekens die in XML 1.0 ongeldig zijn (anders wordt de hele SVG onleesbaar,
 * bijvoorbeeld door een verticale tab uit geplakte Word-tekst) en escapet daarna `&`, `<`, `>`,
 * `"` en `'` voor gebruik in XML-tekst en -attributen.
 */
export function escapeXml(tekst: string): string {
  return tekst
    .replace(ONGELDIG_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dataAttributen(data: DataAttributen | undefined): string {
  if (!data) return "";
  let uit = "";
  for (const [sleutel, waarde] of Object.entries(data)) {
    if (!DATA_SLEUTEL.test(sleutel)) throw new RangeError(`Ongeldige data-sleutel: "${sleutel}"`);
    uit += ` data-${sleutel}="${escapeXml(waarde)}"`;
  }
  return uit;
}

function lijnstijl(vulling: "none" | "currentColor" = "none"): string {
  return `stroke="currentColor" stroke-width="${getal(LIJNDIKTE_MM)}" fill="${vulling}"`;
}

/** `<line>`; attributen: x1 y1 x2 y2, stroke, stroke-width, fill, daarna data-*. */
export function lijn(x1: number, y1: number, x2: number, y2: number, opties?: MetData): string {
  return `<line x1="${getal(x1)}" y1="${getal(y1)}" x2="${getal(x2)}" y2="${getal(y2)}" ${lijnstijl()}${dataAttributen(opties?.data)}/>`;
}

/** `<circle>`; met `gevuld` is `fill="currentColor"`. */
export function cirkel(cx: number, cy: number, r: number, opties?: MetData & { gevuld?: boolean }): string {
  const vulling = opties?.gevuld ? "currentColor" : "none";
  return `<circle cx="${getal(cx)}" cy="${getal(cy)}" r="${getal(r)}" ${lijnstijl(vulling)}${dataAttributen(opties?.data)}/>`;
}

/** `<rect>`; attributen: x y width height, daarna de lijnstijl. */
export function rechthoek(x: number, y: number, b: number, h: number, opties?: MetData): string {
  return `<rect x="${getal(x)}" y="${getal(y)}" width="${getal(b)}" height="${getal(h)}" ${lijnstijl()}${dataAttributen(opties?.data)}/>`;
}

/**
 * `<path>`; met `gevuld` is `fill="currentColor"`. `d` wordt niet geëscaped: de aanroeper mag er
 * uitsluitend numerieke padgegevens in zetten (opdrachtletters, getallen uit `getal()`, spaties).
 * Dat wordt afgedwongen: elk ander teken geeft een `RangeError`.
 */
export function pad(d: string, opties?: MetData & { gevuld?: boolean }): string {
  if (!PAD_TEKENS.test(d)) throw new RangeError(`Ongeldige tekens in padgegevens: "${d}"`);
  const vulling = opties?.gevuld ? "currentColor" : "none";
  return `<path d="${d}" ${lijnstijl(vulling)}${dataAttributen(opties?.data)}/>`;
}

/** `<text>`; de inhoud wordt geëscaped. */
export function tekst(
  x: number,
  y: number,
  inhoud: string,
  opties?: MetData & { grootte?: number; anker?: "start" | "middle" | "end" },
): string {
  const grootte = opties?.grootte ?? TEKSTGROOTTE_MM;
  const anker = opties?.anker ?? "start";
  return `<text x="${getal(x)}" y="${getal(y)}" font-size="${getal(grootte)}" text-anchor="${anker}" font-family="sans-serif" fill="currentColor"${dataAttributen(opties?.data)}>${escapeXml(inhoud)}</text>`;
}
