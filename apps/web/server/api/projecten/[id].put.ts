import { gebruikDb } from "../../db";
import { bewaarProject } from "../../projecten/repo";
import { BewaarProjectSchema, leesBody, leesIfMatch, metProjectFouten, projectId } from "../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang } from "../../utils/toegang";

export default defineBeveiligdeHandler(async (event) => {
  const { project } = await vereisProjecttoegang(event, projectId(event));
  const versie = leesIfMatch(event);
  const invoer = await leesBody(event, BewaarProjectSchema);
  return metProjectFouten(() => bewaarProject(gebruikDb(), project.organisatieId, project.id, versie, invoer));
});
