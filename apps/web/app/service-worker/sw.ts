/// <reference lib="webworker" />
// De service worker van Elentrik (gebouwd door @vite-pwa/nuxt met injectManifest, alleen in de
// productiebuild). Hij bewaart de code van de app (`/_nuxt/`) en de vertalingen (`/_i18n/`) in één
// cache, zodat een open tabblad zijn schermen blijft laden terwijl de server even weg is voor een
// update, en daarna, wanneer het nieuwe image de bestanden van de vorige versie niet meer heeft.
//
// Bewust geen precache van Workbox (`precacheAndRoute`, `cleanupOutdatedCaches`): die gooit bij het
// activeren de bestanden van vorige versies weg. Hier gaan de bestanden van de build bij het
// installeren door dezelfde strategie als elk ander verzoek, en verdwijnen ze alleen door de expiratie.
// Navigaties, `/api/` en de rest worden niet onderschept: die gaan altijd naar het netwerk.
import { ExpirationPlugin } from "workbox-expiration";
import type { PrecacheEntry } from "workbox-precaching";
import { warmStrategyCache } from "workbox-recipes";
import { CacheFirst } from "workbox-strategies";
import { APP_CACHE, MAX_LEEFTIJD_S, bijActiveren, isAppBestand } from "./regels";

declare let self: ServiceWorkerGlobalScope;

const strategie = new CacheFirst({
  cacheName: APP_CACHE,
  plugins: [new ExpirationPlugin({ maxAgeSeconds: MAX_LEEFTIJD_S, maxEntries: 2000 })],
});

// De bestanden van deze build (door de build ingevuld, relatief ten opzichte van de root). Ze gaan
// door de strategie, zodat de expiratie ze bijhoudt; wat al in de cache staat, wordt niet opnieuw
// opgehaald.
const bestanden = self.__WB_MANIFEST
  .map((item: PrecacheEntry | string) => (typeof item === "string" ? item : item.url))
  .map((url) => (url.startsWith("/") ? url : `/${url}`))
  .filter(isAppBestand);
warmStrategyCache({ urls: bestanden, strategy: strategie });

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(bijActiveren(self.clients, caches));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isAppBestand(url.pathname)) return;
  event.respondWith(strategie.handle({ event, request }));
});
