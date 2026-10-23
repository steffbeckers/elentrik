// Na een `page.goto` staat de server-gerenderde pagina er al vóór Vue ze hydrateert; een klik in
// die tussentijd gaat verloren. Deze hulp wacht tot Nuxt klaar is met hydrateren.
import type { Page } from "@playwright/test";

export async function wachtOpHydratatie(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const app = (document.querySelector("#__nuxt") as { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } } | null)
      ?.__vue_app__;
    return app?.$nuxt?.isHydrating === false;
  });
}

/** `page.goto` en daarna wachten op de hydratatie. */
export async function ga(page: Page, pad: string): Promise<void> {
  await page.goto(pad);
  await wachtOpHydratatie(page);
}
