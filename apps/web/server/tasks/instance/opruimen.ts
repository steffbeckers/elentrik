// De Nitro-taak `instance:opruimen`, elke dag om 04:15 in de tijdzone van de container
// (nuxt.config.ts, nitro.scheduledTasks). Alleen op elentrik.app (ELENTRIK_OMGEVING=productie) en
// alleen als de geplande taken aan staan: daar staan de ontvangen instance-pings. De logica staat
// in server/instance/ontvangst.ts.
import { leesOmgeving } from "../../../shared/omgeving";
import { gebruikDb, gebruikPostgres } from "../../db";
import { ruimInstanceMeldingenOp } from "../../instance/ontvangst";
import { geplandeTakenAan, maakPostgresLock } from "../../taken/lock";

export default defineTask({
  meta: {
    name: "instance:opruimen",
    description: "Dagelijks de ontvangen instance-pings wissen waarvan de laatste melding meer dan 365 dagen oud is",
  },
  async run() {
    if (!geplandeTakenAan() || leesOmgeving(process.env) !== "productie") return { result: { gewist: 0 } };
    let gewist = 0;
    await maakPostgresLock(gebruikPostgres(), "instance:opruimen")(async () => {
      gewist = await ruimInstanceMeldingenOp(gebruikDb(), new Date());
    });
    return { result: { gewist } };
  },
});
