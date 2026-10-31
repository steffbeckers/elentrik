import type { NodeVan } from "@elentrik/model";
import { cirkel, getal, lijn, pad, rechthoek, tekst } from "./svg";
import type { Symbool } from "./types";

/** Straal van de aansluitcirkel in mm; de lijn loopt boven de cirkel uit. */
const AANSLUIT_STRAAL_MM = 2;

/** Halve breedte van de sinus in mm; elke halve boog heeft de straal `SINUS_HALF_MM / 2`. */
const SINUS_HALF_MM = 1.4;

/**
 * Aansluiting op het openbaar net: een cirkel met het wisselstroomsymbool uit AREI-rubriek A (een
 * sinus, twee halve bogen als pad) onderaan (`in`) en een korte lijn omhoog naar `uit`. 10 × 8 mm.
 */
export function tekenAansluiting(_node: NodeVan<"aansluiting">): Symbool {
  const breedte = 10;
  const hoogte = 8;
  const x = breedte / 2;
  const r = AANSLUIT_STRAAL_MM;
  const cy = hoogte - r;
  const s = SINUS_HALF_MM;
  return {
    maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } },
    svg:
      cirkel(x, cy, r) +
      lijn(x, cy - r, x, 0) +
      pad(
        `M${getal(x - s)} ${getal(cy)} A${getal(s / 2)} ${getal(s / 2)} 0 0 1 ${getal(x)} ${getal(cy)} ` +
          `A${getal(s / 2)} ${getal(s / 2)} 0 0 0 ${getal(x + s)} ${getal(cy)}`,
        { data: { rol: "sinus" } },
      ),
  };
}

/**
 * Energieteller (AREI G): een rechthoek met een smalle band bovenaan (een horizontale lijn 1,5 mm
 * onder de bovenrand) en "kWh" eronder, met aansluitlijntjes onder (`in`) en boven (`uit`). 10 × 12 mm.
 */
export function tekenTeller(_node: NodeVan<"teller">): Symbool {
  const breedte = 10;
  const hoogte = 12;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } },
    svg:
      lijn(x, hoogte, x, hoogte - 1.5) +
      rechthoek(0, 1.5, breedte, hoogte - 3) +
      lijn(x, 1.5, x, 0) +
      lijn(0, 3, breedte, 3, { data: { rol: "band" } }) +
      tekst(x, 7.4, "kWh", { anker: "middle", grootte: 2.5 }),
  };
}
