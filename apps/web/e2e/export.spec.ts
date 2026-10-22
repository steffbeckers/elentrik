import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Elke run gebruikt een unieke naam, zodat de opruiming enkel de projecten van deze run raakt.
const naam = `Test Exportdialoog ${Date.now()}`;

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

async function openMetKring(page: Page, id: string): Promise<void> {
  await page.goto(`/projecten/${id}`);
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
}

test("exporteren bewaart eerst, downloadt de PDF en werkt de lijst bij", async ({ page, request }) => {
  const id = await nieuwProject(request, "gewoon");
  await openMetKring(page, id);
  // Meteen exporteren, zonder de vertraging van de autosave af te wachten.
  await page.getByTestId("exporteren").click();

  const dialoog = page.getByRole("dialog");
  await expect(dialoog.getByTestId("export-versie")).toHaveValue("V1");
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");
  await expect(dialoog.getByTestId("export-lijst")).toContainText("Nog geen exports.");
  await expect(dialoog.getByTestId("export-bijlage")).toBeEnabled();

  const download = page.waitForEvent("download");
  await dialoog.getByTestId("export-start").click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

  await expect(dialoog.getByTestId("export-rij-V1")).toContainText("geen fouten");
  await expect(dialoog.getByTestId("export-versie")).toHaveValue("V2");
  await expect(dialoog.getByTestId("export-rij-V1").getByRole("link", { name: "Downloaden" })).toHaveAttribute(
    "href",
    /^\/api\/bestanden\/[0-9a-f-]+$/,
  );
});

test("onopgeloste fouten: bijlage verplicht en eerst een bevestiging", async ({ page, request }) => {
  const id = await nieuwProject(request, "fouten");
  await openMetKring(page, id);
  // Een zevende contactdoos die er vijf telt: elf op één kring is een fout.
  await page.getByTestId("schema-canvas").locator('[data-testid^="plus-kring-einde-"]').click();
  const aantal = page.getByTestId("veld-aantal");
  await aantal.fill("5");
  await aantal.blur();
  await expect(page.getByTestId("bevindingenteller")).toHaveAttribute("title", /^1 fout/);

  await page.getByTestId("exporteren").click();
  const dialoog = page.getByRole("dialog");
  const bijlage = dialoog.getByTestId("export-bijlage");
  await expect(bijlage).toBeChecked();
  await expect(bijlage).toBeDisabled();
  await expect(dialoog).toContainText("Er is 1 onopgeloste fout; de bijlage komt verplicht mee.");

  await dialoog.getByTestId("export-start").click();
  const bevestiging = dialoog.getByTestId("export-bevestiging");
  await expect(bevestiging).toContainText(
    "Er is 1 onopgeloste fout. De PDF vermeldt ze in de bijlage. Toch exporteren?",
  );
  await bevestiging.getByRole("button", { name: "Annuleren" }).click();
  await expect(bevestiging).toHaveCount(0);

  await dialoog.getByTestId("export-start").click();
  const download = page.waitForEvent("download");
  await dialoog.getByRole("button", { name: "Toch exporteren" }).click();
  await download;
  await expect(dialoog.getByTestId("export-rij-V1")).toContainText("1 fout");
});

test("exporteren kan niet als opslaan mislukt", async ({ page, request }) => {
  const id = await nieuwProject(request, "offline");
  await page.goto(`/projecten/${id}`);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");
  await page.route(`**/api/projecten/${id}`, (route) =>
    route.request().method() === "PUT" ? route.fulfill({ status: 503 }) : route.fallback(),
  );
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  await page.getByTestId("exporteren").click();

  const dialoog = page.getByRole("dialog");
  await expect(dialoog.getByTestId("export-geblokkeerd")).toContainText("Exporteren kan nu niet");
  await expect(dialoog.getByTestId("export-start")).toBeDisabled();
});
