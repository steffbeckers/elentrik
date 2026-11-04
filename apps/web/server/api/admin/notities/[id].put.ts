import { readBody } from "h3";
import { adminId } from "../../../admin/invoer";
import { wijzigNotitie } from "../../../admin/notities";
import { vereisSuperuser } from "../../../admin/toegang";
import { gebruikDb } from "../../../db";
import { defineBeveiligdeHandler } from "../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  const actor = await vereisSuperuser(event);
  return wijzigNotitie(gebruikDb(), actor, adminId(event), await readBody(event));
});
