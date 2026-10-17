import type { Regelset } from "../../types";
import { PARAMETERS_AREI_2020_V1 } from "./parameters";
import { maakRegelAlgemeenDifferentieel } from "./regels/algemeen-differentieel";
import { maakRegelDoorsnedeBeveiliging } from "./regels/doorsnede-beveiliging";
import { maakRegelLeidingOnvolledig } from "./regels/leiding-onvolledig";
import { maakRegelMaxContactdozen } from "./regels/max-contactdozen";
import { maakRegelMinDoorsnede } from "./regels/min-doorsnede";
import { maakRegelNatteRuimteDifferentieel } from "./regels/natte-ruimte-differentieel";
import { maakRegelNietGeplaatst } from "./regels/niet-geplaatst";
import { maakRegelPolenStroomtype } from "./regels/polen-stroomtype";
import { maakRegelToestelEigenKring } from "./regels/toestel-eigen-kring";

/** AREI-regelset 2020. Voorlopig: niet gepubliceerd tot alle regels nagekeken zijn. */
export const AREI_2020: Regelset = {
  id: "arei-2020",
  versie: 1,
  gepubliceerd: false,
  regels: [
    maakRegelAlgemeenDifferentieel(PARAMETERS_AREI_2020_V1),
    maakRegelNatteRuimteDifferentieel(PARAMETERS_AREI_2020_V1),
    maakRegelDoorsnedeBeveiliging(PARAMETERS_AREI_2020_V1),
    maakRegelMaxContactdozen(PARAMETERS_AREI_2020_V1),
    maakRegelMinDoorsnede(PARAMETERS_AREI_2020_V1),
    maakRegelToestelEigenKring(PARAMETERS_AREI_2020_V1),
    maakRegelPolenStroomtype(PARAMETERS_AREI_2020_V1),
    maakRegelNietGeplaatst(),
    maakRegelLeidingOnvolledig(),
  ],
};
