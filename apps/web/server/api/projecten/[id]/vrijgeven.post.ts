import { vrijgevenRoute } from "../../../abonnementen/projectaankoop";
import { defineBeveiligdeHandler } from "../../../utils/toegang";

// Een project vrijgeven met een eenmalige betaling (spec 4.5): alleen een eigenaar.
export default defineBeveiligdeHandler((event) => vrijgevenRoute(event));
