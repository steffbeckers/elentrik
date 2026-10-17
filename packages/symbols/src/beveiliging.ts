import type { NodeVan } from "@elentrik/model";
import { lijn, rechthoek, tekst } from "./svg";
import type { Symbool } from "./types";

/** Hoogte van de beveiligingssymbolen met schakelcontact, in mm. */
const HOOGTE_MM = 14;
/** Hoogte van het vaste contact (met kruisje) en van het scharnierpunt van de contactlijn. */
const CONTACT_Y_MM = 8;
const SCHARNIER_Y_MM = 12.5;
/** Het midden van de poolstreepjes ligt op deze hoogte; ze liggen 1,5 mm uit elkaar. */
const POOL_MIDDEN_Y_MM = 3.5;
const POOL_AFSTAND_MM = 1.5;
/** Halve afmeting van een poolstreepje (diagonaal, ongeveer 2 mm lang) en van het kruisje. */
const POOL_HALF_MM = 0.7;
const KRUIS_HALF_MM = 0.8;

/**
 * Schakelcontact met `polen` poolstreepjes, getekend rond de verticale lijn op `x`: een lijn van
 * boven naar het vaste contact (met kruisje), een schuine contactlijn vanaf het scharnierpunt
 * en een lijn naar onder.
 */
function schakelcontact(x: number, polen: number): string {
  let svg =
    lijn(x, 0, x, CONTACT_Y_MM) +
    lijn(x - KRUIS_HALF_MM, CONTACT_Y_MM - KRUIS_HALF_MM, x + KRUIS_HALF_MM, CONTACT_Y_MM + KRUIS_HALF_MM) +
    lijn(x - KRUIS_HALF_MM, CONTACT_Y_MM + KRUIS_HALF_MM, x + KRUIS_HALF_MM, CONTACT_Y_MM - KRUIS_HALF_MM) +
    lijn(x, SCHARNIER_Y_MM, x - 1.6, CONTACT_Y_MM + 0.6) +
    lijn(x, SCHARNIER_Y_MM, x, HOOGTE_MM);
  for (let i = 0; i < polen; i++) {
    const y = POOL_MIDDEN_Y_MM + (i - (polen - 1) / 2) * POOL_AFSTAND_MM;
    svg += lijn(x - POOL_HALF_MM, y + POOL_HALF_MM, x + POOL_HALF_MM, y - POOL_HALF_MM, {
      data: { rol: "pool" },
    });
  }
  return svg;
}

/** Automaat: schakelaarsymbool met een kruisje op het vaste contact en een streepje per pool. 10 × 14 mm. */
export function tekenAutomaat(node: NodeVan<"automaat">): Symbool {
  const breedte = 10;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte: HOOGTE_MM, in: { x, y: 0 }, uit: { x, y: HOOGTE_MM } },
    svg: schakelcontact(x, node.polen),
  };
}

/**
 * Differentieelschakelaar: hetzelfde contact als de automaat, met naast het contact een
 * rechthoekje met "ΔI". 14 × 14 mm.
 */
export function tekenDifferentieel(node: NodeVan<"differentieel">): Symbool {
  const breedte = 14;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte: HOOGTE_MM, in: { x, y: 0 }, uit: { x, y: HOOGTE_MM } },
    svg:
      schakelcontact(x, node.polen) +
      rechthoek(9, 6.6, 4.6, 3) +
      tekst(11.3, 8.8, "ΔI", { anker: "middle", grootte: 2 }),
  };
}

/** Smeltveiligheid: een smal rechthoekje met een lijn door het midden. 8 × 14 mm. */
export function tekenZekering(_node: NodeVan<"zekering">): Symbool {
  const breedte = 8;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte: HOOGTE_MM, in: { x, y: 0 }, uit: { x, y: HOOGTE_MM } },
    svg: rechthoek(x - 2, 2, 4, 10) + lijn(x, 0, x, HOOGTE_MM),
  };
}
