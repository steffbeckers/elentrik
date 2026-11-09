import { getQuery } from "h3";
import { lijstInstances } from "../../admin/instances";
import { vereisSuperuser } from "../../admin/toegang";
import { gebruikDb } from "../../db";
import { defineBeveiligdeHandler } from "../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return lijstInstances(gebruikDb(), new Date(), getQuery(event));
});
