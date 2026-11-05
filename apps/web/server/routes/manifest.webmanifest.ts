// GET /manifest.webmanifest: het manifest van de app. Een route en geen vast bestand, zodat staging
// zich als een andere app laat installeren ("Elentrik (staging)"). `no-cache`, zodat een wijziging
// meteen aankomt.
import { defineEventHandler, setResponseHeader } from "h3";
import { isStaging, leesOmgeving } from "../../shared/omgeving";

/** De primaire kleur van de app (Nuxt UI `blue`), ook die van het icoon. */
const PRIMAIR = "#3b82f6";

export default defineEventHandler((event) => {
  const naam = isStaging(leesOmgeving(process.env)) ? "Elentrik (staging)" : "Elentrik";
  setResponseHeader(event, "content-type", "application/manifest+json; charset=utf-8");
  setResponseHeader(event, "cache-control", "no-cache");
  return {
    name: naam,
    short_name: naam,
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: PRIMAIR,
    background_color: "#ffffff",
    icons: [
      { src: "/icoon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icoon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icoon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icoon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
});
