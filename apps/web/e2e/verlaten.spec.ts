import { expect, test } from "@playwright/test";

// Elke run gebruikt een unieke naam, zodat de opruiming enkel de projecten van deze run raakt.
const naam = `Test Verlaten ${Date.now()}`;
const bevestiging = "Je wijzigingen staan nog niet op de server. Wil je de editor toch verlaten?";

type Samenvatting = { id: string; naam: string };
type Project = { versie: number; document: unknown };

test.afterAll(async ({ request }) => {
  const antwoord = await request.get("/api/projecten");
  const projecten = (await antwoord.json()) as Samenvatting[];
  for (const project of projecten.filter((p) => p.naam.startsWith(naam))) {
    await request.delete(`/api/projecten/${project.id}`);
  }
});

test("navigeren in de app bij een conflict vraagt een bevestiging en het concept blijft", async ({ page, request }) => {
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  const { id } = (await aangemaakt.json()) as { id: string };

  await page.goto(`/projecten/${id}`);
  await page.waitForLoadState("networkidle");
  const canvas = page.getByTestId("schema-canvas");
  await expect(canvas.locator('[data-testid^="plus-rail-einde-"]')).toHaveCount(1);

  // Een ander venster bewaart intussen: de server staat nu een versie verder.
  const project = (await (await request.get(`/api/projecten/${id}`)).json()) as Project;
  const ander = await request.put(`/api/projecten/${id}`, {
    headers: { "If-Match": String(project.versie) },
    data: { document: project.document },
  });
  expect(ander.ok()).toBe(true);

  // Een wijziging in dit venster botst daarop: conflict.
  await page.getByRole("button", { name: "Passend maken" }).click();
  await canvas.locator('[data-testid^="plus-rail-einde-"]').click();
  const status = page.getByTestId("opslagstatus");
  await expect(status).toHaveText("Conflict", { timeout: 15_000 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const dialogen: string[] = [];
  let accepteer = false;
  page.on("dialog", async (dialog) => {
    dialogen.push(dialog.message());
    if (accepteer) await dialog.accept();
    else await dialog.dismiss();
  });

  // Annuleren houdt de gebruiker op de pagina, nog altijd in conflict.
  const terug = page.getByRole("link", { name: "Naar de projecten" });
  await terug.click();
  await expect.poll(() => dialogen).toEqual([bevestiging]);
  await expect(page).toHaveURL(new RegExp(`/projecten/${id}$`));
  await expect(status).toHaveText("Conflict");

  // Bevestigen verlaat de pagina; het concept blijft staan en wordt bij het openen aangeboden.
  accepteer = true;
  await terug.click();
  await expect(page).toHaveURL(/\/$/);
  expect(dialogen).toEqual([bevestiging, bevestiging]);

  await page.goto(`/projecten/${id}`);
  const conceptDialoog = page.getByRole("dialog");
  await expect(conceptDialoog).toContainText("Lokaal concept gevonden");
  // Het concept steunt op een oudere versie: bewaren geeft opnieuw het conflict, niets gaat stil verloren.
  await conceptDialoog.getByRole("button", { name: "Concept laden" }).click();
  await expect(status).toHaveText("Conflict", { timeout: 15_000 });
});
