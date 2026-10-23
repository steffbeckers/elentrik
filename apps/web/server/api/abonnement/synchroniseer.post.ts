import { synchroniseerRoute } from "../../abonnementen/beheer";
import { defineBeveiligdeHandler } from "../../utils/toegang";

export default defineBeveiligdeHandler((event) => synchroniseerRoute(event));
