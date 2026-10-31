import type { NodeVan } from "@elentrik/model";
import { getal, lijn, pad, rechthoek } from "./svg";
import type { Symbool } from "./types";

/** Hoogte van de beveiligingssymbolen met schakelcontact, in mm. */
const HOOGTE_MM = 14;
/**
 * De hoogten hieronder zijn afstanden vanaf `in`, de onderrand van het symbool; `vanOnder` zet ze
 * om naar een y-coördinaat.
 */
const vanOnder = (afstand: number): number => HOOGTE_MM - afstand;
/** Afstand van het scharnierpunt tot `in`, en de lengte van het vaste contact vanaf `uit`. */
const SCHARNIER_MM = 5;
const VAST_CONTACT_MM = 4.5;
/** Het schuine contact loopt vanaf het scharnier zoveel naar links en naar boven. */
const CONTACT_DX_MM = 2.8;
const CONTACT_DY_MM = 3.8;
/** Het blokje op het vrije uiteinde: lengte langs het contact en breedte dwars erop. */
const BLOKJE_LENGTE_MM = 1;
const BLOKJE_BREEDTE_MM = 0.8;

/**
 * Schakelcontact van de automatische schakelaar (AREI tabel 2.23, D), getekend rond de
 * verticale lijn op `x`: een lijn van `in` onderaan naar het scharnierpunt, een schuin contact
 * naar linksboven met een zwart blokje op het vrije uiteinde, een onderbreking en de lijn van
 * het vaste contact naar `uit` bovenaan. Het aantal polen blijft buiten het symbool (het staat
 * in het label).
 */
function schakelcontact(x: number): string {
  const scharnierY = vanOnder(SCHARNIER_MM);
  const puntX = x - CONTACT_DX_MM;
  const puntY = scharnierY - CONTACT_DY_MM;
  // Eenheidsvector langs het contact (van het scharnier naar het vrije uiteinde) en de normaal erop.
  const lengte = Math.hypot(CONTACT_DX_MM, CONTACT_DY_MM);
  const ux = -CONTACT_DX_MM / lengte;
  const uy = -CONTACT_DY_MM / lengte;
  const nx = -uy;
  const ny = ux;
  const half = BLOKJE_BREEDTE_MM / 2;
  const hoek = (langs: number, dwars: number): string =>
    `${getal(puntX + ux * langs + nx * dwars)} ${getal(puntY + uy * langs + ny * dwars)}`;
  const blokje = pad(
    `M${hoek(0, -half)} L${hoek(BLOKJE_LENGTE_MM, -half)} L${hoek(BLOKJE_LENGTE_MM, half)} L${hoek(0, half)} Z`,
    { gevuld: true, data: { rol: "blokje" } },
  );
  return (
    lijn(x, HOOGTE_MM, x, scharnierY) +
    lijn(x, scharnierY, puntX, puntY) +
    blokje +
    lijn(x, VAST_CONTACT_MM, x, 0)
  );
}

/** Automaat: de automatische schakelaar uit AREI tabel 2.23 (D), voor elk aantal polen gelijk. 10 × 14 mm. */
export function tekenAutomaat(_node: NodeVan<"automaat">): Symbool {
  const breedte = 10;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte: HOOGTE_MM, in: { x, y: HOOGTE_MM }, uit: { x, y: 0 } },
    svg: schakelcontact(x),
  };
}

/**
 * Differentieelschakelaar: hetzelfde contact en dezelfde breedte als de automaat, zoals het
 * voorbeeld "Differentieelstroombeschermingsinrichting" in AREI tabel 2.23 (D). Het verschil
 * zit in het label. 10 × 14 mm.
 */
export function tekenDifferentieel(_node: NodeVan<"differentieel">): Symbool {
  const breedte = 10;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte: HOOGTE_MM, in: { x, y: HOOGTE_MM }, uit: { x, y: 0 } },
    svg: schakelcontact(x),
  };
}

/** Smeltveiligheid: een smal rechthoekje met een lijn door het midden. 8 × 14 mm. */
export function tekenZekering(_node: NodeVan<"zekering">): Symbool {
  const breedte = 8;
  const x = breedte / 2;
  return {
    maat: { breedte, hoogte: HOOGTE_MM, in: { x, y: HOOGTE_MM }, uit: { x, y: 0 } },
    svg: rechthoek(x - 2, 2, 4, 10) + lijn(x, HOOGTE_MM, x, 0),
  };
}
