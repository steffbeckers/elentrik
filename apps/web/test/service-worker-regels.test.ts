// De regels van de service worker: welke verzoeken uit de app-cache komen, hoe lang ze daar blijven,
// en dat een nieuwe service worker bij het activeren geen oude bestanden weggooit.
import { describe, expect, test, vi } from "vitest";
import { APP_CACHE, MAX_LEEFTIJD_S, bijActiveren, isAppBestand } from "../app/service-worker/regels";

describe("isAppBestand", () => {
  test.each(["/_nuxt/entry.Ab12Cd.js", "/_nuxt/x.css", "/_i18n/9f8e/nl/messages.json"])(
    "%s komt uit de cache",
    (pad) => {
      expect(isAppBestand(pad)).toBe(true);
    },
  );

  test.each([
    "/_nuxt/builds/latest.json",
    "/_nuxt/builds/meta/abc.json",
    "/api/mij",
    "/pdfjs/wasm/x.wasm",
    "/",
    "/projecten/1",
    "/sw.js",
    "/manifest.webmanifest",
  ])("%s niet", (pad) => {
    expect(isAppBestand(pad)).toBe(false);
  });
});

test("de bestanden verlopen na 60 dagen", () => {
  expect(MAX_LEEFTIJD_S).toBe(5_184_000);
});

test("de cache heet elentrik-code", () => {
  expect(APP_CACHE).toBe("elentrik-code");
});

test("activeren wist geen caches", async () => {
  const clients = { claim: vi.fn(async () => {}) };
  const opslag = {
    keys: vi.fn(async () => [APP_CACHE, "workbox-precache-v2-http://x/", "iets-anders"]),
    delete: vi.fn(async () => true),
  };
  await bijActiveren(clients, opslag);
  expect(opslag.delete).not.toHaveBeenCalled();
  expect(clients.claim).toHaveBeenCalledOnce();
});
