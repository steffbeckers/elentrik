import { checkoutRoute } from "../../abonnementen/beheer";
import { defineBeveiligdeHandler } from "../../utils/toegang";

export default defineBeveiligdeHandler((event) => checkoutRoute(event));
