import { verwijderLid } from "../../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../../utils/toegang";

// Een lid verwijderen: alleen een eigenaar; de laatste eigenaar blijft (409).
export default defineBeveiligdeHandler((event) => verwijderLid(event));
