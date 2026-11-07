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
 * vragen en doorsturen. De geweigerde operatie wordt daarna niet opnieuw uitgevoerd. Is het project
 * intussen al vrij (409 `PROJECT_AL_GEKOCHT`) of hoeft het niet meer (409 `VRIJGEVEN_NIET_NODIG`), dan
 * wordt de toegang opnieuw geladen. Andere fouten (bv. 409 `VRIJGAVE_LOOPT`) gaan naar de aanroeper.
 */
export async function geefProjectVrij(opties: {
  nuOpslaan: () => Promise<void>;
  vrijgeven: () => Promise<{ url: string }>;
  navigeer: (url: string) => unknown;
  herlaad: () => Promise<unknown>;
}): Promise<"doorgestuurd" | "al-vrij"> {
  await opties.nuOpslaan();
  try {
    const { url } = await opties.vrijgeven();
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
