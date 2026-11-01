import { expect, type Page } from "@playwright/test";

/** De actieve organisatie blijft in het gebruikersmenu herkenbaar, ook zonder losse kiezer. */
export async function verwachtOrganisatie(page: Page, naam: string) {
  await page.getByTestId("gebruiker-menu").click();
  await expect(page.getByTestId("actieve-organisatie")).toHaveText(naam);
  await page.keyboard.press("Escape");
}

export async function openOrganisatieKeuze(page: Page) {
  const kiezer = page.getByTestId("organisatie-keuze");
  if (await kiezer.isVisible()) await kiezer.click();
  else await page.getByTestId("gebruiker-menu").click();
}
