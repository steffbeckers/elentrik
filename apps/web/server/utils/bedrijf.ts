// Gedeelde hulp voor de bedrijfsgegevens-handlers: het schema van de PUT-body en de
// vertaling van BedrijfFout naar HTTP. Nitro importeert de exports van server/utils automatisch.
// Expliciete imports, geen Nitro-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { PartijSchema } from "@elentrik/model";
import { createError } from "h3";
import { BedrijfFout } from "../bedrijf/repo";

/** Een `Partij` zonder `logoBestandId`: alleen de logo-route zet dat veld, dus meesturen is een fout. */
export const BewaarBedrijfSchema = PartijSchema.omit({ logoBestandId: true });

/** Voert een repo-aanroep uit en vertaalt BedrijfFout naar 422. */
export async function metBedrijfFouten<T>(actie: () => Promise<T>): Promise<T> {
  try {
    return await actie();
  } catch (fout) {
    if (!(fout instanceof BedrijfFout)) throw fout;
    throw createError({
      statusCode: 422,
      statusMessage: "Ongeldige bedrijfsgegevens",
      data: fout.details,
    });
  }
}
