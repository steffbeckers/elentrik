// De Nitro-taak `instance:ping`, elke dag om 03:30 (nuxt.config.ts, nitro.scheduledTasks). Ze doet
// niets buiten een productiebuild van een zelf gehoste kopie; zie server/instance/ping.ts.
import { gebruikDb } from "../../db";
import { verstuurPing } from "../../instance/ping";

export default defineTask({
  meta: {
    name: "instance:ping",
    description: "Dagelijks anoniem melden dat deze zelf gehoste kopie bestaat",
  },
  async run() {
    const status = await verstuurPing({ db: gebruikDb(), env: process.env });
    return { result: { status } };
  },
});
