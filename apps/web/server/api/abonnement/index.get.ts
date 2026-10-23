import { abonnementOverzicht } from "../../abonnementen/beheer";
import { defineBeveiligdeHandler } from "../../utils/toegang";

export default defineBeveiligdeHandler((event) => abonnementOverzicht(event));
