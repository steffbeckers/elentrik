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

/** Bijvoorbeeld "16 A B", "20 A" of "300 mA A". */
export function beveiligingLabel(node: NodeVan<"automaat"> | NodeVan<"zekering"> | NodeVan<"differentieel">): string {
  switch (node.type) {
    case "automaat":
      return `${node.nominaal_A} A ${node.curve}`;
    case "zekering":
      return `${node.nominaal_A} A`;
    case "differentieel":
      return `${node.gevoeligheid_mA} mA ${node.klasse}`;
  }
}
