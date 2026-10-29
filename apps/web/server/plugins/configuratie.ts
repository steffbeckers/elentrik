// Controleert de configuratie bij het starten van de server: in productie start de server niet bij
// ontbrekende of ongeldige variabelen (de melding noemt alleen hun namen), anders volgt een waarschuwing.
import { defineNitroPlugin } from "nitropack/runtime";
import { controleerBijStart } from "../config/controle";

export default defineNitroPlugin(() => {
  controleerBijStart();
});
