import { lijstLeden } from "../../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../../utils/toegang";

// De leden van de actieve organisatie met hun rol, voor elk lid.
export default defineBeveiligdeHandler((event) => lijstLeden(event));
