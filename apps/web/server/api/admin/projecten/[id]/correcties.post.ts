import { startCorrectie, StartCorrectieSchema } from "../../../../admin/correcties";
import { leesBody, projectId } from "../../../../utils/projecten";
import { vereisSuperuser } from "../../../../admin/toegang";
import { gebruikDb } from "../../../../db";
import { defineBeveiligdeHandler } from "../../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  const actor = await vereisSuperuser(event);
  return startCorrectie(gebruikDb(), actor, projectId(event), await leesBody(event, StartCorrectieSchema));
});
