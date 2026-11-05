import { bewaarAdminBestand, leesAdminUpload } from "../../../../admin/bestanden";
import { gebruikOpslag } from "../../../../bestanden/opslag";
import { projectId } from "../../../../utils/projecten";
import { vereisSuperuser } from "../../../../admin/toegang";
import { gebruikDb } from "../../../../db";
import { defineBeveiligdeHandler } from "../../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  const actor = await vereisSuperuser(event);
  return bewaarAdminBestand(gebruikDb(), gebruikOpslag(), actor, projectId(event), await leesAdminUpload(event));
});
