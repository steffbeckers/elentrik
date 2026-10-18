import type { NodeVan } from "@elentrik/model";
import { cirkel, lijn, rechthoek, tekst } from "./svg";
import type { Symbool } from "./types";

/** Straal van de aansluitcirkel in mm; de lijn loopt onder de cirkel door. */
const AANSLUIT_STRAAL_MM = 2;

/** Aansluiting op het openbaar net: een cirkel met "~" en een korte lijn omlaag. 10 × 8 mm. */
export function tekenAansluiting(_node: NodeVan<"aansluiting">): Symbool {
  const breedte = 10;
  const hoogte = 8;
  const x = breedte / 2;
  const r = AANSLUIT_STRAAL_MM;
  return {
    maat: { breedte, hoogte, in: { x, y: 0 }, uit: { x, y: hoogte } },
    svg:
      cirkel(x, r, r) +
      lijn(x, 2 * r, x, hoogte) +
      tekst(x, r + 0.9, "~", { anker: "middle", grootte: 2.5 }),
  };
}

/** Energieteller: een rechthoek met "kWh", met aansluitlijntjes boven en onder. 10 × 12 mm. */
export function tekenTeller(_node: NodeVan<"teller">): Symbool {
  const breedte = 10;
  const hoogte = 12;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte, in: { x, y: 0 }, uit: { x, y: hoogte } },
    svg:
      lijn(x, 0, x, 1.5) +
      rechthoek(0, 1.5, breedte, hoogte - 3) +
      lijn(x, hoogte - 1.5, x, hoogte) +
      tekst(x, 7.4, "kWh", { anker: "middle", grootte: 2.5 }),
  };
}
