import { getQuery } from "h3";
import { lijstAdminAudit } from "../../../admin/audit";
import { vereisSuperuser } from "../../../admin/toegang";
import { gebruikDb } from "../../../db";
import { defineBeveiligdeHandler } from "../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return lijstAdminAudit(gebruikDb(), getQuery(event));
});
