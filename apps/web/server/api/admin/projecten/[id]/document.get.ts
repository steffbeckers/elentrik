import { haalAdminDocument } from "../../../../admin/projecten";
import { projectId } from "../../../../utils/projecten";
import { vereisSuperuser } from "../../../../admin/toegang";
import { gebruikDb } from "../../../../db";
import { defineBeveiligdeHandler } from "../../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return haalAdminDocument(gebruikDb(), projectId(event));
});
