import { expect, test } from "@playwright/test";
import { gebruikTestgebruiker } from "./hulp/inloggen";

// Eén ingelogde testgebruiker met een eigen organisatie voor dit hele bestand.
gebruikTestgebruiker(test, { voorvoegsel: "projectgegevens" });

// Elke run gebruikt een unieke naam, zodat de projecten van deze run herkenbaar zijn; `ruimOp` wist ze na afloop.
const naam = `Test Projectgegevens ${Date.now()}`;

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

  // Een leeg werfadres blokkeert niets: hernoemen lukt zonder werfadres.
  // Genummerde secties: Klant, Werfadres, Installatie, Metingen en Dossier.
  await expect(dialoog.getByRole("heading", { level: 3 })).toHaveText(["1 Klant", "2 Werfadres", "3 Installatie", "4 Metingen", "5 Dossier"]);
  // "Zelfde als klantadres" staat aan bij een leeg werfadres: de werfvelden zijn verborgen.
  await expect(dialoog.getByTestId("werf-zelfde-als-klant")).toBeChecked();
  await expect(dialoog.getByTestId("werf-straat")).toHaveCount(0);
  await dialoog.getByLabel("Projectnaam").fill(`${naam} hernoemd`);
  await dialoog.getByRole("button", { name: "Bewaren" }).click();
  await expect(dialoog).toHaveCount(0);
  await expect(page.getByTestId("projectnaam")).toContainText("hernoemd");

  // Een gedeeltelijk werfadres vraagt de rest, zoals het klantadres.
  await page.getByTestId("projectnaam").click();
  await dialoog.getByTestId("werf-zelfde-als-klant").click();
  await dialoog.getByTestId("werf-straat").fill("Dorpsstraat");
  await dialoog.getByRole("button", { name: "Bewaren" }).click();
  await expect(dialoog.getByText("Verplicht voor een adres.")).toHaveCount(3);
  await expect(dialoog).toBeVisible();

  // Een gedeeltelijk klantadres vraagt de rest, het hele klantadres is anders optioneel.
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
  await expect(dialoog.getByTestId("werf-zelfde-als-klant")).toBeChecked();
  await expect(dialoog.getByTestId("klant-straat")).toHaveValue("");
  await expect(dialoog.getByTestId("werf-ean")).toHaveValue("");
  await expect(dialoog.getByTestId("projectdatum")).not.toHaveValue("2026-11-02");
  await dialoog.getByRole("button", { name: "Annuleren" }).click();

  // Opnieuw doorvoeren, opslaan en herladen.
  await page.getByTestId("opnieuw").click();
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await page.reload();
  await page.getByTestId("projectnaam").click();
  await expect(dialoog.getByTestId("werf-zelfde-als-klant")).not.toBeChecked();
  await expect(dialoog.getByTestId("werf-straat")).toHaveValue("Dorpsstraat");
  await expect(dialoog.getByTestId("werf-gemeente")).toHaveValue("Gent");
  await expect(dialoog.getByTestId("klant-gemeente")).toHaveValue("Antwerpen");
  await expect(dialoog.getByTestId("werf-ean")).toHaveValue("541448800000000001");
  await expect(dialoog.getByTestId("projectdatum")).toHaveValue("2026-11-02");
});

test("metingen invullen in Projectgegevens, bewaren en na herladen terugzien", async ({ page }) => {
  const metingNaam = `${naam} metingen`;
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nieuw project" }).click();
  const nieuw = page.getByRole("dialog");
  await nieuw.getByLabel("Naam").fill(metingNaam);
  await nieuw.getByRole("button", { name: "Aanmaken" }).click();
  await page.getByRole("row").filter({ hasText: metingNaam }).getByRole("link", { name: "Openen" }).click();
  await expect(page).toHaveURL(/\/projecten\/[0-9a-f-]+$/);

  await page.getByTestId("projectnaam").click();
  const dialoog = page.getByRole("dialog");
  const metingen = dialoog.getByTestId("metingen");
  await expect(metingen.getByRole("heading", { name: "Metingen" })).toBeVisible();
  await expect(metingen.getByText("Geregistreerde meetwaarden; geen beoordeling door Elentrik.")).toBeVisible();
  await expect(dialoog.getByTestId("meting-aardingsweerstand")).toHaveValue("");

  // Een negatieve waarde wordt geweigerd bij het veld, zonder te bewaren.
  await dialoog.getByTestId("meting-aardingsweerstand").fill("-1");
  await dialoog.getByRole("button", { name: "Bewaren" }).click();
  await expect(dialoog.getByText("Geef een getal van 0 of meer, of laat het veld leeg.")).toBeVisible();
  await expect(dialoog).toBeVisible();

  await dialoog.getByTestId("meting-datum").fill("2026-11-05");
  await dialoog.getByTestId("meting-aardingsweerstand").fill("28.5");
  await dialoog.getByTestId("meting-isolatieweerstand").fill("250");
  await dialoog.getByTestId("meting-meettoestel").fill("Fluke 1664 FC");
  await dialoog.getByTestId("meting-opmerking").fill("Gemeten met open hoofdschakelaar");
  await dialoog.getByRole("button", { name: "Bewaren" }).click();
  await expect(dialoog).toHaveCount(0);

  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await page.reload();
  await page.getByTestId("projectnaam").click();
  await expect(dialoog.getByTestId("meting-datum")).toHaveValue("2026-11-05");
  await expect(dialoog.getByTestId("meting-aardingsweerstand")).toHaveValue("28.5");
  await expect(dialoog.getByTestId("meting-isolatieweerstand")).toHaveValue("250");
  await expect(dialoog.getByTestId("meting-meettoestel")).toHaveValue("Fluke 1664 FC");
  await expect(dialoog.getByTestId("meting-opmerking")).toHaveValue("Gemeten met open hoofdschakelaar");
});

test("een open keuzelijst sluit niet alleen: één klik op Bewaren bewaart", async ({ page }) => {
  const keuzeNaam = `${naam} keuzelijst`;
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nieuw project" }).click();
  const nieuw = page.getByRole("dialog");
  await nieuw.getByLabel("Naam").fill(keuzeNaam);
  await nieuw.getByRole("button", { name: "Aanmaken" }).click();
  await page.getByRole("row").filter({ hasText: keuzeNaam }).getByRole("link", { name: "Openen" }).click();
  await expect(page).toHaveURL(/\/projecten\/[0-9a-f-]+$/);

  await page.getByTestId("projectnaam").click();
  const dialoog = page.getByRole("dialog");
  await dialoog.getByTestId("werf-ean").fill("541448800000000002");
  // Een keuzelijst openen en zonder keuze meteen op Bewaren klikken: één echte muisklik volstaat.
  // Bewust een muisklik op de plek van de knop, zoals een gebruiker: een modale keuzelijst zou de
  // rest van de dialoog voor muis en toegankelijkheidsboom afschermen, en dan sloot de eerste klik
  // alleen de keuzelijst.
  const bewaren = await dialoog.getByRole("button", { name: "Bewaren" }).boundingBox();
  await dialoog.getByTestId("installatiecontext").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.mouse.click(bewaren!.x + bewaren!.width / 2, bewaren!.y + bewaren!.height / 2);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.locator("#projectgegevens-formulier")).toHaveCount(0);

  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await page.reload();
  await page.getByTestId("projectnaam").click();
  await expect(dialoog.getByTestId("werf-ean")).toHaveValue("541448800000000002");
});
