import { portaalRoute } from "../../abonnementen/beheer";
import { defineBeveiligdeHandler } from "../../utils/toegang";

export default defineBeveiligdeHandler((event) => portaalRoute(event));
