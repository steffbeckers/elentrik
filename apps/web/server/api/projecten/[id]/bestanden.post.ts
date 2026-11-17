import { setResponseStatus } from "h3";
import { vereisProjectBewerking } from "../../../abonnementen/handhaving";
import { bewaarBestand } from "../../../bestanden/repo";
import { gebruikOpslag } from "../../../bestanden/opslag";
import { gebruikDb } from "../../../db";
import { leesPlanUpload, metBestandFouten } from "../../../utils/bestanden";
import { projectId } from "../../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang } from "../../../utils/toegang";

export default defineBeveiligdeHandler(async (event) => {
  const { project } = await vereisProjecttoegang(event, projectId(event));
  // Zonder document: alleen of het project bewerkt mag worden (geen limiet, geen stempel).
  await vereisProjectBewerking(project.id);
  const db = gebruikDb();
  const { soort, data } = await leesPlanUpload(event, { db, organisatieId: project.organisatieId });
  const info = await metBestandFouten(() =>
    bewaarBestand(db, gebruikOpslag(), {
      organisatieId: project.organisatieId,
      projectId: project.id,
      soort,
      data,
    }),
  );
  setResponseStatus(event, 201);
  return info;
});
