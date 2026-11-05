import { bewaarAdminProject, BewaarAdminProjectSchema } from "../../../../admin/projecten";
import { leesBody, leesIfMatch, projectId } from "../../../../utils/projecten";
import { vereisSuperuser } from "../../../../admin/toegang";
import { gebruikDb } from "../../../../db";
import { defineBeveiligdeHandler } from "../../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  const actor = await vereisSuperuser(event);
  return bewaarAdminProject(gebruikDb(), actor, projectId(event), leesIfMatch(event), await leesBody(event, BewaarAdminProjectSchema));
});
