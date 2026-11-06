import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// De onderhoudspagina van de proxy (deploy/nas/proxy/onderhoud.html). Elke test vangt alle verzoeken
// op: de navigatie krijgt de inhoud van het bestand en /api/gezondheid krijgt wat de test zegt. Er is
// dus geen app of proxy nodig. De klok loopt via page.clock.
const PAGINA = readFileSync(
  fileURLToPath(new URL("../../../deploy/nas/proxy/onderhoud.html", import.meta.url)),
  "utf8",
);

type Gezondheid = { status: number; body: string };
const NIET_BEREIKBAAR: Gezondheid = { status: 503, body: JSON.stringify({ ok: false }) };
const GEZOND: Gezondheid = { status: 200, body: JSON.stringify({ ok: true }) };

/** Dient de pagina voor elke navigatie en laat `antwoord()` bepalen wat /api/gezondheid geeft. */
async function bedien(page: Page, antwoord: () => Gezondheid = () => NIET_BEREIKBAAR) {
  const teller = { navigaties: 0, controles: 0 };
  await page.route("**/*", async (route) => {
    const verzoek = route.request();
    if (verzoek.isNavigationRequest()) {
      teller.navigaties++;
      await route.fulfill({
        status: 503,
        contentType: "text/html; charset=utf-8",
        headers: { "cache-control": "no-store" },
        body: PAGINA,
      });
    } else if (new URL(verzoek.url()).pathname === "/api/gezondheid") {
      teller.controles++;
      const { status, body } = antwoord();
      await route.fulfill({ status, contentType: "application/json", body });
    } else {
      await route.fulfill({ status: 404, body: "" });
    }
  });
  return teller;
}

async function open(page: Page, url = "http://elentrik.app/diep/pad") {
  await page.clock.install();
  await page.goto(url);
}

test.describe("taal", () => {
  test.describe("onbekende taal", () => {
    test.use({ locale: "de-DE" });
    test("nl als terugval, en de titel 'Elentrik wordt bijgewerkt'", async ({ page }) => {
      await bedien(page);
      await open(page);
      await expect(page.getByTestId("onderhoud-titel")).toHaveText("Elentrik wordt bijgewerkt");
      await expect(page.getByTestId("onderhoud-tekst")).toContainText("Even geduld");
      await expect(page.getByTestId("onderhoud-opnieuw")).toHaveText("Nu opnieuw proberen");
      await expect(page).toHaveTitle("Elentrik wordt bijgewerkt");
      await expect(page.locator("html")).toHaveAttribute("lang", "nl");
    });
  });

  test.describe("fr-BE", () => {
    test.use({ locale: "fr-BE" });
    test("fr volgens de browser", async ({ page }) => {
      await bedien(page);
      await open(page);
      await expect(page.getByTestId("onderhoud-titel")).toHaveText(
        "Elentrik est en cours de mise à jour",
      );
      await expect(page.getByTestId("onderhoud-opnieuw")).toHaveText("Réessayer maintenant");
      await expect(page).toHaveTitle("Elentrik est en cours de mise à jour");
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    });
  });

  test.describe("en-GB", () => {
    test.use({ locale: "en-GB" });
    test("en volgens de browser", async ({ page }) => {
      await bedien(page);
      await open(page);
      await expect(page.getByTestId("onderhoud-titel")).toHaveText("Elentrik is being updated");
      await expect(page.getByTestId("onderhoud-opnieuw")).toHaveText("Try again now");
      await expect(page).toHaveTitle("Elentrik is being updated");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });
  });
});

test("herlaadt zodra /api/gezondheid 200 { ok: true } geeft", async ({ page }) => {
  let antwoord = NIET_BEREIKBAAR;
  const teller = await bedien(page, () => antwoord);
  await open(page);
  expect(teller.navigaties).toBe(1);

  // Eerst 503: na 5 s een controle, maar geen herlaad.
  await page.clock.runFor(5_000);
  await expect.poll(() => teller.controles).toBe(1);
  expect(teller.navigaties).toBe(1);

  // Dan 200 { ok: true }: de volgende controle herlaadt de pagina.
  antwoord = GEZOND;
  await page.clock.runFor(5_000);
  await expect.poll(() => teller.navigaties).toBe(2);
});

test("een 200 zonder ok: true herlaadt niet", async ({ page }) => {
  const teller = await bedien(page, () => ({ status: 200, body: JSON.stringify({ ok: false }) }));
  await open(page);
  await page.clock.runFor(5_000);
  await expect.poll(() => teller.controles).toBe(1);
  await page.clock.runFor(5_000);
  await expect.poll(() => teller.controles).toBe(2);
  expect(teller.navigaties).toBe(1);
});

test("de knop controleert meteen", async ({ page }) => {
  const teller = await bedien(page);
  await open(page);
  expect(teller.controles).toBe(0);
  await page.getByTestId("onderhoud-opnieuw").click();
  await expect.poll(() => teller.controles).toBe(1);
  expect(teller.navigaties).toBe(1);
});

test("na 10 minuten de tekst over langer dan verwacht, en het controleren gaat door", async ({
  page,
}) => {
  const teller = await bedien(page);
  await open(page);
  await expect(page.getByTestId("onderhoud-tekst")).toContainText("Even geduld");

  await page.clock.runFor(600_000);
  await expect(page.getByTestId("onderhoud-tekst")).toHaveText(
    "Dit duurt langer dan verwacht. Probeer het later opnieuw.",
  );
  await expect.poll(() => teller.controles).toBeGreaterThan(0);

  // Het controleren gaat door: nog een interval, nog een verzoek.
  const voor = teller.controles;
  await page.clock.runFor(5_000);
  await expect.poll(() => teller.controles).toBeGreaterThan(voor);
});

test.describe("omgeving", () => {
  test("op staging.elentrik.app de balk en [Staging] in de titel", async ({ page }) => {
    await bedien(page);
    await open(page, "http://staging.elentrik.app/");
    await expect(page.getByTestId("staging-balk")).toBeVisible();
    await expect(page.getByTestId("staging-balk")).toHaveText(
      "Staging: testomgeving, geen echte gegevens",
    );
    await expect(page).toHaveTitle("[Staging] Elentrik wordt bijgewerkt");
  });

  test("op elentrik.app geen balk en geen voorvoegsel", async ({ page }) => {
    await bedien(page);
    await open(page, "http://elentrik.app/");
    await expect(page.getByTestId("onderhoud-titel")).toBeVisible();
    await expect(page.getByTestId("staging-balk")).toBeHidden();
    await expect(page).toHaveTitle("Elentrik wordt bijgewerkt");
  });
});

test("noindex", async ({ page }) => {
  await bedien(page);
  await open(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
