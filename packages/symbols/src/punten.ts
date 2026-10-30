import type { NodeVan, Toestelsoort } from "@elentrik/model";
import { cirkel, getal, lijn, pad, rechthoek, tekst } from "./svg";
import type { Symbool } from "./types";

/** Afkorting in het toestelsymbool, per soort. */
export const TOESTEL_AFKORTINGEN: Readonly<Record<Toestelsoort, string>> = {
  wasmachine: "WM",
  droogkast: "DK",
  vaatwasser: "VW",
  kookplaat: "KP",
  oven: "OV",
  boiler: "B",
  warmtepomp: "WP",
  laadpaal: "LP",
  omvormer: "OMV",
  andere: "T",
};

/** Het vermenigvuldigingsteken U+00D7. */
const KEER = "×";
/** Tekstgrootte van het aantal links naast een symbool, in mm. */
const AANTAL_GROOTTE_MM = 2;
/** Afstand tussen de rechterrand van de aantaltekst en de linkerrand van het symbool, in mm. */
const AANTAL_X_MM = 3.4;

function punten(...coordinaten: Array<[number, number]>): string {
  return coordinaten.map(([x, y], i) => `${i === 0 ? "M" : "L"}${getal(x)} ${getal(y)}`).join(" ") + " Z";
}

/** Het aantal als tekst; `y` is de basislijn. Leeg bij 1 stuk. */
function aantalTekst(aantal: number, y: number): string {
  return aantal > 1
    ? tekst(AANTAL_X_MM, y, `${aantal}${KEER}`, { anker: "end", grootte: AANTAL_GROOTTE_MM, data: { rol: "aantal" } })
    : "";
}

/**
 * De letter "h" van half-waterdicht, waterdicht en hermetisch (AREI tabel 2.23, F). `x` is de
 * linkerkant en `y` de basislijn. Rechtop, zoals alle tekst.
 */
export function letterH(x: number, y: number): string {
  return tekst(x, y, "h", { anker: "start", grootte: 2.5, data: { rol: "waterdicht" } });
}

/**
 * Contactdoos volgens F in AREI tabel 2.23, 14 × 10 mm. De voeding komt van onder (`in`) en raakt
 * de bolle kant van een halve cirkel (r = 3); de boog opent naar boven, naar `uit`, en de lijn loopt
 * door de boog tot `uit`.
 * - randaarde: een streep tegen de bolle kant, breder dan de boog;
 * - kinderbeveiliging: een voetje aan elk uiteinde van de boog, naar buiten;
 * - waterdicht: de letter h rechts van de boog;
 * - aantal > 1: een klein schuin streepje over de boog en het getal ernaast.
 */
export function tekenContactdoos(node: NodeVan<"contactdoos">): Symbool {
  const breedte = 14;
  const hoogte = 10;
  const x = breedte / 2;
  const r = 3;
  // De uiteinden van de boog liggen op `eindY`, de top (bolle kant, het dichtst bij `in`) r lager.
  const eindY = 4;
  const topY = eindY + r;
  let svg =
    lijn(x, hoogte, x, 0) +
    // Sweep 0: van links naar rechts onderlangs, dus de bolle kant wijst naar `in` en de boog opent naar `uit`.
    pad(`M${getal(x - r)} ${getal(eindY)} A${getal(r)} ${getal(r)} 0 0 0 ${getal(x + r)} ${getal(eindY)}`);
  if (node.randaarde) svg += lijn(x - r - 1, topY, x + r + 1, topY, { data: { rol: "randaarde" } });
  if (node.kinderbeveiliging) {
    svg +=
      lijn(x - r, eindY, x - r - 1.2, eindY, { data: { rol: "kinderbeveiliging" } }) +
      lijn(x + r, eindY, x + r + 1.2, eindY, { data: { rol: "kinderbeveiliging" } });
  }
  if (node.waterdicht) svg += letterH(x + r + 1.6, eindY + 1.5);
  if (node.aantal > 1) {
    // Het streepje staat op de straal die 40° onder de horizontaal naar rechts wijst en kruist de
    // boog daar haaks; het getal staat erboven en erachter.
    const hoek = (40 * Math.PI) / 180;
    const [c, s] = [Math.cos(hoek), Math.sin(hoek)];
    svg +=
      lijn(x + (r - 0.8) * c, eindY + (r - 0.8) * s, x + (r + 0.8) * c, eindY + (r + 0.8) * s, {
        data: { rol: "aantal-streep" },
      }) +
      tekst(x + r + 0.4, eindY - 1.4, String(node.aantal), {
        anker: "start",
        grootte: AANTAL_GROOTTE_MM,
        data: { rol: "aantal" },
      });
  }
  return { maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } }, svg };
}

