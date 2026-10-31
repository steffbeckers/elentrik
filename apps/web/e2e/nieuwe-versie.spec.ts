// Een nieuwe versie van de app: de toast bij een nieuwe build (zonder automatisch herladen), en het
// modale venster bij een verplichte update (met de editor die eerst bewaart en daarna zonder vraag herlaadt).
//
// De nieuwe build wordt nagebootst: `latest.json` geeft een andere id (page.route). De controle van de
// app loopt elke 5 minuten; hier lokt de test ze uit met een `visibilitychange`, zoals bij een tabblad
// dat weer zichtbaar wordt.
import { expect, test, type Page } from "@playwright/test";
import { wachtOpHydratatie } from "./hulp/hydratatie";
import { gebruikTestgebruiker } from "./hulp/inloggen";

gebruikTestgebruiker(test, { voorvoegsel: "versie" });

const naam = `Test Nieuwe Versie ${Date.now()}`;
const TOAST_TEKST = "Er is een nieuwe versie van Elentrik";
const VEREIST_TEKST = "Elentrik is bijgewerkt. Herlaad de app om verder te werken.";

type Markering = { __markering?: string };

/** Laat `latest.json` een andere build geven; geeft de teller van de gedane controles en een zetter voor de id. */
async function nepBuild(page: Page, beginId: string) {
  let id = beginId;
  let aantal = 0;
  await page.route("**/_nuxt/builds/latest.json", async (route) => {
    aantal++;
    await route.fulfill({ json: { id, timestamp: Date.now() } });
  });
  return {
    aantal: () => aantal,
    zetId: (nieuw: string) => {
      id = nieuw;
    },
  };
}

/** Het tabblad wordt (opnieuw) zichtbaar: de app doet een versiecontrole. */
async function lokControleUit(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

async function startOp(page: Page, pad: string): Promise<void> {
  await page.goto(pad);
  await wachtOpHydratatie(page);
}

test("een nieuwe build geeft de toast, en navigeren herlaadt niet", async ({ page }) => {
  const build = await nepBuild(page, "nep-build-1");
  await startOp(page, "/");
  await page.evaluate(() => {
    (window as unknown as Markering).__markering = "blijft";
  });

  await expect(async () => {
    await lokControleUit(page);
    await expect(page.getByText(TOAST_TEKST, { exact: true })).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  expect(build.aantal()).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Herladen" })).toBeVisible();

  // Naar een ander scherm: geen volledige herlading, de markering op `window` blijft.
  await page.getByRole("link", { name: "Bedrijfsgegevens" }).click();
  await expect(page).toHaveURL(/\/instellingen$/);
  await expect(page.getByRole("heading", { name: "Bedrijfsgegevens", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Markering).__markering)).toBe("blijft");
  // De toast staat er nog: hij verdwijnt niet vanzelf.
  await expect(page.getByText(TOAST_TEKST, { exact: true })).toBeVisible();
});

test("gesloten: dezelfde build meldt niet opnieuw, een volgende wel", async ({ page }) => {
  const build = await nepBuild(page, "nep-build-1");
  await startOp(page, "/");

  await expect(async () => {
    await lokControleUit(page);
    await expect(page.getByText(TOAST_TEKST, { exact: true })).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });

  await page.getByRole("button", { name: "Sluiten" }).click();
  await expect(page.getByText(TOAST_TEKST, { exact: true })).toHaveCount(0);

  // Dezelfde build, opnieuw gecontroleerd: geen nieuwe melding.
  const voor = build.aantal();
  await lokControleUit(page);
  await expect.poll(() => build.aantal()).toBeGreaterThan(voor);
  await page.waitForTimeout(1_000);
  await expect(page.getByText(TOAST_TEKST, { exact: true })).toHaveCount(0);

  // Een nog nieuwere build: wel.
  build.zetId("nep-build-2");
  await expect(async () => {
    await lokControleUit(page);
    await expect(page.getByText(TOAST_TEKST, { exact: true })).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
});

test("een API-antwoord met een andere minimumversie geeft het modale venster, dat niet weg te klikken is", async ({
  page,
}) => {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const antwoord = await route.fetch();
      await route.fulfill({ response: antwoord, headers: { ...antwoord.headers(), "x-elentrik-client-minimum": "999" } });
    },
  );
  await startOp(page, "/");

  await expect(async () => {
    await lokControleUit(page);
    await expect(page.getByRole("dialog")).toContainText(VEREIST_TEKST, { timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  const venster = page.getByRole("dialog");
  await expect(venster.getByRole("button", { name: "Herladen" })).toBeVisible();
  // Geen sluitknop.
  await expect(venster.getByRole("button", { name: "Sluiten" })).toHaveCount(0);

  // Escape en een klik naast het venster laten het staan.
  await page.keyboard.press("Escape");
  await expect(venster).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(venster).toBeVisible();
  await expect(venster).toContainText(VEREIST_TEKST);

  // De toast voor een gewone update is er niet naast.
  await expect(page.getByText(TOAST_TEKST, { exact: true })).toHaveCount(0);
});

test("Herladen in het modale venster herlaadt de editor zonder vraag, en het concept wordt aangeboden", async ({
  page,
  request,
}) => {
  // Een `beforeunload`-dialoog (of een andere) faalt deze test.
  const dialogen: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogen.push(dialog.message());
    await dialog.dismiss();
  });

  const aangemaakt = await request.post("/api/projecten", {
    data: { naam, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  const { id } = (await aangemaakt.json()) as { id: string };

  await startOp(page, `/projecten/${id}`);
  await page.waitForLoadState("networkidle");
  const canvas = page.getByTestId("schema-canvas");
  await expect(canvas.locator('[data-testid^="plus-rail-einde-"]')).toHaveCount(1);

  // De server vraagt een nieuwe versie: elke bewaring krijgt een 426.
  await page.route("**/api/projecten/*", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    await route.fulfill({
      status: 426,
      json: { statusCode: 426, statusMessage: "Nieuwe versie van de app vereist", data: { code: "NIEUWE_VERSIE_VEREIST" } },
      headers: { "x-elentrik-client-minimum": "999" },
    });
  });

  // Een wijziging maken: de autosave bewaart ze, krijgt de 426 en laat ze in het lokale concept.
  await page.getByRole("button", { name: "Passend maken" }).click();
  await canvas.locator('[data-testid^="plus-rail-einde-"]').click();
  const venster = page.getByRole("dialog");
  await expect(venster).toContainText(VEREIST_TEKST, { timeout: 20_000 });
  await page.evaluate(() => {
    (window as unknown as Markering).__markering = "voor-herladen";
  });

  await venster.getByRole("button", { name: "Herladen" }).click();

  // Na het laden biedt het concept-herstel het werk aan.
  await expect(page.getByRole("dialog")).toContainText("Lokaal concept gevonden", { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as Markering).__markering)).toBeUndefined();
  expect(dialogen).toEqual([]);
});
