import { XMLValidator } from "fast-xml-parser";
import type { Symbool } from "../src/index";

/** Diepe kopie via JSON (structuredClone is niet beschikbaar met lib ES2023 zonder DOM/Node-types). */
export function kloon<T>(waarde: T): T {
  return JSON.parse(JSON.stringify(waarde)) as T;
}

/** `true` als de SVG-inhoud van het symbool goedgevormde XML is. */
export function isGoedgevormd(symbool: Symbool): true | unknown {
  return XMLValidator.validate(`<svg xmlns="http://www.w3.org/2000/svg">${symbool.svg}</svg>`);
}

const GECONTROLEERDE_ELEMENTEN = new Set(["line", "circle", "rect", "text", "path"]);
/** Aantal getallen per opdracht van de toegelaten (absolute) padopdrachten. */
const PAD_ARGUMENTEN: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, A: 7, Z: 0 };

function attributen(tekst: string): Map<string, string> {
  const uit = new Map<string, string>();
  for (const [, naam, waarde] of tekst.matchAll(/([\w:-]+)="([^"]*)"/g)) uit.set(naam ?? "", waarde ?? "");
  return uit;
}

/** Eindpunten (x, y) van elke padopdracht; gooit bij opdrachten die we niet kunnen controleren. */
function padPunten(d: string): Array<[number, number]> {
  const punten: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  let opdracht = "";
  let argumenten: number[] = [];
  const sluit = () => {
    if (opdracht === "") return;
    const nodig = PAD_ARGUMENTEN[opdracht];
    if (nodig === undefined) throw new Error(`Niet-controleerbare padopdracht: ${opdracht}`);
    if (nodig === 0) {
      if (argumenten.length !== 0) throw new Error(`Getallen bij ${opdracht}`);
      return;
    }
    if (argumenten.length === 0 || argumenten.length % nodig !== 0) {
      throw new Error(`Verkeerd aantal getallen bij ${opdracht}: ${argumenten.length}`);
    }
    for (let i = 0; i < argumenten.length; i += nodig) {
      const blok = argumenten.slice(i, i + nodig);
      if (opdracht === "H") x = blok[0] ?? NaN;
      else if (opdracht === "V") y = blok[0] ?? NaN;
      else {
        x = blok[nodig - 2] ?? NaN;
        y = blok[nodig - 1] ?? NaN;
      }
      punten.push([x, y]);
    }
  };
  for (const [, letter, getal] of d.matchAll(/([A-Za-z])|(-?\d*\.?\d+(?:e[+-]?\d+)?)/g)) {
    if (letter !== undefined) {
      sluit();
      opdracht = letter;
      argumenten = [];
    } else {
      argumenten.push(Number(getal));
    }
  }
  sluit();
  return punten;
}

/**
 * Geeft een lijst met overtredingen (leeg = in orde) van de regel dat alle meetkunde van een
 * symbool binnen zijn vak `breedte × hoogte` ligt:
 * - `rect`: x ≥ 0, y ≥ 0, x + width ≤ breedte, y + height ≤ hoogte;
 * - `circle`: cx − r ≥ 0, cx + r ≤ breedte en hetzelfde voor y;
 * - `line`: beide eindpunten; `text`: het ankerpunt x/y; `path`: de eindpunten van elke opdracht
 *   (alleen absolute M, L, H, V, A en Z; de uitstulping van een boog wordt niet gemeten).
 * De lijndikte en de uitgestrektheid van tekstglyphs tellen bewust niet mee. Een element of
 * padopdracht die niet gecontroleerd kan worden, is zelf een overtreding, zodat niets stilzwijgend
 * wordt overgeslagen.
 */
