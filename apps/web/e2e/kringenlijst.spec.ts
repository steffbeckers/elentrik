import { expect, test, type APIRequestContext } from "@playwright/test";

// Elke run gebruikt een unieke naam, zodat de opruiming enkel de projecten van deze run raakt.
const naam = `Test Kringenlijst ${Date.now()}`;

type Samenvatting = { id: string; naam: string };

test.afterAll(async ({ request }) => {
  const antwoord = await request.get("/api/projecten");
  const projecten = (await antwoord.json()) as Samenvatting[];
  for (const project of projecten.filter((p) => p.naam.startsWith(naam))) {
    await request.delete(`/api/projecten/${project.id}`);
  }
});

async function nieuwProject(request: APIRequestContext, achtervoegsel: string): Promise<string> {
  const antwoord = await request.post("/api/projecten", {
    data: { naam: `${naam} ${achtervoegsel}`, klantnaam: "", stroomtype: "2x230V" },
  });
  expect(antwoord.status()).toBe(201);
  return ((await antwoord.json()) as { id: string }).id;
}

test("zonder kringen staat er Geen kringen", async ({ page, request }) => {
  await page.goto(`/projecten/${await nieuwProject(request, "leeg")}`);
  await page.getByTestId("tab-kringenlijst").click();
  await expect(page.getByTestId("tab-kringenlijst")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("kringenlijst-leeg")).toHaveText("Geen kringen");
  // Het schema en de onderdelen maken plaats voor de tabel.
  await expect(page.getByTestId("schema-canvas")).toHaveCount(0);
});

test("de tabel toont de kolommen van de pdf; een klik of toets selecteert het punt", async ({ page, request }) => {
  await page.goto(`/projecten/${await nieuwProject(request, "tabel")}`);
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  await page.getByTestId("tab-kringenlijst").click();

  const tabel = page.getByTestId("kringenlijst");
  const koppen = tabel.getByRole("columnheader");
  await expect(koppen).toHaveText(["Kring", "Punt", "Type", "Ruimte", "Beveiliging", "Differentieel", "Leiding"]);

  const rijen = tabel.locator('tbody tr[data-testid^="kringenlijst-rij-"]');
  await expect(rijen.first()).toBeVisible();
  const aantal = await rijen.count();
  expect(aantal).toBeGreaterThan(1);
  await expect(rijen.first()).toContainText("Contactdoos");

  // Muis: de rij wordt gemarkeerd en de eigenschappen volgen.
  await rijen.first().click();
  await expect(rijen.first()).toHaveAttribute("aria-pressed", "true");
  await expect(rijen.nth(1)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("eigenschappen-titel")).toBeVisible();

  // Toetsenbord: Enter of spatie op een gefocuste rij selecteert die rij.
  await rijen.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(rijen.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(rijen.first()).toHaveAttribute("aria-pressed", "false");
  await rijen.first().focus();
  await page.keyboard.press("Space");
  await expect(rijen.first()).toHaveAttribute("aria-pressed", "true");

  // De selectie blijft bij een wissel van tabblad en is terug te zien op het schema.
  await page.getByTestId("tab-eendraadschema").click();
  await expect(page.getByTestId("schema-canvas")).toBeVisible();
  await page.getByTestId("tab-kringenlijst").click();
  await expect(rijen.first()).toHaveAttribute("aria-pressed", "true");
});

test("de selectie van het schema staat gemarkeerd en in beeld, onder een vaste kop", async ({ page, request }) => {
  await page.goto(`/projecten/${await nieuwProject(request, "scroll")}`);
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  // Een extra punt onderaan: het wordt geselecteerd.
  await page.getByTestId("schema-canvas").locator('[data-testid^="plus-kring-einde-"]').click();

  // Een laag venster dwingt scrollen af.
  await page.setViewportSize({ width: 1280, height: 280 });
  await page.getByTestId("tab-kringenlijst").click();

  const tabel = page.getByTestId("kringenlijst");
  const rijen = tabel.locator('tbody tr[data-testid^="kringenlijst-rij-"]');
  const gekozen = rijen.last();
  await expect(gekozen).toHaveAttribute("aria-pressed", "true");
  await expect(gekozen).toBeInViewport();
  await expect.poll(() => tabel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // De kop blijft bovenaan het scrollvak staan.
  const vak = (await tabel.boundingBox())!;
  const kop = (await tabel.getByRole("columnheader").first().boundingBox())!;
  expect(Math.abs(kop.y - vak.y)).toBeLessThan(2);
});
