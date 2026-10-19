// Gedeelde hulp voor de bedrijfsgegevens-handlers: de PUT-body lezen. Nitro importeert de
// exports van server/utils automatisch.
// Expliciete imports, geen Nitro-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { PartijSchema, type Partij } from "@elentrik/model";
import type { H3Event } from "h3";
import { leesBody } from "./projecten";

/**
 * Leest en valideert de PUT-body als `Partij` (ongeldig is 400). Een `logoBestandId` in de body
 * wordt aanvaard maar door `bewaarBedrijf` genegeerd, zodat een client die laadt, wijzigt en
 * terugstuurt het logo niet kwijtraakt.
 */
export function leesBedrijfBody(event: H3Event): Promise<Partij> {
  return leesBody(event, PartijSchema);
}
