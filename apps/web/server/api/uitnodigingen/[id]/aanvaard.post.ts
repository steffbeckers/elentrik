import { aanvaard } from "../../../organisaties/leden";
import { defineBeveiligdeHandler } from "../../../utils/toegang";

// Een uitnodiging aanvaarden met hetzelfde, bevestigde adres; anders 403, niet meer open 410.
export default defineBeveiligdeHandler((event) => aanvaard(event));
