import { wijzigRol } from "../../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../../utils/toegang";

// De rol van een lid wijzigen: alleen een eigenaar; de laatste eigenaar blijft (409).
export default defineBeveiligdeHandler((event) => wijzigRol(event));
