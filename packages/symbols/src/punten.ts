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
/** Zijde van de driehoek voor "waterdicht" en afstand tot de rand van het vak, in mm. */
const DRIEHOEK_MM = 1.6;
const DRIEHOEK_RAND_MM = 0.4;

function punten(...coordinaten: Array<[number, number]>): string {
  return coordinaten.map(([x, y], i) => `${i === 0 ? "M" : "L"}${getal(x)} ${getal(y)}`).join(" ") + " Z";
}

/**
 * Kleine gevulde driehoek rechtsonder in een vak van `breedte` × `hoogte` mm, dichtbij `in`. De
 * driehoek is een markering en blijft net als tekst rechtop: de punt wijst omhoog.
 */
function waterdichtDriehoek(breedte: number, hoogte: number): string {
  const rechts = breedte - DRIEHOEK_RAND_MM;
  const boven = hoogte - DRIEHOEK_RAND_MM - DRIEHOEK_MM;
  return pad(
    punten(
      [rechts - DRIEHOEK_MM / 2, boven],
      [rechts, boven + DRIEHOEK_MM],
      [rechts - DRIEHOEK_MM, boven + DRIEHOEK_MM],
    ),
    { gevuld: true, data: { rol: "waterdicht" } },
  );
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
 * Lichtpunt: een cirkel (r = 3) met een kruis erin en een geleider van `in` onderaan naar `uit`
 * bovenaan. De soort voegt iets toe rechts van die geleider, boven de cirkel ("led": tekst, "tl":
 * balk, "spot": driehoek) of in het midden ("noodverlichting": gevulde stip). 14 × 10 mm.
 */
export function tekenLichtpunt(node: NodeVan<"lichtpunt">): Symbool {
  const breedte = 14;
  const hoogte = 10;
  const x = breedte / 2;
  const cy = 5;
  const r = 3;
  const k = r * Math.SQRT1_2;
  let svg =
    lijn(x, hoogte, x, cy + r) +
    cirkel(x, cy, r) +
    lijn(x, cy - r, x, 0) +
    lijn(x - k, cy + k, x + k, cy - k) +
    lijn(x - k, cy - k, x + k, cy + k);
  switch (node.soort) {
    case "led":
      // Basislijn 1,46: de tekst (1,8 mm) staat rechtop in de ruimte boven de cirkel.
      svg += tekst(x + 1, 1.46, "LED", { anker: "start", grootte: 1.8 });
      break;
    case "tl":
      svg += rechthoek(x + 1.2, 0.6, 3.8, 0.8);
      break;
    case "spot":
      // De punt van de driehoek wijst net als de tekst omhoog.
      svg += pad(punten([x + 3.75, 0.2], [x + 5, 1.7], [x + 2.5, 1.7]));
      break;
    case "noodverlichting":
      svg += cirkel(x, cy, 0.8, { gevuld: true });
      break;
    case "standaard":
    case undefined:
      break;
  }
  svg += aantalTekst(node.aantal, cy + 0.8);
  return { maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } }, svg };
}

/**
 * Schakelaar: een cirkel (r = 2) met een schuine hendel naar rechtsonder (naar `in` toe). "dubbel"
 * heeft een tweede, parallelle hendel, "wissel" een hendel in beide richtingen, "kruis" een hendel
 * in vier richtingen, "dimmer" een pijltje naast de hendel en "drukknop" een dwarsstreepje op de
 * hendel. 12 × 10 mm.
 */
export function tekenSchakelaar(node: NodeVan<"schakelaar">): Symbool {
  const breedte = 12;
  const hoogte = 10;
  const x = breedte / 2;
  const cy = 4;
  const r = 2;
  const d = r * Math.SQRT1_2;
  const hendel = (x1: number, y1: number, x2: number, y2: number) => lijn(x1, y1, x2, y2, { data: { rol: "hendel" } });
  // Hendel vanaf de rand van de cirkel, onder 45 graden naar rechtsonder.
  const rechtsonder = hendel(x + d, cy + d, x + d + 2, cy + d + 2);
  let svg = lijn(x, hoogte, x, cy + r) + cirkel(x, cy, r) + lijn(x, cy - r, x, 0);
  switch (node.soort) {
    case "enkel":
      svg += rechtsonder;
      break;
    case "dubbel": {
      const hoek = (70 * Math.PI) / 180;
      const x1 = x + r * Math.cos(hoek);
      const y1 = cy + r * Math.sin(hoek);
      svg += rechtsonder + hendel(x1, y1, x1 + 2.4, y1 + 2.4);
      break;
    }
    case "wissel":
      svg += rechtsonder + hendel(x - d, cy + d, x - d - 2, cy + d + 2);
      break;
    case "kruis":
      svg +=
        rechtsonder +
        hendel(x - d, cy + d, x - d - 2, cy + d + 2) +
        hendel(x + d, cy - d, x + d + 2, cy - d - 2) +
        hendel(x - d, cy - d, x - d - 2, cy - d - 2);
      break;
    case "dimmer":
      svg +=
        rechtsonder +
        lijn(7.6, 1.4, 10.6, 4.4, { data: { rol: "pijl" } }) +
        lijn(10.6, 4.4, 9.6, 4.4, { data: { rol: "pijl" } }) +
        lijn(10.6, 4.4, 10.6, 3.4, { data: { rol: "pijl" } });
      break;
    case "drukknop":
      svg += rechtsonder + lijn(x + d + 1, cy + d + 2, x + d + 3, cy + d + 2, { data: { rol: "knop" } });
      break;
  }
  if (node.waterdicht) svg += waterdichtDriehoek(breedte, hoogte);
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
