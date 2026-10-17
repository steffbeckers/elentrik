import type { Regelset } from "../../types";
import { PARAMETERS_AREI_2020_V1 } from "./parameters";
import { maakRegelAlgemeenDifferentieel } from "./regels/algemeen-differentieel";
import { maakRegelDoorsnedeBeveiliging } from "./regels/doorsnede-beveiliging";
import { maakRegelNatteRuimteDifferentieel } from "./regels/natte-ruimte-differentieel";

/** AREI-regelset 2020. Voorlopig: niet gepubliceerd tot alle regels nagekeken zijn. */
export const AREI_2020: Regelset = {
  id: "arei-2020",
  versie: 1,
  gepubliceerd: false,
  regels: [
    maakRegelAlgemeenDifferentieel(PARAMETERS_AREI_2020_V1),
    maakRegelNatteRuimteDifferentieel(PARAMETERS_AREI_2020_V1),
    maakRegelDoorsnedeBeveiliging(PARAMETERS_AREI_2020_V1),
  ],
};
