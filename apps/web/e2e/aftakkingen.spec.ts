import { expect, test } from "@playwright/test";
import { ga } from "./hulp/hydratatie";
import { gebruikTestgebruiker } from "./hulp/inloggen";

gebruikTestgebruiker(test, { voorvoegsel: "aftakkingen" });

test("bouw vrije aftakkingen, bedien de plus met het toetsenbord en heropen", async ({ page, request }, testInfo) => {
  const antwoord = await request.post("/api/projecten", {
    data: { naam: `Aftakkingen ${Date.now()}`, klantnaam: "Voorbeeld", stroomtype: "2x230V" },
  });
  expect(antwoord.status()).toBe(201);
  const { id } = await antwoord.json() as { id: string };
  await ga(page, `/projecten/${id}`);
  const canvas = page.getByTestId("schema-canvas");
  const passend = () => page.getByRole("button", { name: "Passend maken" }).click();
  const labels = (label: string) => canvas.locator("svg text").filter({ hasText: new RegExp(`^${label}$`) });
  await passend();
  await page.getByTestId("onderdeel-leiding").click();
  await canvas.locator('[data-testid^="plus-rail-einde-"]').click();
  const leiding = (await canvas.locator('[data-testid^="selectie-"]').getAttribute("data-testid"))!.slice("selectie-".length);
  await page.getByTestId("onderdeel-schakelaar").click();
  const toevoegen = page.getByTestId("aftakking-toevoegen");
  await expect(toevoegen).toBeEnabled();
  await toevoegen.focus();
  await page.keyboard.press("Enter");
  await expect(labels("A1")).toHaveCount(1);
  await page.getByTestId("onderdeel-lichtpunt").click();
  await passend();
  await expect(page.getByTestId("schema-invoegsoort")).toContainText("Aftakking uitbreiden");
  await expect(page.getByTestId("schema-invoegpunt")).toContainText("A1");
  await page.getByTestId("schema-toevoegen").click();
  await page.getByTestId("werkruimte-eigenschappen").click();
  await page.getByTestId("veld-aantal").fill("2");
  await page.getByTestId("veld-aantal").blur();
  await expect(labels("A1")).toHaveCount(1);
  await expect(labels("2×")).toHaveCount(1);

  await page.getByTestId("werkruimte-onderdelen").click();

  // Een tweede aftakking begint aan dezelfde leiding; de wisselvariant geldt voor beide schakelaars.
  await passend();
  await canvas.locator(`[data-node-id="${leiding}"]`).click({ force: true });
  await page.getByTestId("onderdeel-schakelaar").click();
  await page.getByTestId("symbolen-openen").click();
  const dialoog = page.getByRole("dialog");
  await dialoog.getByTestId("symbolenkaart-schakelaar").click();
  await dialoog.getByTestId(/^combinatie-\d+$/).filter({ has: page.getByText("Wissel", { exact: true }) }).click();
  await dialoog.getByTestId("symbolen-kiezen").click();
  await toevoegen.click();
  const tweede = (await canvas.locator('[data-testid^="selectie-"]').getAttribute("data-testid"))!.slice("selectie-".length);
  await passend();
  await page.getByTestId(`plus-aftakking-einde-${tweede}`).focus();
  await page.keyboard.press("Enter");
  await expect(labels("A2")).toHaveCount(1);
  await page.getByTestId("onderdeel-lichtpunt").click();
  const laatsteSelectie = (await canvas.locator('[data-testid^="selectie-"]').getAttribute("data-testid"))!.slice("selectie-".length);
  await passend();
  await page.getByTestId(`plus-aftakking-einde-${laatsteSelectie}`).focus();
  await page.keyboard.press("Space");
  await expect(labels("A2")).toHaveCount(1);

  await passend();
  await canvas.locator(`[data-node-id="${leiding}"]`).click({ force: true });
  await page.getByTestId("onderdeel-schakelaar").click();
  await toevoegen.click();
  await expect(labels("A3")).toHaveCount(1);
  await passend();
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  const opgeslagen = await (await request.get(`/api/projecten/${id}`)).json();
  const nodes = Object.values(opgeslagen.document.nodes) as Array<{ id: string; aftakking?: true; soort?: string }>;
  expect(nodes.filter((n) => n.aftakking)).toHaveLength(6);
  expect(nodes.filter((n) => n.aftakking && n.soort === "wissel")).toHaveLength(3);

  await page.screenshot({ path: testInfo.outputPath("desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await expect(labels("A1")).toHaveCount(1);
  await expect(labels("A2")).toHaveCount(1);
  await expect(labels("A3")).toHaveCount(1);
});
