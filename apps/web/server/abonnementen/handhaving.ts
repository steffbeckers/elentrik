// Handhaving per project (spec 4.4): de klantroutes voor projecten roepen deze controles aan na de
// lidmaatschapscontrole en vóór elke wijziging. Een weigering is een 402 en verandert niets.
//
// - `vereisProjectBewerking`: bewaren en uploaden in een bestaand project. 402
//   `PROJECT_ALLEEN_LEZEN` als het project alleen-lezen is, 402 `PROJECT_LIMIET` als het nieuwe
//   document de limieten van de gratis versie overschrijdt.
// - `vereisNieuwProject`: een nieuw project, een kopie of "Bewaar als nieuw project". Aanmaken mag
//   altijd; alleen de inhoud wordt aan de limiet getoetst.
//
// Beide geven `stempel: true` onder niveau `abonnement`: de route zet dan `abonnement_stempel_op`
// in dezelfde schrijfactie. Correcties door de beheerder gaan niet langs deze controles.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import {
  overschrijdtLimiet,
  telVoorLimiet,
  type InstallatieDocument,
  type Limieten,
  type Telling,
} from "@elentrik/model";
import { createError } from "h3";
import { PROJECT_ALLEEN_LEZEN, PROJECT_LIMIET } from "../../shared/abonnement";
import { gebruikDb } from "../db";
import { nietGevondenFout } from "../fouten";
import { gebruikAbonnementen } from "./config";
import { projecttoegangVoor, toegangVoor } from "./repo";

function limietFout(telling: Telling, limieten: Limieten) {
  return createError({
    statusCode: 402,
    statusMessage: "Dit gaat boven de limiet van de gratis versie",
    data: { code: PROJECT_LIMIET, telling, limieten },
  });
}

/**
 * Mag dit project bewerkt worden, en past `nieuw` binnen de limiet? `huidig` is het bewaarde
 * document: een project dat al boven de limiet zit, mag bewaren zolang geen soort stijgt. Zonder
 * `nieuw` (een upload) telt alleen of het project bewerkt mag worden.
 */
export async function vereisProjectBewerking(
  projectId: string,
  nieuw?: InstallatieDocument,
  huidig?: InstallatieDocument,
): Promise<{ stempel: boolean }> {
  const { config } = gebruikAbonnementen();
  const project = await projecttoegangVoor(gebruikDb(), projectId, config);
  if (!project) throw nietGevondenFout();
  const { toegang, niveau } = project;
  if (!toegang.bewerken) {
    throw createError({
      statusCode: 402,
      statusMessage: "Dit project is alleen-lezen",
      data: { code: PROJECT_ALLEEN_LEZEN },
    });
  }
  if (toegang.limiet && nieuw) {
    const telling = telVoorLimiet(nieuw);
    if (overschrijdtLimiet(huidig ? telVoorLimiet(huidig) : null, telling, config.limieten)) {
      throw limietFout(telling, config.limieten);
    }
  }
  return { stempel: niveau === "abonnement" };
}

/** Toetst het document van een nieuw project aan de limiet van het niveau van de organisatie. */
export async function vereisNieuwProject(
  organisatieId: string,
  doc: InstallatieDocument,
): Promise<{ stempel: boolean }> {
  const { config } = gebruikAbonnementen();
  const { niveau } = await toegangVoor(gebruikDb(), organisatieId, config);
  if (niveau === "gratis") {
    const telling = telVoorLimiet(doc);
    if (overschrijdtLimiet(null, telling, config.limieten)) throw limietFout(telling, config.limieten);
  }
  return { stempel: niveau === "abonnement" };
}
