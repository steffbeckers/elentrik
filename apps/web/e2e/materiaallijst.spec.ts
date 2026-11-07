import { bevestigSjabloonOpBord } from './hulp/sjabloon';
import { expect, test } from "@playwright/test";
import { gebruikTestgebruiker } from "./hulp/inloggen";

gebruikTestgebruiker(test, { voorvoegsel: "materialen" });

test("materiaallijst telt kabel en draad en bewaart aanpasbare lengtes", async ({ page, request }, testInfo) => {
  const antwoord = await request.post("/api/projecten", {
    data: { naam: "Test Materiaallijst", klantnaam: "", stroomtype: "2x230V" },
  });
  expect(antwoord.status()).toBe(201);
  const { id } = await antwoord.json();
  await page.goto(`/projecten/${id}`);
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  await bevestigSjabloonOpBord(page);
  await page.getByTestId("tab-materiaallijst").click();
  const tabel = page.getByTestId("materiaallijst");
  const kabel = tabel.locator('[data-materiaal-type="leiding"]');
  await expect(kabel.getByTestId("materiaal-hoeveelheid")).toHaveText("— m");
  await expect(page.getByTestId("materiaallijst-ontbrekend")).toBeVisible();
  await kabel.locator("summary").click();
  await kabel.getByRole("button").first().click();
  await page.getByTestId("werkruimte-eigenschappen").click();
  await page.getByTestId("veld-lengte_m").fill("12.5");
  await page.getByTestId("veld-lengte_m").blur();
  await expect(kabel.getByTestId("materiaal-hoeveelheid")).toHaveText("12,5 m");
  await expect(page.getByTestId("materiaallijst-ontbrekend")).toHaveCount(0);

  await page.getByTestId("veld-kabeltype").fill("VOB");
  await page.getByTestId("veld-kabeltype").blur();
  await expect(kabel.getByTestId("materiaal-hoeveelheid")).toHaveText("37,5 m");
  await page.getByTestId("ongedaan-maken").click();
  await expect(kabel.getByTestId("materiaal-hoeveelheid")).toHaveText("12,5 m");
  await page.getByTestId("opnieuw").click();
  await expect(kabel.getByTestId("materiaal-hoeveelheid")).toHaveText("37,5 m");
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await page.reload();
  await page.getByTestId("tab-materiaallijst").click();
  await expect(kabel.getByTestId("materiaal-hoeveelheid")).toHaveText("37,5 m");
  await expect(tabel.locator('[data-materiaal-type="contactdoos"]')).toContainText("stuks");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("materiaallijst-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("materiaallijst-mobile.png"), fullPage: true });
});

test("de materiaallijst is te downloaden als CSV voor Excel", async ({ page, request }) => {
  const antwoord = await request.post("/api/projecten", {
    data: { naam: "Test CSV: lijst", klantnaam: "", stroomtype: "2x230V" },
  });
  const { id } = await antwoord.json();
  await page.goto(`/projecten/${id}`);
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  await bevestigSjabloonOpBord(page);
  await page.getByTestId("tab-materiaallijst").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("materiaallijst-csv").click()]);
  expect(download.suggestedFilename()).toBe("Test CSV lijst-materiaallijst.csv");
  const bytes = await (await import("node:fs/promises")).readFile((await download.path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const regels = bytes.toString("utf8").slice(1).split("\r\n");
  expect(regels[0]).toBe("Materiaal;Uitvoering;Hoeveelheid;Eenheid");
  expect(regels.some((r) => r.startsWith("Contactdoos;"))).toBe(true);
});
