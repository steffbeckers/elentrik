import { lijstUitnodigingen } from "../../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../../utils/toegang";

// De openstaande uitnodigingen van de actieve organisatie: alleen een eigenaar.
export default defineBeveiligdeHandler((event) => lijstUitnodigingen(event));
