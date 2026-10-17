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

/** Kleine gevulde driehoek (punt omhoog) rechtsboven in een vak van `breedte` mm. */
function waterdichtDriehoek(breedte: number): string {
  const rechts = breedte - DRIEHOEK_RAND_MM;
  const boven = DRIEHOEK_RAND_MM;
  return pad(
    punten(
      [rechts - DRIEHOEK_MM / 2, boven],
      [rechts, boven + DRIEHOEK_MM],
      [rechts - DRIEHOEK_MM, boven + DRIEHOEK_MM],
    ),
    { gevuld: true, data: { rol: "waterdicht" } },
  );
}

function aantalTekst(aantal: number, y: number): string {
  return aantal > 1
    ? tekst(AANTAL_X_MM, y, `${aantal}${KEER}`, { anker: "end", grootte: AANTAL_GROOTTE_MM, data: { rol: "aantal" } })
    : "";
}

/**
 * Contactdoos: een halve cirkel (r = 3) met de open kant naar boven en een verticale lijn van het
 * aansluitpunt bovenaan tot onderaan de boog. 14 × 10 mm.
 */
export function tekenContactdoos(node: NodeVan<"contactdoos">): Symbool {
  const breedte = 14;
  const hoogte = 10;
  const x = breedte / 2;
  const r = 3;
  const boogY = 5;
  let svg =
    lijn(x, 0, x, boogY + r) +
    pad(`M${getal(x - r)} ${getal(boogY)} A${getal(r)} ${getal(r)} 0 0 0 ${getal(x + r)} ${getal(boogY)}`);
  if (node.randaarde) svg += lijn(x - r, boogY - 1.5, x + r, boogY - 1.5, { data: { rol: "randaarde" } });
  if (node.kinderbeveiliging) {
    svg +=
      lijn(x - 1.6, boogY + 0.6, x - 0.8, boogY + 1.6, { data: { rol: "kinderbeveiliging" } }) +
      lijn(x + 1.6, boogY + 0.6, x + 0.8, boogY + 1.6, { data: { rol: "kinderbeveiliging" } });
  }
  if (node.waterdicht) svg += waterdichtDriehoek(breedte);
  svg += aantalTekst(node.aantal, boogY + 1.5);
  return { maat: { breedte, hoogte, in: { x, y: 0 }, uit: { x, y: hoogte } }, svg };
}

/**
 * Lichtpunt: een cirkel (r = 3) met een kruis erin. De soort voegt iets toe onder de cirkel
 * ("led": tekst, "tl": balk, "spot": driehoek) of in het midden ("noodverlichting": gevulde stip).
 * 14 × 10 mm.
 */
export function tekenLichtpunt(node: NodeVan<"lichtpunt">): Symbool {
  const breedte = 14;
  const hoogte = 10;
  const x = breedte / 2;
  const cy = 5;
  const r = 3;
  const k = r * Math.SQRT1_2;
  let svg =
    lijn(x, 0, x, cy - r) +
    cirkel(x, cy, r) +
    lijn(x - k, cy - k, x + k, cy + k) +
    lijn(x - k, cy + k, x + k, cy - k);
  switch (node.soort) {
    case "led":
      svg += tekst(x, 9.8, "LED", { anker: "middle", grootte: 2 });
      break;
    case "tl":
      svg += rechthoek(x - 2.5, 8.6, 5, 0.9);
      break;
    case "spot":
      svg += pad(punten([x, 8.3], [x + 1.2, 9.8], [x - 1.2, 9.8]));
      break;
    case "noodverlichting":
      svg += cirkel(x, cy, 0.8, { gevuld: true });
      break;
    case "standaard":
    case undefined:
      break;
  }
  svg += aantalTekst(node.aantal, cy + 0.8);
  return { maat: { breedte, hoogte, in: { x, y: 0 }, uit: { x, y: hoogte } }, svg };
}

/**
 * Schakelaar: een cirkel (r = 2) met een schuine hendel naar rechtsboven. "dubbel" heeft een
 * tweede, parallelle hendel, "wissel" een hendel in beide richtingen, "kruis" een hendel in vier
 * richtingen, "dimmer" een pijltje naast de hendel en "drukknop" een dwarsstreepje op de hendel.
 * 12 × 10 mm.
 */
export function tekenSchakelaar(node: NodeVan<"schakelaar">): Symbool {
  const breedte = 12;
  const hoogte = 10;
  const x = breedte / 2;
  const cy = 6;
  const r = 2;
  const d = r * Math.SQRT1_2;
  const hendel = (x1: number, y1: number, x2: number, y2: number) => lijn(x1, y1, x2, y2, { data: { rol: "hendel" } });
  // Hendel vanaf de rand van de cirkel, onder 45 graden naar rechtsboven.
  const rechtsboven = hendel(x + d, cy - d, x + d + 2, cy - d - 2);
  let svg = lijn(x, 0, x, cy - r) + cirkel(x, cy, r);
  switch (node.soort) {
    case "enkel":
      svg += rechtsboven;
      break;
    case "dubbel": {
      const hoek = (70 * Math.PI) / 180;
      const x1 = x + r * Math.cos(hoek);
      const y1 = cy - r * Math.sin(hoek);
      svg += rechtsboven + hendel(x1, y1, x1 + 2.4, y1 - 2.4);
      break;
    }
    case "wissel":
      svg += rechtsboven + hendel(x - d, cy - d, x - d - 2, cy - d - 2);
      break;
    case "kruis":
      svg +=
        rechtsboven +
        hendel(x - d, cy - d, x - d - 2, cy - d - 2) +
        hendel(x + d, cy + d, x + d + 2, cy + d + 2) +
        hendel(x - d, cy + d, x - d - 2, cy + d + 2);
      break;
    case "dimmer":
      svg +=
        rechtsboven +
        lijn(7.6, 8.6, 10.6, 5.6, { data: { rol: "pijl" } }) +
        lijn(10.6, 5.6, 9.6, 5.6, { data: { rol: "pijl" } }) +
        lijn(10.6, 5.6, 10.6, 6.6, { data: { rol: "pijl" } });
      break;
    case "drukknop":
      svg += rechtsboven + lijn(x + d + 1, cy - d - 2, x + d + 3, cy - d - 2, { data: { rol: "knop" } });
      break;
  }
  if (node.waterdicht) svg += waterdichtDriehoek(breedte);
  return { maat: { breedte, hoogte, in: { x, y: 0 }, uit: { x, y: hoogte } }, svg };
}

/**
 * Toestel: een vierkant van 10 × 10 mm met de afkorting van de soort erin, met aansluitlijntjes
 * boven en onder. 12 × 12 mm.
 */
export function tekenToestel(node: NodeVan<"toestel">): Symbool {
  const breedte = 12;
  const hoogte = 12;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte, in: { x, y: 0 }, uit: { x, y: hoogte } },
    svg:
      lijn(x, 0, x, 1) +
      rechthoek(1, 1, 10, 10) +
      lijn(x, 11, x, hoogte) +
      tekst(x, 7.1, TOESTEL_AFKORTINGEN[node.soort], { anker: "middle", grootte: 3 }),
  };
}
