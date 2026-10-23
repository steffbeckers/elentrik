import { bewaarBedrijf } from "../../bedrijf/repo";
import { gebruikDb } from "../../db";
import { leesBedrijfBody } from "../../utils/bedrijf";
import { defineBeveiligdeHandler, vereisLid } from "../../utils/toegang";

// Alleen een eigenaar wijzigt de bedrijfsgegevens van de actieve organisatie.
export default defineBeveiligdeHandler(async (event) => {
  const { organisatieId } = await vereisLid(event, { rol: "eigenaar" });
  const partij = await leesBedrijfBody(event);
  return bewaarBedrijf(gebruikDb(), organisatieId, partij);
});