export function buitenVak(symbool: Symbool): string[] {
  const { breedte, hoogte } = symbool.maat;
  const fouten: string[] = [];
  const binnen = (naam: string, x: number, y: number) => {
    if (!(x >= 0 && x <= breedte)) fouten.push(`${naam}: x=${x} valt buiten 0..${breedte}`);
    if (!(y >= 0 && y <= hoogte)) fouten.push(`${naam}: y=${y} valt buiten 0..${hoogte}`);
  };
  for (const [, naam] of symbool.svg.matchAll(/<([a-zA-Z][\w:-]*)/g)) {
    if (!GECONTROLEERDE_ELEMENTEN.has(naam ?? "")) fouten.push(`element <${naam}> wordt niet gecontroleerd`);
  }
  for (const [, element, tekst] of symbool.svg.matchAll(/<(line|circle|rect|text|path)\b([^>]*)>/g)) {
    const a = attributen(tekst ?? "");
    const n = (sleutel: string) => Number(a.get(sleutel) ?? NaN);
    switch (element) {
      case "line":
        binnen("line", n("x1"), n("y1"));
        binnen("line", n("x2"), n("y2"));
        break;
      case "text":
        binnen("text", n("x"), n("y"));
        break;
      case "circle":
        binnen("circle (min)", n("cx") - n("r"), n("cy") - n("r"));
        binnen("circle (max)", n("cx") + n("r"), n("cy") + n("r"));
        break;
      case "rect":
        binnen("rect (min)", n("x"), n("y"));
        binnen("rect (max)", n("x") + n("width"), n("y") + n("height"));
        break;
      case "path":
        try {
          for (const [px, py] of padPunten(a.get("d") ?? "")) binnen("path", px, py);
        } catch (fout) {
          fouten.push(`path: ${(fout as Error).message}`);
        }
        break;
    }
  }
  return fouten;
}

/**
 * Geeft een lijst met overtredingen (leeg = in orde) van de regel dat tekst rechtop staat: geen
 * `transform` of `scale(` ergens in het fragment, dus ook niet op of rond een `<text>`.
 */
export function nietRechtop(symbool: Symbool): string[] {
  const fouten: string[] = [];
  if (/transform/.test(symbool.svg)) fouten.push("transform in het fragment");
  if (/scale\(/.test(symbool.svg)) fouten.push("scale( in het fragment");
  return fouten;
}

const TOLERANTIE = 1e-9;

/**
 * `true` als een geleider van het symbool het punt bereikt: een `line`-eindpunt valt erop, of het
 * ligt op de rand van een `rect` of op een `circle`. Zo controleren we dat een keten
 * (`uit` van de ouder naar `in` van het kind) geen gat laat. Tekst en paden tellen niet mee.
 */
export function raakt(symbool: Symbool, punt: { x: number; y: number }): boolean {
  const { x, y } = punt;
  const gelijk = (a: number, b: number) => Math.abs(a - b) <= TOLERANTIE;
  for (const [, element, tekst] of symbool.svg.matchAll(/<(line|circle|rect)\b([^>]*)>/g)) {
    const a = attributen(tekst ?? "");
    const n = (sleutel: string) => Number(a.get(sleutel) ?? NaN);
    if (element === "line") {
      if ((gelijk(n("x1"), x) && gelijk(n("y1"), y)) || (gelijk(n("x2"), x) && gelijk(n("y2"), y))) return true;
    } else if (element === "circle") {
      if (gelijk(Math.hypot(x - n("cx"), y - n("cy")), n("r"))) return true;
    } else {
      const [x0, y0, x1, y1] = [n("x"), n("y"), n("x") + n("width"), n("y") + n("height")];
      const opLoodrecht = (gelijk(x, x0) || gelijk(x, x1)) && y >= y0 - TOLERANTIE && y <= y1 + TOLERANTIE;
      const opWaterpas = (gelijk(y, y0) || gelijk(y, y1)) && x >= x0 - TOLERANTIE && x <= x1 + TOLERANTIE;
      if (opLoodrecht || opWaterpas) return true;
    }
  }
  return false;
}
