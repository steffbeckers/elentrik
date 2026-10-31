import type { NodeVan } from "@elentrik/model";

/** Geschatte breedte van één teken, als fractie van de tekstgrootte. */
export const TEKEN_BREEDTE_FACTOR = 0.6;

/** Geschatte breedte van `tekst` in mm bij tekstgrootte `grootte` (mm). */
export function tekstBreedte(tekst: string, grootte: number): number {
  return tekst.length * grootte * TEKEN_BREEDTE_FACTOR;
}

/** Doorsnede met maximaal 2 decimalen, zonder overbodige nullen en met een komma. Zonder Intl, voor een vast resultaat. */
function doorsnedeTekst(mm2: number): string {
  return mm2
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1")
    .replace(".", ",");
}

/** Bijvoorbeeld "XVB 3G2,5". Een ontbrekend kabeltype of een doorsnede die (afgerond) 0 is, wordt "?". */
export function leidingLabel(node: NodeVan<"leiding">): string {
  const kabeltype = node.kabeltype.trim() === "" ? "?" : node.kabeltype;
  const tekst = doorsnedeTekst(node.doorsnede_mm2);
  const doorsnede = tekst === "0" ? "?" : tekst;
  return `${kabeltype} ${node.aantalGeleiders}G${doorsnede}`;
}

/** De gevoeligheid in ampere uit milliampere: maximaal 3 decimalen, zonder overbodige nullen en met een komma. Zonder Intl, voor een vast resultaat. */
function ampereTekst(mA: number): string {
  return (mA / 1000)
    .toFixed(3)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}

/** Bijvoorbeeld "C20", "B16 2P", "40/0,03A type A 2P", "63/0,3A type AC" of "20 A" (AREI tabel 2.23: het aantal polen staat er vanaf twee). */
export function beveiligingLabel(node: NodeVan<"automaat"> | NodeVan<"zekering"> | NodeVan<"differentieel">): string {
  switch (node.type) {
    case "automaat":
      return `${node.curve}${node.nominaal_A}${polenSuffix(node.polen)}`;
    case "zekering":
      return `${node.nominaal_A} A`;
    case "differentieel":
      return `${node.nominaal_A}/${ampereTekst(node.gevoeligheid_mA)}A type ${node.klasse}${polenSuffix(node.polen)}`;
  }
}

/** " 2P" vanaf twee polen, anders niets. */
function polenSuffix(polen: number): string {
  return polen > 1 ? ` ${polen}P` : "";
}
