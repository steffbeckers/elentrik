// Een minuut na het starten van een zelf gehoste productiekopie gaat de eerste instance-ping weg;
// daarna volgt de dagelijkse taak `instance:ping`. De timer houdt het proces niet in leven.
import { defineNitroPlugin } from "nitropack/runtime";
import { gebruikDb } from "../db";
import { pingActief, verstuurPing } from "../instance/ping";

export default defineNitroPlugin(() => {
  if (!pingActief(process.env)) return;
  setTimeout(() => void verstuurPing({ db: gebruikDb(), env: process.env }), 60_000).unref();
});
