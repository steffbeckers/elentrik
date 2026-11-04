import { adminOverzicht } from "../../admin/overzicht";
import { gebruikAbonnementen } from "../../abonnementen/config";
import { vereisSuperuser } from "../../admin/toegang";
import { gebruikDb } from "../../db";
import { defineBeveiligdeHandler } from "../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return adminOverzicht(gebruikDb(), gebruikAbonnementen().config, new Date());
});
