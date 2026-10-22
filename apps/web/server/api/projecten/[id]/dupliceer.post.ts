import { setResponseStatus } from "h3";
import { gebruikDb } from "../../../db";
import { dupliceerProject } from "../../../projecten/repo";
import { metProjectFouten, projectId } from "../../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang } from "../../../utils/toegang";

// De kopie blijft in de organisatie van het bronproject.
export default defineBeveiligdeHandler(async (event) => {
  const { project } = await vereisProjecttoegang(event, projectId(event));
  const kopie = await metProjectFouten(() => dupliceerProject(gebruikDb(), project.organisatieId, project.id));
  setResponseStatus(event, 201);
  return kopie;
});
