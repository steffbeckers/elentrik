import type { Regelset } from "../../types";
import { PARAMETERS_AREI_2020_V1 } from "./parameters";
import { maakRegelAardingNietGetekend } from "./regels/aarding-niet-getekend";
import { maakRegelAardingSpreidingsweerstand } from "./regels/aarding-spreidingsweerstand";
import { maakRegelAlgemeenDifferentieel } from "./regels/algemeen-differentieel";
import { maakRegelAanvullendeDifferentieel } from "./regels/aanvullende-differentieel";
import { maakRegelContactdoosUitvoering } from "./regels/contactdoos-uitvoering";
import { maakRegelDifferentieelMaxStroombanen } from "./regels/differentieel-max-stroombanen";
import { maakRegelDifferentieelTypeAc } from "./regels/differentieel-type-ac";
import { maakRegelDoorsnedeBeveiliging } from "./regels/doorsnede-beveiliging";
import { maakRegelKringSpanningsval } from "./regels/kring-spanningsval";
import { maakRegelLaadpaalDifferentieel } from "./regels/laadpaal-differentieel";
import { maakRegelLeidingOnvolledig } from "./regels/leiding-onvolledig";
import { maakRegelMaxContactdozen } from "./regels/max-contactdozen";
import { maakRegelMinDoorsnede } from "./regels/min-doorsnede";
import { maakRegelNatteRuimteDifferentieel } from "./regels/natte-ruimte-differentieel";
import { maakRegelNietGeplaatst } from "./regels/niet-geplaatst";
import { maakRegelPolenStroomtype } from "./regels/polen-stroomtype";
import { maakRegelPuntZonderBeveiliging } from "./regels/punt-zonder-beveiliging";
import { maakRegelToestelEigenKring } from "./regels/toestel-eigen-kring";
import { maakRegelVerlichtingMinKringen } from "./regels/verlichting-min-kringen";

/** AREI-regelset 2020. Voorlopig: niet gepubliceerd tot alle regels nagekeken zijn. */
export const AREI_2020: Regelset = {
  id: "arei-2020",
  versie: 1,
  gepubliceerd: false,
  regels: [
    maakRegelAlgemeenDifferentieel(PARAMETERS_AREI_2020_V1),
    maakRegelNatteRuimteDifferentieel(PARAMETERS_AREI_2020_V1),
    maakRegelAanvullendeDifferentieel(),
    maakRegelDoorsnedeBeveiliging(PARAMETERS_AREI_2020_V1),
    maakRegelMaxContactdozen(PARAMETERS_AREI_2020_V1),
    maakRegelMinDoorsnede(PARAMETERS_AREI_2020_V1),
    maakRegelToestelEigenKring(PARAMETERS_AREI_2020_V1),
    maakRegelPolenStroomtype(PARAMETERS_AREI_2020_V1),
    maakRegelNietGeplaatst(),
    maakRegelLeidingOnvolledig(),
    maakRegelPuntZonderBeveiliging(),
    maakRegelDifferentieelMaxStroombanen(PARAMETERS_AREI_2020_V1),
    maakRegelDifferentieelTypeAc(),
    maakRegelAardingSpreidingsweerstand(PARAMETERS_AREI_2020_V1),
    maakRegelLaadpaalDifferentieel(PARAMETERS_AREI_2020_V1),
    maakRegelVerlichtingMinKringen(PARAMETERS_AREI_2020_V1),
    maakRegelContactdoosUitvoering(),
    maakRegelAardingNietGetekend(),
    maakRegelKringSpanningsval(PARAMETERS_AREI_2020_V1),
  ],
};
