import { wisselActief } from "../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../utils/toegang";

// Een organisatie waarvan je lid bent actief maken in de sessie; anders 404.
export default defineBeveiligdeHandler((event) => wisselActief(event));
