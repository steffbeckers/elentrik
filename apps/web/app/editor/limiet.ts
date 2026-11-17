// De gratis limiet en de projecttoegang in de editor (spec 4.6 en 4.7): welke knoppen het limietvenster
// toont, wanneer de alleen-lezenbalk verschijnt, het watermerk van het afdrukvoorbeeld, en de stappen
// van "Dit project vrijgeven" en de terugkeer uit Checkout. Los van de componenten, zodat het zonder
// Nuxt te testen is.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { TEKSTEN, type Taal } from "@elentrik/render";
import {
  PROJECT_AL_GEKOCHT,
  VRIJGEVEN_NIET_NODIG,
  type Prijs,
  type Projecttoegang,
} from "../../shared/abonnement";
import type { Rol } from "../../shared/mij";
import { foutCode, foutStatus } from "../sessie/fouten";

export type LimietKnoppen = {
  /** De uitleg voor een lid: "Vraag de eigenaar van je bedrijf ...", zonder betaalknoppen. */
  lid: boolean;
  /** "Dit project vrijgeven": alleen een eigenaar, en alleen met een projectprijs. */
  vrijgeven: boolean;
  /** "Een abonnement nemen": een eigenaar. */
  abonnement: boolean;
};

/** De knoppen van het limietvenster en de alleen-lezenbalk, voor deze rol en projectprijs. */
export function limietKnoppen(rol: Rol | null, projectprijs: Prijs | null): LimietKnoppen {
  if (rol !== "eigenaar") return { lid: true, vrijgeven: false, abonnement: false };
  return { lid: false, vrijgeven: projectprijs !== null, abonnement: true };
}

/** De balk "Dit project is gemaakt tijdens je abonnement ...": een gestempeld project dat niet bewerkbaar is. */
export function toonAlleenLezenBalk(toegang: Projecttoegang | null): boolean {
  return toegang !== null && toegang.gestempeld && !toegang.bewerken;
}

/** Het watermerk van het afdrukvoorbeeld, zoals de server het op de export zet (alleen weergave). */
export function watermerkVoor(
  toegang: Projecttoegang | null,
  taal: Taal,
): { titel: string; ondertitel: string } | undefined {
  if (toegang?.watermerk === "gratis") return TEKSTEN[taal].watermerkGratis;
  if (toegang?.watermerk === "onderwijs") return TEKSTEN[taal].watermerkOnderwijs;
  return undefined;
}

/**
 * "Dit project vrijgeven": eerst het werk bewaren zoals het nu is (binnen de limiet), dan Checkout
 * vragen en doorsturen. De geweigerde operatie wordt daarna niet opnieuw uitgevoerd. Staat het werk
 * lokaal in het concept (`conceptBewaard`), dan is het vertrek naar Checkout bevestigd
 * (`bevestigVertrek`): de browser vraagt dan niet of de gebruiker de pagina wil verlaten, en bij de
 * terugkeer biedt de editor het concept aan. Staat het werk alleen in het geheugen, dan blijft die vraag.
 * Is het project intussen al vrij (409 `PROJECT_AL_GEKOCHT`) of hoeft het niet meer (409
 * `VRIJGEVEN_NIET_NODIG`), dan wordt de toegang opnieuw geladen. Andere fouten (bv. 409
 * `VRIJGAVE_LOOPT`) gaan naar de aanroeper.
 */
export async function geefProjectVrij(opties: {
  nuOpslaan: () => Promise<void>;
  vrijgeven: () => Promise<{ url: string }>;
  conceptBewaard: () => Promise<boolean>;
  bevestigVertrek: () => void;
  navigeer: (url: string) => unknown;
  herlaad: () => Promise<unknown>;
}): Promise<"doorgestuurd" | "al-vrij"> {
  await opties.nuOpslaan();
  try {
    const { url } = await opties.vrijgeven();
    if (await opties.conceptBewaard().catch(() => false)) opties.bevestigVertrek();
    await opties.navigeer(url);
    return "doorgestuurd";
  } catch (fout) {
    const code = foutCode(fout);
    if (foutStatus(fout) === 409 && (code === PROJECT_AL_GEKOCHT || code === VRIJGEVEN_NIET_NODIG)) {
      await opties.herlaad();
      return "al-vrij";
    }
    throw fout;
  }
}

/**
 * Terug uit Checkout met `?vrijgave=<sessie>`: synchroniseren en de query wissen (ook na een
 * mislukking, anders geeft elke herlaadbeurt hetzelfde). "vrijgegeven" als het project nu gekocht is;
 * "verwerking" als de betaling nog loopt of het synchroniseren mislukte (de webhook loopt het bij).
 * Zonder sessie: null. De aanroeper laadt daarna het project.
 */
export async function verwerkVrijgave(
  sessie: string | undefined,
  opties: {
    synchroniseer: (sessie: string) => Promise<{ gekocht: boolean }>;
    verwijderQuery: () => unknown;
  },
): Promise<"vrijgegeven" | "verwerking" | null> {
  if (!sessie) return null;
  let gekocht = false;
  try {
    gekocht = (await opties.synchroniseer(sessie)).gekocht;
  } catch {
    gekocht = false;
  }
  await opties.verwijderQuery();
  return gekocht ? "vrijgegeven" : "verwerking";
}

/**
 * Het lokale document elders bewaren: een kopie bij een conflict (`bewaarAlsKopie`) of een nieuw
 * project na het verwijderen (`bewaarAlsNieuwProject`). Het concept blijft staan tot dat gelukt is.
 * - "gelukt": de autosave navigeert zelf naar de kopie of het nieuwe project;
 * - "limiet": 402 `PROJECT_LIMIET` (bv. een kopie van een project boven de gratis limiet). Er kan geen
 *   project van gemaakt worden: de aanroeper biedt de download van het lokale document aan;
 * - "geweigerd": een andere weigering (402 `PROJECT_ALLEEN_LEZEN`), al gemeld door `behandelWeigering`;
 * - "fout": een andere fout, gemeld via `meldFout`.
 */
export async function bewaarElders(opties: {
  actie: () => Promise<void>;
  behandelWeigering: (fout: unknown) => Promise<"limiet" | "alleen-lezen" | false>;
  meldFout: (fout: unknown) => void;
}): Promise<"gelukt" | "limiet" | "geweigerd" | "fout"> {
  try {
    await opties.actie();
    return "gelukt";
  } catch (fout) {
    const weigering = await opties.behandelWeigering(fout);
    if (weigering === "limiet") return "limiet";
    if (weigering) return "geweigerd";
    opties.meldFout(fout);
    return "fout";
  }
}
