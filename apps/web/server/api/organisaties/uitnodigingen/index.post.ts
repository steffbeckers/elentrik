import { nodigUit } from "../../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../../utils/toegang";

// Iemand uitnodigen als eigenaar of lid: alleen een eigenaar.
export default defineBeveiligdeHandler((event) => nodigUit(event));
