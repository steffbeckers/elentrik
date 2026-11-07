import { readBody } from "h3";
import { zetOnderwijs } from "../../../../admin/bedrijfsrechten";
import { adminId } from "../../../../admin/invoer";
import { vereisSuperuser } from "../../../../admin/toegang";
import { gebruikDb } from "../../../../db";
import { defineBeveiligdeHandler } from "../../../../utils/toegang";
export default defineBeveiligdeHandler(async (event) => {
  const actor = await vereisSuperuser(event);
  return zetOnderwijs(gebruikDb(), actor, adminId(event), await readBody(event));
});