/**
 * Lichtpunt volgens G in AREI tabel 2.23, 14 × 10 mm: een kruis (×) aan het einde van de
 * toevoerleiding, zonder cirkel. De leiding loopt van `in` door het snijpunt van het kruis tot
 * `uit`; bij de projector loopt ze niet door de lamp, maar eindigt ze aan de onderkant van de
 * cirkel en begint ze weer aan de bovenkant. De soort verandert het kruis:
 * - "tl": het fluorescentietoestel, een lijn dwars op de leiding met een streepje aan beide
 *   uiteinden, zonder kruis;
 * - "spot": de projector, een kruis in een cirkel (⊗) met een boog aan de kant van `in`;
 * - "noodverlichting": het veiligheidsverlichtingstoestel, een kruis met een gevulde stip;
 * - "led": een kruis met de tekst "LED" (staat niet in de tabel).
 * Het aantal komt als tekst "n×" links van het symbool.
 */
export function tekenLichtpunt(node: NodeVan<"lichtpunt">): Symbool {
  const breedte = 14;
  const hoogte = 10;
  const x = breedte / 2;
  const cy = 5;
  /** Halve armlengte van het kruis en straal van de cirkel van de projector, in mm. */
  const arm = 2.5;
  // Eén doorlopende leiding van `in` naar `uit`; de projector vervangt ze door twee stukken.
  let svg = node.soort === "spot" ? "" : lijn(x, hoogte, x, 0);
  /** De twee diagonalen van het kruis, met halve armlengte `a` rond (x, cy). */
  const kruis = (a: number) =>
    lijn(x - a, cy + a, x + a, cy - a, { data: { rol: "kruis" } }) +
    lijn(x - a, cy - a, x + a, cy + a, { data: { rol: "kruis" } });
  switch (node.soort) {
    case "tl": {
      // Een lijn van 6 mm dwars op de leiding, met een streepje van 2 mm aan elk uiteinde.
      const half = 3;
      svg +=
        lijn(x - half, cy, x + half, cy, { data: { rol: "tl" } }) +
        lijn(x - half, cy - 1, x - half, cy + 1, { data: { rol: "tl-einde" } }) +
        lijn(x + half, cy - 1, x + half, cy + 1, { data: { rol: "tl-einde" } });
      break;
    }
    case "spot": {
      // De cirkel met het kruis tot op de rand en zonder leiding erin: de leiding raakt de cirkel
      // aan de onderkant en loopt vanaf de bovenkant verder. De boog (r = 3,6) is een stuk van 110°
      // rond hetzelfde middelpunt, onderlangs aan de kant van `in` (sweep 0, van links naar rechts);
      // de leiding kruist hem.
      const r = arm;
      const boogR = 3.6;
      const hoek = (55 * Math.PI) / 180;
      const dx = boogR * Math.sin(hoek);
      const dy = boogR * Math.cos(hoek);
      svg +=
        lijn(x, hoogte, x, cy + r) +
        cirkel(x, cy, r) +
        lijn(x, cy - r, x, 0) +
        kruis(r * Math.SQRT1_2) +
        pad(
          `M${getal(x - dx)} ${getal(cy + dy)} A${getal(boogR)} ${getal(boogR)} 0 0 0 ${getal(x + dx)} ${getal(cy + dy)}`,
          { data: { rol: "projector" } },
        );
      break;
    }
    case "led":
      // Basislijn cy + 0,6: de tekst (1,8 mm) staat rechtop naast het kruis.
      svg += kruis(arm) + tekst(x + 3, cy + 0.6, "LED", { anker: "start", grootte: 1.8 });
      break;
    case "noodverlichting":
      svg += kruis(arm) + cirkel(x, cy, 0.8, { gevuld: true, data: { rol: "nood" } });
      break;
    case "standaard":
    case undefined:
      svg += kruis(arm);
      break;
  }
  svg += aantalTekst(node.aantal, cy + 0.8);
  return { maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } }, svg };
}

/** Lengte van het streepje van een haak, in mm. */
const HAAK_MM = 1;

/**
 * Een haak: een kort streepje aan het uiteinde (x2, y2) van een hendel die in (x1, y1) begint,
 * haaks op de hendel en naar buiten gericht, dus weg van de verticale lijn door de cirkel, aan de
 * kant van de hendel (AREI tabel 2.23, E).
 */
function haak(x1: number, y1: number, x2: number, y2: number): string {
  const lengte = Math.hypot(x2 - x1, y2 - y1);
  const dx = (x2 - x1) / lengte;
  const dy = (y2 - y1) / lengte;
  // Twee haakse richtingen; kies die aan dezelfde kant als de hendel wijst.
  const [px, py] = dy * dx > 0 ? [dy, -dx] : [-dy, dx];
  return lijn(x2, y2, x2 + px * HAAK_MM, y2 + py * HAAK_MM, { data: { rol: "haak" } });
}

