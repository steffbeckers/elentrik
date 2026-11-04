import { getQuery } from "h3";
import { zoekAdmin } from "../../admin/zoeken";
import { vereisSuperuser } from "../../admin/toegang";
import { gebruikDb } from "../../db";
import { defineBeveiligdeHandler } from "../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return zoekAdmin(gebruikDb(), (getQuery(event).zoek ?? "") as string);
});
