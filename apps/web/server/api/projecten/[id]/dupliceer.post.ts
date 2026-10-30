import { setResponseStatus } from "h3";
import { vereisSchrijfrecht } from "../../../abonnementen/handhaving";
import { gebruikOpslag } from "../../../bestanden/opslag";
import { gebruikDb } from "../../../db";
import { dupliceerProject } from "../../../projecten/repo";
import { DupliceerSchema, leesBody, metProjectFouten, projectId } from "../../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang, vereisVerwachteGebruiker } from "../../../utils/toegang";

// De kopie blijft in de organisatie van het bronproject.
export default defineBeveiligdeHandler(async (event) => {
  // "Bewaren als kopie" in de editor: nooit onder de sessie van een andere gebruiker.
  await vereisVerwachteGebruiker(event);
  const { project } = await vereisProjecttoegang(event, projectId(event));
  await vereisSchrijfrecht(project.organisatieId);
  const { bestandIds } = await leesBody(event, DupliceerSchema);
  const kopie = await metProjectFouten(() =>
    dupliceerProject(gebruikDb(), gebruikOpslag(), project.organisatieId, project.id, bestandIds),
  );
  setResponseStatus(event, 201);
  return kopie;
});
