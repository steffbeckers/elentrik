// Controleert BETTER_AUTH_SECRET bij het starten van de server, niet pas bij het eerste verzoek.
import { leesGeheim } from "../auth";

export default defineNitroPlugin(() => {
  leesGeheim();
});
