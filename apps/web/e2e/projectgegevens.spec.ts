import { expect, test } from "@playwright/test";

// Elke run gebruikt een unieke naam, zodat de opruiming enkel de projecten van deze run raakt.
const naam = `Test Projectgegevens ${Date.now()}`;

type Samenvatting = { id: string; naam: string };

test.afterAll(async ({ request }) => {
  const antwoord = await request.get("/api/projecten");
  const projecten = (await antwoord.json()) as Samenvatting[];
  for (const project of projecten.filter((p) => p.naam.startsWith(naam))) {
    await request.delete(`/api/projecten/${project.id}`);
  }
});

test("klant- en werfgegevens invullen, bewaren, ongedaan maken en herladen", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nieuw project" }).click();
  const nieuw = page.getByRole("dialog");
  await nieuw.getByLabel("Naam").fill(naam);
  await nieuw.getByRole("button", { name: "Aanmaken" }).click();
  await page.getByRole("row").filter({ hasText: naam }).getByRole("link", { name: "Openen" }).click();
  await expect(page).toHaveURL(/\/projecten\/[0-9a-f-]+$/);

  await page.getByTestId("projectnaam").click();
  const dialoog = page.getByRole("dialog");
  await expect(dialoog.getByTestId("projectdatum")).not.toHaveValue("");

  // Het werfadres is verplicht: zonder invulling blijft de dialoog open met fouten.
  await dialoog.getByRole("button", { name: "Bewaren" }).click();
  await expect(dialoog.getByText("Verplicht voor een adres.")).toHaveCount(4);
  await expect(dialoog).toBeVisible();

  // Een gedeeltelijk klantadres vraagt de rest, het hele klantadres is anders optioneel.
  await dialoog.getByTestId("werf-straat").fill("Dorpsstraat");
  await dialoog.getByTestId("werf-nummer").fill("3");
  await dialoog.getByTestId("werf-postcode").fill("9000");
  await dialoog.getByTestId("werf-gemeente").fill("Gent");
  await dialoog.getByTestId("klant-straat").fill("Kerkstraat");
  await dialoog.getByRole("button", { name: "Bewaren" }).click();
  await expect(dialoog.getByText("Verplicht voor een adres.")).toHaveCount(3);

  await dialoog.getByTestId("klant-nummer").fill("12");
  await dialoog.getByTestId("klant-postcode").fill("2000");
  await dialoog.getByTestId("klant-gemeente").fill("Antwerpen");
  await dialoog.getByTestId("werf-ean").fill("541448800000000001");
  await dialoog.getByTestId("projectdatum").fill("2026-11-02");
  await dialoog.getByRole("button", { name: "Bewaren" }).click();
  await expect(dialoog).toHaveCount(0);

  // Ongedaan maken zet het hele pakket in één stap terug.
  await page.getByTestId("ongedaan-maken").click();
  await page.getByTestId("projectnaam").click();
  await expect(dialoog.getByTestId("werf-straat")).toHaveValue("");
  await expect(dialoog.getByTestId("klant-straat")).toHaveValue("");
  await expect(dialoog.getByTestId("werf-ean")).toHaveValue("");
  await expect(dialoog.getByTestId("projectdatum")).not.toHaveValue("2026-11-02");
  await dialoog.getByRole("button", { name: "Annuleren" }).click();

  // Opnieuw doorvoeren, opslaan en herladen.
  await page.getByTestId("opnieuw").click();
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await page.reload();
  await page.getByTestId("projectnaam").click();
  await expect(dialoog.getByTestId("werf-straat")).toHaveValue("Dorpsstraat");
  await expect(dialoog.getByTestId("werf-gemeente")).toHaveValue("Gent");
  await expect(dialoog.getByTestId("klant-gemeente")).toHaveValue("Antwerpen");
  await expect(dialoog.getByTestId("werf-ean")).toHaveValue("541448800000000001");
  await expect(dialoog.getByTestId("projectdatum")).toHaveValue("2026-11-02");
});