/**
 * Schakelaar volgens E in AREI tabel 2.23, 14 × 12 mm: een cirkel (r = 2) met een of meer hendels,
 * zonder dat de hendels de leiding raken. De leiding loopt van `in` naar de cirkel en van de
 * cirkel verder naar `uit`. Een hendel begint op de rand van de cirkel en wijst schuin van de
 * voeding weg (hier naar rechtsboven), onder 35° met de verticale lijn. Een haak is een streepje
 * haaks op het uiteinde van de hendel. De soort bepaalt de hendels:
 * - "enkel": het algemene symbool, één hendel zonder haak;
 * - "dubbel": de eenpolige omschakelaar (dubbele aansteking), twee hendels in een V naar `uit`,
 *   elk met een haak;
 * - "wissel": de eenpolige wisselschakelaar, twee hendels in tegengestelde richting (rechtsboven
 *   en linksonder), elk met een haak;
 * - "kruis": de kruisschakelaar, vier hendels in een X, elk met een haak;
 * - "dimmer": één hendel met een klein open driehoekje (vlag) op het uiteinde;
 * - "drukknop": een cirkel in een cirkel, zonder hendel.
 * Waterdicht is de letter h rechts naast het symbool.
 */
export function tekenSchakelaar(node: NodeVan<"schakelaar">): Symbool {
  const breedte = 14;
  const hoogte = 12;
  const x = breedte / 2;
  const cy = 6;
  const r = 2;
  /** Hoek van de hendels met de verticale lijn en lengte van de hendel buiten de cirkel, in mm. */
  const hoek = (35 * Math.PI) / 180;
  const buiten = 3.5;
  const [s, c] = [Math.sin(hoek), Math.cos(hoek)];
  /**
   * Hendel vanaf de cirkelrand in richting (zx, zy): zx = 1 naar rechts, -1 naar links; zy = -1
   * naar boven, 1 naar onder. Met `metHaak` komt er een haak op het uiteinde.
   */
  const hendel = (zx: 1 | -1, zy: 1 | -1, metHaak: boolean) => {
    const [dx, dy] = [zx * s, zy * c];
    const [x1, y1, x2, y2] = [x + r * dx, cy + r * dy, x + (r + buiten) * dx, cy + (r + buiten) * dy];
    return lijn(x1, y1, x2, y2, { data: { rol: "hendel" } }) + (metHaak ? haak(x1, y1, x2, y2) : "");
  };
  let svg = lijn(x, hoogte, x, cy + r) + cirkel(x, cy, r);
  svg += lijn(x, cy - r, x, 0);
  switch (node.soort) {
    case "enkel":
      svg += hendel(1, -1, false);
      break;
    case "dubbel":
      svg += hendel(-1, -1, true) + hendel(1, -1, true);
      break;
    case "wissel":
      svg += hendel(1, -1, true) + hendel(-1, 1, true);
      break;
    case "kruis":
      svg += hendel(1, -1, true) + hendel(-1, 1, true) + hendel(-1, -1, true) + hendel(1, 1, true);
      break;
    case "dimmer": {
      // Het vlagje is een driehoek met één zijde langs het eind van de hendel (1,8 mm) en de punt 1,1 mm opzij.
      const [dx, dy] = [s, -c];
      const [ex, ey] = [x + (r + buiten) * dx, cy + (r + buiten) * dy];
      const basis: [number, number] = [ex - 1.8 * dx, ey - 1.8 * dy];
      const punt: [number, number] = [ex - 0.9 * dx - 1.1 * dy, ey - 0.9 * dy + 1.1 * dx];
      svg += hendel(1, -1, false) + pad(punten([ex, ey], basis, punt), { data: { rol: "vlag" } });
      break;
    }
    case "drukknop":
      svg += cirkel(x, cy, 1.1);
      break;
  }
  if (node.waterdicht) svg += letterH(x + r + 1.6, cy + 1.2);
  return { maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } }, svg };
}

/**
 * Toestel: een vierkant van 10 × 10 mm met de afkorting van de soort erin, met aansluitlijntjes
 * onder (`in`) en boven (`uit`). 12 × 12 mm.
 */
export function tekenToestel(node: NodeVan<"toestel">): Symbool {
  const breedte = 12;
  const hoogte = 12;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } },
    svg:
      lijn(x, hoogte, x, hoogte - 1) +
      rechthoek(1, 1, 10, 10) +
      lijn(x, 1, x, 0) +
      tekst(x, 7.1, TOESTEL_AFKORTINGEN[node.soort], { anker: "middle", grootte: 3 }),
  };
}
