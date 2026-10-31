import type { NodeVan } from "@elentrik/model";
import { cirkel, getal, lijn, pad, rechthoek, tekst } from "./svg";
import type { Symbool } from "./types";

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

/** Rol van de pictogramelementen in een toestel; het vierkant en de aansluitlijntjes hebben geen rol. */
const PICTO = { data: { rol: "picto" } } as const;

/**
 * Toestel volgens G en H in AREI tabel 2.23, 12 × 12 mm: een vierkant van 10 × 10 mm (het vaste
 * elektrische huishoudtoestel, algemeen symbool) met aansluitlijntjes onder (`in`) en boven
 * (`uit`) en het pictogram van de soort erin. Elk pictogramelement heeft de rol "picto". Een
 * pictogram heeft geen tekst, op de warmtepomp na (staat niet in de tabel):
 * - "andere": leeg, het algemene symbool;
 * - "wasmachine": een cirkel met een gevulde stip;
 * - "droogkast": een ∞ bovenaan en een gevulde stip eronder;
 * - "vaatwasser": de twee diagonalen met een cirkel in het midden;
 * - "kookplaat": drie gevulde stippen, twee boven en één rechtsonder;
 * - "oven": een band bovenaan en een gevulde stip in het midden;
 * - "boiler": geen vierkant maar een cirkel met verticale arcering;
 * - "laadpaal": de laadinrichting voor elektrische wegvoertuigen, vereenvoudigd tot een zuil met
 *   schermpje en voet en een kabel met stekker (geen vierkant);
 * - "omvormer": de omvormer DC → AC (H): een diagonaal van linksonder naar rechtsboven, linksboven
 *   het gelijkstroomteken (volle lijn boven een stippellijn) en rechtsonder het wisselstroomteken;
 * - "warmtepomp": de tekst "WP".
 */
export function tekenToestel(node: NodeVan<"toestel">): Symbool {
  const breedte = 12;
  const hoogte = 12;
  const x = breedte / 2;
  /** Het midden van het vierkant. */
  const y = hoogte / 2;
  const maat = { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } };
  /** Het vierkant van het algemene symbool, met aansluitlijntjes van 1 mm onder en boven. */
  const vierkant = lijn(x, hoogte, x, hoogte - 1) + rechthoek(1, 1, 10, 10) + lijn(x, 1, x, 0);
  /** Gevulde stip met straal 1,2 mm; `r` kan kleiner. */
  const stip = (cx: number, cy: number, r = 1.2) => cirkel(cx, cy, r, { gevuld: true, ...PICTO });
  switch (node.soort) {
    case "andere":
      return { maat, svg: vierkant };
    case "wasmachine":
      return { maat, svg: vierkant + cirkel(x, y, 3.8, PICTO) + stip(x, y, 1.3) };
    case "droogkast": {
      // De ∞ is de omtrek van twee elkaar overlappende cirkels (r = 1,25, middelpunten 1,1 mm links
      // en rechts van het midden): twee grote bogen tussen de twee snijpunten, boven en onder het midden.
      const cy = 4.3;
      const [r, s] = [1.25, Math.sqrt(1.25 ** 2 - 1.1 ** 2)];
      return {
        maat,
        svg:
          vierkant +
          pad(
            `M${getal(x)} ${getal(cy - s)} A${getal(r)} ${getal(r)} 0 1 0 ${getal(x)} ${getal(cy + s)} A${getal(r)} ${getal(r)} 0 1 0 ${getal(x)} ${getal(cy - s)} Z`,
            PICTO,
          ) +
          stip(x, 7.6),
      };
    }
    case "vaatwasser":
      return {
        maat,
        svg:
          vierkant +
          lijn(1, 11, 11, 1, PICTO) +
          lijn(1, 1, 11, 11, PICTO) +
          cirkel(x, y, 2, PICTO),
      };
    case "kookplaat":
      return { maat, svg: vierkant + stip(3.7, 3.7) + stip(8.3, 3.7) + stip(8.3, 8.3) };
    case "oven":
      return { maat, svg: vierkant + lijn(1, 3, 11, 3, PICTO) + stip(x, 7.2) };
    case "boiler": {
      // Een cirkel (r = 5) met negen verticale lijnen, 1 mm van elkaar, tot op de rand.
      const r = 5;
      let arcering = "";
      for (let dx = -4; dx <= 4; dx++) {
        const h = Math.sqrt(r * r - dx * dx);
        arcering += lijn(x + dx, y - h, x + dx, y + h, PICTO);
      }
      return { maat, svg: lijn(x, hoogte, x, hoogte - 1) + cirkel(x, y, r) + arcering + lijn(x, 1, x, 0) };
    }
    case "laadpaal":
      return {
        maat,
        svg:
          lijn(x, hoogte, x, 11) +
          // De voet, de zuil en het schermpje.
          rechthoek(1.5, 9.8, 8, 1.2, PICTO) +
          rechthoek(2.5, 2.5, 6, 7.3, PICTO) +
          rechthoek(3.5, 3.6, 4, 2.4, PICTO) +
          // De kabel uit de zijkant van de zuil, omhoog naar de stekker.
          lijn(8.5, 8.2, 10.2, 8.2, PICTO) +
          lijn(10.2, 8.2, 10.2, 3.2, PICTO) +
          pad("M9.7 1.2 L10.7 1.2 L10.7 3.2 L9.7 3.2 Z", { gevuld: true, ...PICTO }) +
          lijn(x, 2.5, x, 0),
      };
    case "omvormer": {
      // Het wisselstroomteken: een sinus van twee halve cirkels (r = 0,8), rechtsonder.
      const [x0, y0, w] = [6.6, 8.6, 0.8];
      return {
        maat,
        svg:
          vierkant +
          lijn(1, 11, 11, 1, PICTO) +
          // Het gelijkstroomteken linksboven: een volle lijn boven een stippellijn.
          lijn(2.4, 3.6, 5.4, 3.6, PICTO) +
          lijn(2.4, 4.9, 5.4, 4.9, { streep: "0.7 0.5", ...PICTO }) +
          pad(
            `M${getal(x0)} ${getal(y0)} A${getal(w)} ${getal(w)} 0 0 1 ${getal(x0 + 2 * w)} ${getal(y0)} A${getal(w)} ${getal(w)} 0 0 0 ${getal(x0 + 4 * w)} ${getal(y0)}`,
            PICTO,
          ),
      };
    }
    case "warmtepomp":
      return { maat, svg: vierkant + tekst(x, 7.1, "WP", { anker: "middle", grootte: 3, ...PICTO }) };
  }
}
