import { adminId } from "../../../admin/invoer";
import { haalAdminOrganisatie } from "../../../admin/records";
import { vereisSuperuser } from "../../../admin/toegang";
import { gebruikDb } from "../../../db";
import { defineBeveiligdeHandler } from "../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return haalAdminOrganisatie(gebruikDb(), adminId(event));
});
