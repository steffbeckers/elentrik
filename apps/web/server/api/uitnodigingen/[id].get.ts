import { toonUitnodiging } from "../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../utils/toegang";

// Publiek: de uitnodiging achter de link (adres, rol, organisatie); 404 of 410.
export default defineBeveiligdeHandler((event) => toonUitnodiging(event), { publiek: true });
