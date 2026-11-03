import { leesAdminQuery } from "../../../admin/records";
import { getQuery } from "h3";
import { lijstAdminProjecten } from "../../../admin/records";
import { vereisSuperuser } from "../../../admin/toegang";
import { gebruikDb } from "../../../db";
import { defineBeveiligdeHandler } from "../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return lijstAdminProjecten(gebruikDb(), leesAdminQuery(getQuery(event)));
});
