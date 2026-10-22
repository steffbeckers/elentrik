import { registreerViaUitnodiging } from "../../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../../utils/toegang";

// Publiek: een account aanmaken via de uitnodiging, met rate limiting (5 per minuut per IP).
export default defineBeveiligdeHandler((event) => registreerViaUitnodiging(event), { publiek: true });
