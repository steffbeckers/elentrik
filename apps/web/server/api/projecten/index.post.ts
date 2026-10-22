import { setResponseStatus } from "h3";
import { gebruikDb } from "../../db";
import { maakProject } from "../../projecten/repo";
import { leesBody, NieuwProjectSchema } from "../../utils/projecten";
import { defineBeveiligdeHandler, vereisLid } from "../../utils/toegang";

// Een nieuw project komt altijd in de actieve organisatie.
export default defineBeveiligdeHandler(async (event) => {
  const { organisatieId } = await vereisLid(event);
  const invoer = await leesBody(event, NieuwProjectSchema);
  const project = await maakProject(gebruikDb(), organisatieId, invoer);
  setResponseStatus(event, 201);
  return project;
});
