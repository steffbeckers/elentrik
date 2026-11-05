import { getQuery } from "h3";
import { lijstOpvolging } from "../../admin/notities";
import { vereisSuperuser } from "../../admin/toegang";
import { gebruikDb } from "../../db";
import { defineBeveiligdeHandler } from "../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return lijstOpvolging(gebruikDb(), new Date(), getQuery(event));
});
