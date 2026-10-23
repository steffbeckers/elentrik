import { setResponseStatus } from "h3";
import { vereisSchrijfrecht } from "../../../abonnementen/handhaving";
import { bewaarBestand } from "../../../bestanden/repo";
import { gebruikOpslag } from "../../../bestanden/opslag";
import { gebruikDb } from "../../../db";
import { leesPlanUpload, metBestandFouten } from "../../../utils/bestanden";
import { projectId } from "../../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang } from "../../../utils/toegang";

export default defineBeveiligdeHandler(async (event) => {
  const { project } = await vereisProjecttoegang(event, projectId(event));
  await vereisSchrijfrecht(project.organisatieId);
  const { soort, data } = await leesPlanUpload(event);
  const info = await metBestandFouten(() =>
    bewaarBestand(gebruikDb(), gebruikOpslag(), {
      organisatieId: project.organisatieId,
      projectId: project.id,
      soort,
      data,
    }),
  );
  setResponseStatus(event, 201);
  return info;
});
