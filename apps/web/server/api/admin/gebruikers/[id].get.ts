import { adminId } from "../../../admin/invoer";
import { haalAdminGebruiker } from "../../../admin/records";
import { vereisSuperuser } from "../../../admin/toegang";
import { gebruikDb } from "../../../db";
import { defineBeveiligdeHandler } from "../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return haalAdminGebruiker(gebruikDb(), adminId(event));
});
