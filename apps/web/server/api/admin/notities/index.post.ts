import { readBody } from "h3";
import { maakNotitie } from "../../../admin/notities";
import { vereisSuperuser } from "../../../admin/toegang";
import { gebruikDb } from "../../../db";
import { defineBeveiligdeHandler } from "../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  const actor = await vereisSuperuser(event);
  return maakNotitie(gebruikDb(), actor, await readBody(event));
});
