import { toonUitnodiging } from "../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../utils/toegang";

// Publiek: de uitnodiging achter de geheime token uit de mail (adres, rol, organisatie); anders 410.
export default defineBeveiligdeHandler((event) => toonUitnodiging(event), { publiek: true });
