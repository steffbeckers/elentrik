// /robots.txt op staging: alles verbieden. Op productie en lokaal geeft de handler niets terug, zodat het
// verzoek doorloopt naar de renderer en het antwoord een 404 blijft, zoals vandaag. (Een route
// `server/routes/robots.txt.ts` zou die 404 zelf moeten gooien en de pagina van Nuxt vervangen.)
import { defineEventHandler, getRequestURL, setResponseHeader } from "h3";
import { ROBOTS_TXT, isStaging, leesOmgeving } from "../../shared/omgeving";

export default defineEventHandler((event) => {
  if (getRequestURL(event).pathname !== "/robots.txt") return;
  if (!isStaging(leesOmgeving(process.env))) return;
  setResponseHeader(event, "content-type", "text/plain; charset=utf-8");
  return ROBOTS_TXT;
});
