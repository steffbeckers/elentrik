import { vereisSuperuser } from "../../admin/toegang";
import { defineBeveiligdeHandler } from "../../utils/toegang";

export default defineBeveiligdeHandler(async (event) => {
  await vereisSuperuser(event);
  return { superuser: true };
});
