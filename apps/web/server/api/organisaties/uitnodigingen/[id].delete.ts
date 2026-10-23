import { trekIn } from "../../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../../utils/toegang";

// Een openstaande uitnodiging intrekken: alleen een eigenaar.
export default defineBeveiligdeHandler((event) => trekIn(event));
