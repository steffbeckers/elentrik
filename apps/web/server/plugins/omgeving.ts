// Op staging krijgt elk antwoord X-Robots-Tag: noindex, nofollow. Dit is een plugin met de hook
// `request` en geen middleware: Nitro zet de handler voor statische bestanden (de assets van Nuxt, pdf.js)
// vóór alle middleware, en die beëindigt het antwoord. De hook `request` loopt vóór alles.
import { setResponseHeader } from "h3";
import { defineNitroPlugin } from "nitropack/runtime";
import { NIET_INDEXEREN, isStaging, leesOmgeving } from "../../shared/omgeving";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", (event) => {
    if (isStaging(leesOmgeving(process.env))) setResponseHeader(event, "x-robots-tag", NIET_INDEXEREN);
  });
});
