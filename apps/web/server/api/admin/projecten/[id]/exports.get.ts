import { haalAdminProject } from "../../../../admin/records";
import { lijstExports } from "../../../../exports/repo";
import { nietGevondenFout } from "../../../../fouten";
import { projectId } from "../../../../utils/projecten";
import { vereisSuperuser } from "../../../../admin/toegang";
import { gebruikDb } from "../../../../db";
import { defineBeveiligdeHandler } from "../../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  const db = gebruikDb();
  const project = await haalAdminProject(db, projectId(event));
  if (!project.organisatieId) throw nietGevondenFout();
  return lijstExports(db, project.organisatieId, project.id);
});
