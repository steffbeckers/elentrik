import { webhookRoute } from "../../abonnementen/webhook";
import { defineBeveiligdeHandler } from "../../utils/toegang";

// Publiek: Stripe heeft geen sessie. De handtekening over de ruwe body is de toegangscontrole.
export default defineBeveiligdeHandler((event) => webhookRoute(event), { publiek: true });
