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
 * Contactdoos: een halve cirkel (r = 3) met de open kant naar onder (naar `in`) en een verticale
 * lijn van het aansluitpunt onderaan door de boog tot `uit` bovenaan. 14 × 10 mm.
 */
export function tekenContactdoos(node: NodeVan<"contactdoos">): Symbool {
  const breedte = 14;
  const hoogte = 10;
  const x = breedte / 2;
  const r = 3;
  // De rand van de boog ligt 5 mm van `in`, de onderrand.
  const boogY = hoogte - 5;
  const boogTop = boogY - r;
  let svg =
    lijn(x, hoogte, x, boogTop) +
    lijn(x, boogTop, x, 0) +
    // Sweep 1: van links naar rechts over de bovenkant, dus de bolle kant wijst naar `uit`.
    pad(`M${getal(x - r)} ${getal(boogY)} A${getal(r)} ${getal(r)} 0 0 1 ${getal(x + r)} ${getal(boogY)}`);
  if (node.randaarde) svg += lijn(x - r, boogY + 1.5, x + r, boogY + 1.5, { data: { rol: "randaarde" } });
  if (node.kinderbeveiliging) {
    svg +=
      lijn(x - 1.6, boogY - 0.6, x - 0.8, boogY - 1.6, { data: { rol: "kinderbeveiliging" } }) +
      lijn(x + 1.6, boogY - 0.6, x + 0.8, boogY - 1.6, { data: { rol: "kinderbeveiliging" } });
  }
  if (node.waterdicht) svg += waterdichtDriehoek(breedte, hoogte);
  svg += aantalTekst(node.aantal, boogY - 1.5 + AANTAL_GROOTTE_MM * 0.7);
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
