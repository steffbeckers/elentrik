// De service worker in de productiebuild (playwright.sw.config.ts): hij bewaart de code van de app,
// zodat een open tabblad schermen blijft openen terwijl de server weg is, maar hij beantwoordt nooit een
// navigatie uit de cache. Alleen publieke pagina's.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { WEB_DIR } from "../e2e/omgeving";

/** De code van de build waar deze server mee draait (playwright.sw.config.ts bouwt in .output-sw). */
const BUILD_CODE = join(WEB_DIR, ".output-sw", "public", "_nuxt");

/** Wacht tot de service worker actief is en deze pagina beheert (na `clients.claim()`). */
async function wachtOpServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((klaar) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => klaar(), { once: true });
    });
  });
}

/** Het script waarmee de pagina de app start (`/_nuxt/<hash>.js`). */
async function entryScript(page: Page): Promise<string> {
  const src = await page.evaluate(
    () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/_nuxt/"]')?.src ?? null,
  );
  expect(src).not.toBeNull();
  return src!;
}

test("na het eerste bezoek staan de app-bestanden in de cache", async ({ page }) => {
  await page.goto("/inloggen");
  await wachtOpServiceWorker(page);
  const src = await entryScript(page);
  const inCache = await page.evaluate(async (url) => {
    const cache = await caches.open("elentrik-code");
    return (await cache.match(url)) !== undefined;
  }, src);
  expect(inCache).toBe(true);
});

test("na het installeren staat alle code van de build in de cache, ook de PDF.js-worker", async ({ page }) => {
  // Ook bestanden die de pagina zelf nog niet laadde: een oud tabblad dat de PDF-viewer pas na een update
  // opent, vindt zijn worker (`pdf.worker.min.<hash>.mjs`) dan nog.
  const verwacht = readdirSync(BUILD_CODE)
    .filter((naam) => /\.(js|mjs|css)$/.test(naam))
    .map((naam) => `/_nuxt/${naam}`)
    .sort();
  expect(verwacht.some((pad) => /^\/_nuxt\/pdf\.worker\.min\.[\w-]+\.mjs$/.test(pad))).toBe(true);
  await page.goto("/inloggen");
  await wachtOpServiceWorker(page);
  const inCache = await page.evaluate(async () => {
    const cache = await caches.open("elentrik-code");
    return (await cache.keys()).map((verzoek) => new URL(verzoek.url).pathname);
  });
  expect(verwacht.filter((pad) => !inCache.includes(pad))).toEqual([]);
});

test("offline opent een scherm waarvan de code nog niet geladen was", async ({ page, context }) => {
  // Met databesparing haalt NuxtLink de code van de registratiepagina niet vooraf op; zonder service
  // worker faalt deze test dan (nagegaan).
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true });
  });
  await page.goto("/inloggen");
  await wachtOpServiceWorker(page);
  await context.setOffline(true);
  const code: { status: number; uitServiceWorker: boolean }[] = [];
  page.on("response", (antwoord) => {
    if (new URL(antwoord.url()).pathname.startsWith("/_nuxt/")) {
      code.push({ status: antwoord.status(), uitServiceWorker: antwoord.fromServiceWorker() });
    }
  });
  await page.getByTestId("inloggen-naar-registreren").click();
  await expect(page.getByTestId("registreren-email")).toBeVisible();
  // De code van het nieuwe scherm kwam offline uit de service worker.
  expect(code.length).toBeGreaterThan(0);
  expect(code).toEqual(code.map(() => ({ status: 200, uitServiceWorker: true })));
});

test("offline wordt een navigatie niet uit de cache beantwoord", async ({ page, context }) => {
  await page.goto("/inloggen");
  await wachtOpServiceWorker(page);
  await context.setOffline(true);
  await expect(page.reload()).rejects.toThrow();
});

test("/sw.js en het manifest worden altijd opnieuw nagevraagd", async ({ request }) => {
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toBe("no-cache");
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.headers()["cache-control"]).toBe("no-cache");
  expect(manifest.headers()["content-type"]).toMatch(/^application\/manifest\+json/);
});
