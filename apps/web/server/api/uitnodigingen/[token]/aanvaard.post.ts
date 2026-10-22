import { aanvaard } from "../../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../../utils/toegang";

// De uitnodiging achter de token uit de mail aanvaarden met hetzelfde, bevestigde adres; anders
// 403. Een ongeldige of niet meer open token: 410.
export default defineBeveiligdeHandler((event) => aanvaard(event));
