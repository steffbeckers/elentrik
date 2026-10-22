import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const PLAN_PNG = fileURLToPath(new URL("./fixtures/plan.png", import.meta.url));
const PLAN_PDF = fileURLToPath(new URL("./fixtures/plan-2p.pdf", import.meta.url));

type Partij = { naam: string; adres?: unknown; logoBestandId?: string };

// De bedrijfsgegevens zijn één gedeelde rij: bewaar de bestaande tekstgegevens en zet ze na de run terug.
// (Een opgeladen logo blijft verwijzen naar het laatste bestand; de server kent geen "logo verwijderen".)
let origineel: Partij | undefined;

test.beforeAll(async ({ request }) => {
  origineel = (await (await request.get("/api/bedrijfsgegevens")).json()) as Partij;
});

test.afterAll(async ({ request }) => {
  if (!origineel) return;
  const { logoBestandId: _logo, ...tekst } = origineel;
  await request.put("/api/bedrijfsgegevens", { data: tekst });
});

async function opKlaar(page: Page) {
  await page.goto("/instellingen");
  // Het formulier is geladen zodra de bewaarknop actief is.
  await expect(page.getByTestId("bedrijf-bewaar")).toBeEnabled({ timeout: 20_000 });
}

test("de projectenlijst linkt naar de bedrijfsgegevens", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Bedrijfsgegevens" }).click();
  await expect(page).toHaveURL(/\/instellingen$/);
  await expect(page.getByRole("heading", { name: "Bedrijfsgegevens", level: 1 })).toBeVisible();
  await expect(page.getByTestId("bedrijf-naam")).toBeVisible();
});

test("een gedeeltelijk adres wordt niet bewaard, een volledig adres wel", async ({ page, request }) => {
  await opKlaar(page);
  const naam = `Elektro Test ${Date.now()}`;
  await page.getByTestId("bedrijf-naam").fill(naam);
  await page.getByLabel("Straat", { exact: true }).fill("Kerkstraat");

  const puts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().endsWith("/api/bedrijfsgegevens")) puts.push(r.url());
  });
  await page.getByTestId("bedrijf-bewaar").click();
  await expect(page.getByText("Verplicht voor een adres.")).toHaveCount(3);
  expect(puts).toHaveLength(0);

  await page.getByLabel("Nummer", { exact: true }).fill("12");
  await page.getByLabel("Postcode", { exact: true }).fill("2000");
  await page.getByLabel("Gemeente", { exact: true }).fill("Antwerpen");
  await page.getByLabel("E-mail", { exact: true }).fill("info@test.be");
  await page.getByTestId("bedrijf-bewaar").click();
  await expect(page.getByText("Bedrijfsgegevens bewaard.", { exact: true })).toBeVisible();

  const bewaard = (await (await request.get("/api/bedrijfsgegevens")).json()) as Record<string, unknown>;
  expect(bewaard).toMatchObject({
    naam,
    email: "info@test.be",
    adres: { straat: "Kerkstraat", nummer: "12", postcode: "2000", gemeente: "Antwerpen", land: "België" },
  });
  expect("telefoon" in bewaard).toBe(false);
  expect((bewaard.adres as Record<string, unknown>).bus).toBeUndefined();

  await page.reload();
  await expect(page.getByTestId("bedrijf-naam")).toHaveValue(naam);
  await expect(page.getByLabel("Gemeente", { exact: true })).toHaveValue("Antwerpen");
  await expect(page.getByLabel("Land", { exact: true })).toHaveValue("België");
});

test("een leeg adres wordt weggelaten", async ({ page, request }) => {
  await opKlaar(page);
  const naam = `Elektro Zonder Adres ${Date.now()}`;
  await page.getByTestId("bedrijf-naam").fill(naam);
  for (const veld of ["Straat", "Nummer", "Bus", "Postcode", "Gemeente"]) {
    await page.getByLabel(veld, { exact: true }).fill("");
  }
  await page.getByTestId("bedrijf-bewaar").click();
  await expect(page.getByText("Bedrijfsgegevens bewaard.", { exact: true })).toBeVisible();

  const bewaard = (await (await request.get("/api/bedrijfsgegevens")).json()) as Record<string, unknown>;
  expect(bewaard.naam).toBe(naam);
  expect("adres" in bewaard).toBe(false);
});

test("een lege naam wordt geweigerd", async ({ page }) => {
  await opKlaar(page);
  await page.getByTestId("bedrijf-naam").fill("");
  await page.getByTestId("bedrijf-bewaar").click();
  await expect(page.getByText("Geef je bedrijf een naam.")).toBeVisible();
});

test("een logo opladen toont het voorbeeld en blijft bewaard", async ({ page }) => {
  await opKlaar(page);
  await page.getByTestId("bedrijf-logo").setInputFiles(PLAN_PNG);
  await expect(page.getByText("Logo opgeladen.", { exact: true })).toBeVisible();

  const voorbeeld = page.getByTestId("bedrijf-logo-voorbeeld");
  await expect(voorbeeld).toBeVisible();
  await expect.poll(() => voorbeeld.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByTestId("bedrijf-logo-voorbeeld")).toBeVisible();
  await expect
    .poll(() => page.getByTestId("bedrijf-logo-voorbeeld").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
});

test("een verkeerd of te groot logo wordt afgekeurd zonder iets te versturen", async ({ page }) => {
  await opKlaar(page);
  const uploads: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/bedrijfsgegevens/logo")) uploads.push(r.url());
  });

  await page.getByTestId("bedrijf-logo").setInputFiles(PLAN_PDF);
  await expect(page.getByText("Dit bestandstype wordt niet aanvaard.", { exact: true })).toBeVisible();

  const pngKop = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const teGroot = Buffer.concat([Buffer.from(pngKop), Buffer.alloc(2 * 1024 * 1024)]);
  await page.getByTestId("bedrijf-logo").setInputFiles({ name: "groot.png", mimeType: "image/png", buffer: teGroot });
  await expect(page.getByText("Dit logo is groter dan 2 MB.", { exact: true })).toBeVisible();

  expect(uploads).toHaveLength(0);
});

test("de pagina past op een telefoonbreedte", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await opKlaar(page);
  await expect(page.getByLabel("Gemeente", { exact: true })).toBeVisible();
  const overloop = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overloop).toBeLessThanOrEqual(0);
  await expect(page.getByTestId("bedrijf-bewaar")).toBeVisible();
});
