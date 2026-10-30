// Het laden van de bedrijfsgegevens voor het actieve bedrijf van de pagina. De aanvraag stuurt dat
// bedrijf mee; is het intussen een ander (een ander tabblad wisselde, 409 ANDERE_ORGANISATIE), dan
// wordt de sessie opnieuw gelezen en nog één keer geladen, voor het bedrijf dat nu actief is.
//
// Puur en zonder Nuxt; expliciete imports (ruling E1).
import type { Partij } from "@elentrik/model";
import { isAndereOrganisatie } from "../sessie/organisatie";

export type GeladenBedrijf = {
  partij: Partij;
  /** Het bedrijf waarvoor de gegevens geladen werden; daarvoor bewaart het formulier. */
  organisatieId: string | null;
};

export type LaadOpties = {
  haal(organisatieId: string | null): Promise<Partij>;
  /** Het actieve bedrijf zoals de pagina het nu kent. */
  organisatieId(): string | null;
  /** Leest de sessie opnieuw (GET /api/mij), waarna `organisatieId()` het nieuwe actieve bedrijf geeft. */
  herleesSessie(): Promise<void>;
};

export async function laadBedrijf(opties: LaadOpties): Promise<GeladenBedrijf> {
  const organisatieId = opties.organisatieId();
  try {
    return { partij: await opties.haal(organisatieId), organisatieId };
  } catch (fout) {
    if (!isAndereOrganisatie(fout)) throw fout;
  }
  await opties.herleesSessie();
  const actief = opties.organisatieId();
  return { partij: await opties.haal(actief), organisatieId: actief };
}
