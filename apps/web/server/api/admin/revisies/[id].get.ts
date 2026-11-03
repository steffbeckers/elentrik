import { haalAdminRevisie } from "../../../admin/revisies";
import { vereisSuperuser } from "../../../admin/toegang";
import { gebruikDb } from "../../../db";
import { projectId } from "../../../utils/projecten";
import { defineBeveiligdeHandler } from "../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return haalAdminRevisie(gebruikDb(), projectId(event));
});
