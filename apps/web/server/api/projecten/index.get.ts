import { gebruikAbonnementen } from "../../abonnementen/config";
import { toegangVoor } from "../../abonnementen/repo";
import { gebruikDb } from "../../db";
import { lijstProjecten } from "../../projecten/repo";
import { defineBeveiligdeHandler, vereisLid } from "../../utils/toegang";

// Alleen de projecten van de actieve organisatie, met het label per project (spec 4.7).
export default defineBeveiligdeHandler(async (event) => {
  const { organisatieId } = await vereisLid(event);
  const db = gebruikDb();
  const { niveau } = await toegangVoor(db, organisatieId, gebruikAbonnementen().config);
  return lijstProjecten(db, organisatieId, niveau);
});
