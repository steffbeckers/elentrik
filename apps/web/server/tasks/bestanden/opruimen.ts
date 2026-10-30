// De Nitro-taak `bestanden:opruimen`, elke dag om 04:00 in de tijdzone van de container
// (nuxt.config.ts, nitro.scheduledTasks). Ze doet niets buiten productie (tenzij
// ELENTRIK_GEPLANDE_TAKEN=aan) en niets met ELENTRIK_GEPLANDE_TAKEN=uit. Vitest start Nitro niet en
// de planner van Nitro slaat zichzelf over in een testomgeving.
//
// Elke omgeving ruimt alleen haar eigen database (DATABASE_URL) en haar eigen opslagmap
// (ELENTRIK_BESTANDEN_DIR) op. De logica staat in server/bestanden/opruimen.ts.
import { ruimOp } from "../../bestanden/opruimen";
import { gebruikOpslag } from "../../bestanden/opslag";
import { gebruikDb, gebruikPostgres } from "../../db";
import { geplandeTakenAan, maakPostgresLock } from "../../taken/lock";

export default defineTask({
  meta: {
    name: "bestanden:opruimen",
    description: "Dagelijks de prullenbak (na 30 dagen) en verweesde bestanden (na 7 dagen) definitief wissen",
  },
  async run() {
    if (!geplandeTakenAan()) return { result: { projecten: 0, planbestanden: 0, logos: 0, losseBestanden: 0 } };
    const resultaat = await ruimOp({
      db: gebruikDb(),
      opslag: gebruikOpslag(),
      nu: new Date(),
      metLock: (werk) => maakPostgresLock(gebruikPostgres(), "bestanden:opruimen")(werk),
    });
    return { result: resultaat };
  },
});
