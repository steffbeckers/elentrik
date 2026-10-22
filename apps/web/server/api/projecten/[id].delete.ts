import { setResponseStatus } from "h3";
import { gebruikDb } from "../../db";
import { verwijderProject } from "../../projecten/repo";
import { metProjectFouten, projectId } from "../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang } from "../../utils/toegang";

export default defineBeveiligdeHandler(async (event) => {
  const { project } = await vereisProjecttoegang(event, projectId(event));
  await metProjectFouten(() => verwijderProject(gebruikDb(), project.organisatieId, project.id));
  setResponseStatus(event, 204);
  return null;
});
