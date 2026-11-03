import { readBody } from "h3";
import { corrigeerGebruiker } from "../../../admin/gebruikers";
import { adminId } from "../../../admin/invoer";
import { vereisSuperuser } from "../../../admin/toegang";
import { gebruikDb } from "../../../db";
import { defineBeveiligdeHandler } from "../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  const actor = await vereisSuperuser(event);
  return corrigeerGebruiker(gebruikDb(), actor, adminId(event), await readBody(event));
});
