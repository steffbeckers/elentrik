import { createError } from "h3";
import { gebruikDb } from "../../db";
import { haalProject } from "../../projecten/repo";
import { projectId } from "../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang } from "../../utils/toegang";

// Het project met zijn organisatieId; toegankelijk voor elk lid van die organisatie.
export default defineBeveiligdeHandler(async (event) => {
  const { project: toegang } = await vereisProjecttoegang(event, projectId(event));
  const project = await haalProject(gebruikDb(), toegang.organisatieId, toegang.id);
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: "Project niet gevonden", data: { code: "PROJECT_NIET_GEVONDEN" } });
  }
  return project;
});
