import { haalAdminAudit } from "../../../admin/audit";
import { adminId } from "../../../admin/invoer";
import { vereisSuperuser } from "../../../admin/toegang";
import { gebruikDb } from "../../../db";
import { defineBeveiligdeHandler } from "../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return haalAdminAudit(gebruikDb(), adminId(event));
});
