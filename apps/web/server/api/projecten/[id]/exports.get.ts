import { gebruikDb } from "../../../db";
import { lijstExports } from "../../../exports/repo";
import { projectId } from "../../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang } from "../../../utils/toegang";

export default defineBeveiligdeHandler(async (event) => {
  const { project } = await vereisProjecttoegang(event, projectId(event));
  return lijstExports(gebruikDb(), project.organisatieId, project.id);
});
