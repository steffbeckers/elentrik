import { synchroniseerVrijgaveRoute } from "../../../../abonnementen/projectaankoop";
import { defineBeveiligdeHandler } from "../../../../utils/toegang";

// Na Checkout: de betaling van een projectaankoop ophalen zonder op de webhook te wachten (spec 4.5).
export default defineBeveiligdeHandler((event) => synchroniseerVrijgaveRoute(event));
