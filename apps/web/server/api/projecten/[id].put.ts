import { gebruikDb } from "../../db";
import { bewaarProject } from "../../projecten/repo";

export default defineEventHandler(async (event) => {
  const id = projectId(event);
  const versie = leesIfMatch(event);
  const invoer = await leesBody(event, BewaarProjectSchema);
  return metProjectFouten(() => bewaarProject(gebruikDb(), id, versie, invoer));
});
