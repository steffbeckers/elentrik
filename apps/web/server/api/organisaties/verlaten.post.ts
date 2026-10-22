import { verlaat } from "../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../utils/toegang";

// De actieve organisatie zelf verlaten; de laatste eigenaar krijgt 409 LAATSTE_EIGENAAR.
export default defineBeveiligdeHandler((event) => verlaat(event));
