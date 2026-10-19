import type { NodeVan } from "@elentrik/model";
import { lijn, rechthoek } from "./svg";
import type { Symbool } from "./types";

/** Leiding: alleen een verticale lijn over de volle hoogte, 2 × 12 mm. Het label plaatst de layout. */
export function tekenLeiding(_node: NodeVan<"leiding">): Symbool {
  const breedte = 2;
  const hoogte = 12;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } },
    svg: lijn(x, hoogte, x, 0),
  };
}

/**
 * Verdeelbord: een rechthoek met een horizontale lijn in het bovenste deel, 12 × 6 mm. De rail
 * waaraan de beveiligingen hangen tekent de layout.
 */
export function tekenVerdeelbord(_node: NodeVan<"verdeelbord">): Symbool {
  const breedte = 12;
  const hoogte = 6;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } },
    svg: rechthoek(0, 0, breedte, hoogte) + lijn(0, 1.5, breedte, 1.5),
  };
}
