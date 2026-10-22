import { haalBedrijf } from "../../bedrijf/repo";
import { gebruikDb } from "../../db";
import { defineBeveiligdeHandler, vereisLid } from "../../utils/toegang";

// De bedrijfsgegevens van de actieve organisatie; elk lid mag ze lezen.
export default defineBeveiligdeHandler(async (event) => {
  const { organisatieId } = await vereisLid(event);
  return haalBedrijf(gebruikDb(), organisatieId);
});
