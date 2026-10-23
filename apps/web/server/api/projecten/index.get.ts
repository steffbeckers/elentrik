import { gebruikDb } from "../../db";
import { lijstProjecten } from "../../projecten/repo";
import { defineBeveiligdeHandler, vereisLid } from "../../utils/toegang";

// Alleen de projecten van de actieve organisatie.
export default defineBeveiligdeHandler(async (event) => {
  const { organisatieId } = await vereisLid(event);
  return lijstProjecten(gebruikDb(), organisatieId);
});
