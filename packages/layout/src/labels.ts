import type { NodeVan } from "@elentrik/model";

/** Doorsnede met maximaal 2 decimalen, zonder overbodige nullen en met een komma. Zonder Intl, voor een vast resultaat. */
function doorsnedeTekst(mm2: number): string {
  return mm2
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1")
    .replace(".", ",");
}

/** Bijvoorbeeld "XVB 3G2,5". Een ontbrekend kabeltype of een doorsnede 0 wordt "?". */
export function leidingLabel(node: NodeVan<"leiding">): string {
  const kabeltype = node.kabeltype.trim() === "" ? "?" : node.kabeltype;
  const doorsnede = node.doorsnede_mm2 === 0 ? "?" : doorsnedeTekst(node.doorsnede_mm2);
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
