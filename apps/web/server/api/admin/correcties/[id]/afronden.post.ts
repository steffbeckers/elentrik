import { z } from "zod";
import { rondCorrectieAf } from "../../../../admin/correcties";
import { leesBody, projectId } from "../../../../utils/projecten";
import { vereisSuperuser } from "../../../../admin/toegang";
import { gebruikDb } from "../../../../db";
import { defineBeveiligdeHandler } from "../../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  const actor = await vereisSuperuser(event);
  const { mutatieId } = await leesBody(event, z.object({ mutatieId: z.uuid() }).strict());
  return rondCorrectieAf(gebruikDb(), actor, projectId(event), mutatieId);
});
