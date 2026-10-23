import { setResponseStatus } from "h3";
import { vereisSchrijfrecht } from "../../../abonnementen/handhaving";
import { gebruikDb } from "../../../db";
import { dupliceerProject } from "../../../projecten/repo";
import { metProjectFouten, projectId } from "../../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang, vereisVerwachteGebruiker } from "../../../utils/toegang";

// De kopie blijft in de organisatie van het bronproject.
export default defineBeveiligdeHandler(async (event) => {
  // "Bewaren als kopie" in de editor: nooit onder de sessie van een andere gebruiker.
  await vereisVerwachteGebruiker(event);
  const { project } = await vereisProjecttoegang(event, projectId(event));
  await vereisSchrijfrecht(project.organisatieId);
  const kopie = await metProjectFouten(() => dupliceerProject(gebruikDb(), project.organisatieId, project.id));
  setResponseStatus(event, 201);
  return kopie;
});
