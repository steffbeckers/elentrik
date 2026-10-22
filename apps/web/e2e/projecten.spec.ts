import { expect, test } from "@playwright/test";
import { gebruikTestgebruiker } from "./hulp/inloggen";

// Eén ingelogde testgebruiker met een eigen organisatie voor dit hele bestand.
gebruikTestgebruiker(test, { voorvoegsel: "projecten" });

// Elke run gebruikt een unieke naam, zodat herhaalde runs niet botsen en de
// opruiming enkel de projecten van deze run raakt.
const naam = `Test Janssens ${Date.now()}`;
const kopieNaam = `${naam} (kopie)`;
const klantnaam = "<img src=x onerror=alert(1)>";

type Samenvatting = { id: string; naam: string };

test.afterAll(async ({ request }) => {
  const antwoord = await request.get("/api/projecten");
  const projecten = (await antwoord.json()) as Samenvatting[];
  for (const project of projecten.filter((p) => p.naam.startsWith(naam))) {
    await request.delete(`/api/projecten/${project.id}`);
  }
});

test("een mislukte lijst toont een foutmelding in plaats van de lege staat", async ({ page }) => {
  await page.route("**/api/projecten", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"statusCode":500}' }),
  );
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Projecten laden mislukt")).toBeVisible();
  await expect(page.getByText("Nog geen projecten")).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);

  // Opnieuw proberen met een werkende API herstelt de lijst.
  await page.unroute("**/api/projecten");
  await page.getByRole("button", { name: "Opnieuw proberen" }).click();
  await expect(page.getByText("Projecten laden mislukt")).toHaveCount(0);
  await expect(page.getByRole("table")).toBeVisible();
});

test("maak, dupliceer en verwijder een project", async ({ page }) => {
  const dialogen: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogen.push(dialog.message());
    await dialog.dismiss();
  });

  await page.goto("/");
  // Wacht tot Nuxt gehydrateerd is en de lijst geladen is, anders doet de klik niets.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nieuw project" }).click();

  const nieuw = page.getByRole("dialog");
  await nieuw.getByLabel("Naam").fill(naam);
  await nieuw.getByLabel("Klant").fill(klantnaam);
  await nieuw.getByRole("button", { name: "Aanmaken" }).click();

  // De klantnaam staat letterlijk als tekst in de cel, nooit als HTML.
  const rij = page.getByRole("row").filter({ hasText: naam });
  await expect(rij).toHaveCount(1);
  await expect(rij.getByRole("cell", { name: klantnaam })).toHaveText(klantnaam);
  await expect(page.locator("table img")).toHaveCount(0);

  await rij.getByRole("button", { name: "Dupliceren" }).click();
  const kopie = page.getByRole("row").filter({ hasText: kopieNaam });
  await expect(kopie).toHaveCount(1);

  await kopie.getByRole("button", { name: "Verwijderen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Verwijderen" }).click();
  await expect(page.getByRole("row").filter({ hasText: kopieNaam })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: naam })).toHaveCount(1);

  expect(dialogen).toEqual([]);
});

test("sneltoetsen blijven werken na een klik op een paneelknop", async ({ page, request }) => {
  const antwoord = await request.post("/api/projecten", {
    data: { naam: `${naam} editor`, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  const { id } = (await antwoord.json()) as { id: string };

  await page.goto(`/projecten/${id}`);
  await page.waitForLoadState("networkidle");

  // Na een klik heeft de knop de focus; toch kiest de letter een ander onderdeel.
  await page.getByTestId("onderdeel-contactdoos").click();
  await expect(page.getByTestId("onderdeel-contactdoos")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("l");
  await expect(page.getByTestId("onderdeel-lichtpunt")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("onderdeel-contactdoos")).toHaveAttribute("aria-pressed", "false");

  // Het meervoud van de teller komt uit de pluralisatie van i18n.
  await expect(page.getByTestId("bevindingenteller")).toHaveAttribute(
    "aria-label",
    "0 fouten en 0 waarschuwingen",
  );
});
