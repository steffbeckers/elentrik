import { expect, type Page } from "@playwright/test";

export type Paneel = "onderdelen" | "eigenschappen" | "bevindingen" | "opmaak";

/**
 * Zorgt dat een zijpaneel open staat. De knop is een schakelaar (een tweede klik sluit het paneel),
 * en Onderdelen en Eigenschappen volgen de selectie: het paneel kan dus al open staan. Daarom
 * klikt deze hulp alleen als het dicht is, en herhaalt ze tot het paneel open staat.
 */
export async function toonPaneel(page: Page, paneel: Paneel): Promise<void> {
  const knop = page.getByTestId(`werkruimte-${paneel}`);
  await expect(async () => {
    if ((await knop.getAttribute("aria-expanded")) !== "true") await knop.click();
    expect(await knop.getAttribute("aria-expanded")).toBe("true");
  }).toPass({ timeout: 10_000 });
}
