import type { NodeVan } from "@elentrik/model";
import { cirkel, lijn, rechthoek } from "./svg";
import type { Symbool } from "./types";

/** Placement marks follow FOD Economie table 2.23 C, rotated with the vertical conductor.
 * Reference inspected: Symboles-nl.pdf pp.40-41 (2023); current 2026 book is CAPTCHA-protected.
 * Missing installation stays unmarked. Independent wall and conduit marks can be combined.
 */
export function tekenLeiding(node: NodeVan<"leiding">): Symbool {
  const aanleg = node.aanleg;
  const gemarkeerd =
    !!aanleg && (aanleg.inBuis || aanleg.ligging !== undefined);
  const breedte = gemarkeerd ? 6 : 2,
    hoogte = 12;
  const x = breedte / 2;
  let svg = lijn(x, hoogte, x, 0);
  if (aanleg?.inBuis) svg += cirkel(5, 6, 0.85);
  if (aanleg?.ligging === "inbouw" || aanleg?.ligging === "opbouw") {
    const kap = aanleg.ligging === "opbouw" ? 1 : 5,
      einde = aanleg.ligging === "opbouw" ? 2.2 : 3.8;
    for (const y of [2, 9]) {
      svg += lijn(kap, y, kap, y + 2);
      for (const dy of [0, 1, 2]) svg += lijn(kap, y + dy, einde, y + dy);
    }
  } else if (aanleg?.ligging === "grond") {
    for (const [xx, half] of [
      [4, 1.6],
      [5, 1],
      [5.8, 0.4],
    ])
      svg += lijn(xx!, 6 - half!, xx!, 6 + half!);
  }
  return {
    maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } },
    svg,
  };
}

/**
 * Verdeelbord: de algemene voorstelling uit AREI-rubriek B, een gewone rechthoek van 12 × 6 mm. De
 * rail waaraan de beveiligingen hangen tekent de layout.
 */
export function tekenVerdeelbord(_node: NodeVan<"verdeelbord">): Symbool {
  const breedte = 12;
  const hoogte = 6;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte, in: { x, y: hoogte }, uit: { x, y: 0 } },
    svg: rechthoek(0, 0, breedte, hoogte),
  };
}
