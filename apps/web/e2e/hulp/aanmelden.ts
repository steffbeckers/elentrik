// Inloggen en uitloggen via de pagina's zelf. Aanmelden met een wachtwoord is beperkt tot 3 per
// 10 s vanaf 127.0.0.1: bij een 429 wacht deze hulp één keer en probeert opnieuw. Gebruik ze
// zuinig (een login per stap, nooit in een lus); voor de rest hergebruiken de specs `storageState`.
import { expect, type Page } from "@playwright/test";
import { ga, wachtOpHydratatie } from "./hydratatie";
import { TESTWACHTWOORD } from "./inloggen";

const TE_VEEL = "Te veel pogingen. Wacht even en probeer het opnieuw.";
/** Het venster van de rate limiter is 10 s. */
const WACHT_NA_429_MS = 11_000;

/** Op de inlogpagina (al geladen en gehydrateerd): inloggen met een wachtwoord en wachten op de redirect. */
export async function meldAanOpPagina(page: Page, email: string, wachtwoord = TESTWACHTWOORD): Promise<void> {
  for (let poging = 1; ; poging++) {
    await page.getByTestId("inloggen-email").fill(email);
    await page.getByTestId("inloggen-wachtwoord").fill(wachtwoord);
    await page.getByTestId("inloggen-knop").click();
    const melding = page.getByTestId("inloggen-melding");
    const uitkomst = await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith("/inloggen"), { timeout: 20_000 }).then(() => "ingelogd" as const),
      melding.waitFor({ timeout: 20_000 }).then(() => "melding" as const),
    ]);
    if (uitkomst === "ingelogd") return;
    if (poging >= 2 || (await melding.textContent())?.trim() !== TE_VEEL) {
      throw new Error(`Inloggen mislukt: ${await melding.textContent()}`);
    }
    await page.waitForTimeout(WACHT_NA_429_MS);
  }
}

/** Naar de inlogpagina en inloggen met een wachtwoord. */
export async function meldAan(page: Page, email: string, wachtwoord = TESTWACHTWOORD): Promise<void> {
  await ga(page, "/inloggen");
  await meldAanOpPagina(page, email, wachtwoord);
  await wachtOpHydratatie(page);
}

/** Uitloggen via het gebruikersmenu; daarna staat de pagina op /inloggen. */
export async function meldAf(page: Page): Promise<void> {
  await page.getByTestId("gebruiker-menu").click();
  await page.getByTestId("uitloggen").click();
  await expect(page).toHaveURL(/\/inloggen$/);
  await wachtOpHydratatie(page);
}
