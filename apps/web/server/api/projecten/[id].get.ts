import { gebruikAbonnementen } from "../../abonnementen/config";
import { projecttoegangVoor } from "../../abonnementen/repo";
import { gebruikDb } from "../../db";
import { nietGevondenFout } from "../../fouten";
import { haalProject } from "../../projecten/repo";
import { projectId } from "../../utils/projecten";
import { defineBeveiligdeHandler, vereisProjecttoegang } from "../../utils/toegang";

// Het project met zijn organisatieId, de toegang van het bedrijf en de limieten (null als
// abonnementen uit staan); toegankelijk voor elk lid van die organisatie.
export default defineBeveiligdeHandler(async (event) => {
  const { project: gevonden } = await vereisProjecttoegang(event, projectId(event));
  const db = gebruikDb();
  const project = await haalProject(db, gevonden.organisatieId, gevonden.id);
  if (!project) throw nietGevondenFout();
  const { config } = gebruikAbonnementen();
  const rechten = await projecttoegangVoor(db, gevonden.id, config);
  if (!rechten) throw nietGevondenFout();
  return { ...project, toegang: rechten.toegang, limieten: config.ingeschakeld ? config.limieten : null };
});
