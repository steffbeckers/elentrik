// De Nitro-taak `abonnementen:inhalen`, elk uur om :00 (nuxt.config.ts, nitro.scheduledTasks). Ze
// doet niets zolang abonnementen uit staan (geen STRIPE_GEHEIME_SLEUTEL), ook onder `nuxt dev`.
// Vitest start Nitro niet en de planner van Nitro slaat zichzelf over in een testomgeving.
//
// `defineTask` komt uit de Nitro-auto-imports; de logica staat in server/abonnementen/inhalen.ts.
import { gebruikAbonnementen } from "../../abonnementen/config";
import { haalGemisteMeldingenIn } from "../../abonnementen/inhalen";
import { gebruikDb } from "../../db";

export default defineTask({
  meta: {
    name: "abonnementen:inhalen",
    description: "Gemiste Stripe-meldingen inhalen: abonnementen synchroniseren en betaalde facturen doorsturen",
  },
  async run() {
    const { config, stripe } = gebruikAbonnementen();
    if (!config.ingeschakeld || !stripe) return { result: { gesynchroniseerd: 0, doorgestuurd: 0 } };
    const resultaat = await haalGemisteMeldingenIn(gebruikDb(), stripe, config);
    console.info("Inhaaltaak klaar", resultaat);
    return { result: resultaat };
  },
});
