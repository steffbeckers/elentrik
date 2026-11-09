// Een minuut na het starten van een zelf gehoste productiekopie gaat de eerste instance-ping weg;
// daarna volgt de dagelijkse taak `instance:ping`. De timer houdt het proces niet in leven.
import { defineNitroPlugin } from "nitropack/runtime";
import { gebruikDb } from "../db";
import { pingActief, verstuurPing } from "../instance/ping";

export default defineNitroPlugin(() => {
  if (!pingActief(process.env)) return;
  setTimeout(() => {
    // Nooit een exception uit de timer: `gebruikDb()` kan synchroon gooien, buiten de try van verstuurPing.
    try {
      void verstuurPing({ db: gebruikDb(), env: process.env }).catch(() => {});
    } catch {
      // De ping is niet kritiek.
    }
  }, 60_000).unref();
});
