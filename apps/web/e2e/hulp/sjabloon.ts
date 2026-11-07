import { expect, type Page } from '@playwright/test';

/** Testfixtures kiezen hun bestaande eerste bord uitdrukkelijk in de invoegdialoog. */
export async function bevestigSjabloonOpBord(page: Page): Promise<void> {
  await page.getByTestId('invoeg-bestemming').click();
  await page.getByRole('option').first().click();
  await page.getByTestId('bevestig-sjabloon').click();
  await expect(page.getByTestId('bevestig-sjabloon')).toHaveCount(0);
}
