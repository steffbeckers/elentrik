import type { NodeVan } from "@elentrik/model";
import { cirkel, lijn, rechthoek, tekst } from "./svg";
import type { Symbool } from "./types";

/** Straal van de aansluitcirkel in mm; de lijn loopt boven de cirkel uit. */
const AANSLUIT_STRAAL_MM = 2;

/**
 * Aansluiting op het openbaar net: een cirkel met "~" onderaan (`in`) en een korte lijn omhoog naar
 * `uit`. 10 × 8 mm.
 */
export function tekenAansluiting(_node: NodeVan<"aansluiting">): Symbool {
  const breedte = 10;
  const hoogte = 8;
  const x = breedte / 2;
  const r = AANSLUIT_STRAAL_MM;
  const cy = hoogte - r;
  return {
    maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } },
    svg: cirkel(x, cy, r) + lijn(x, cy - r, x, 0) + tekst(x, cy + 0.9, "~", { anker: "middle", grootte: 2.5 }),
  };
}

/** Energieteller: een rechthoek met "kWh", met aansluitlijntjes onder (`in`) en boven (`uit`). 10 × 12 mm. */
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
      tekst(x, 7.4, "kWh", { anker: "middle", grootte: 2.5 }),
  };
}
