// Rooktest van de inlog- en organisatiepagina's: de middleware, de publieke pagina's en de
// bovenbalk. De volledige stromen (registreren, magic link, uitnodigen, wisselen) staan in de
// specs van Task 8.
import { expect, test, type Browser } from "@playwright/test";
import { ga } from "./hulp/hydratatie";
import { gebruikTestgebruiker } from "./hulp/inloggen";

const { gebruiker } = gebruikTestgebruiker(test, { voorvoegsel: "paginas", bedrijf: "Paginas Elektro" });

/** Een pagina zonder sessie, los van de testgebruiker van dit bestand. */
async function zonderSessie(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

test("zonder sessie: naar /inloggen, met de gevraagde pagina als terug", async ({ browser }) => {
  const { context, page } = await zonderSessie(browser);
  try {
    await page.goto("/");
    await expect(page).toHaveURL(/\/inloggen$/);
    await page.goto("/projecten/onbekend?tab=x");
    await expect(page).toHaveURL(/\/inloggen\?terug=/);
    expect(new URL(page.url()).searchParams.get("terug")).toBe("/projecten/onbekend?tab=x");
    await expect(page.getByTestId("inloggen-email")).toBeVisible();
    await expect(page.getByTestId("inloggen-wachtwoord")).toBeVisible();
    await expect(page.getByTestId("inloggen-knop")).toBeVisible();
    await expect(page.getByTestId("inloglink-knop")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("de publieke pagina's zijn bereikbaar zonder sessie", async ({ browser }) => {
  const { context, page } = await zonderSessie(browser);
  try {
    await page.goto("/registreren");
    await expect(page.getByTestId("registreren-bedrijfsnaam")).toBeVisible();
    await page.goto("/wachtwoord-vergeten");
    await expect(page.getByTestId("wachtwoord-vergeten-email")).toBeVisible();
    // Zonder token: de link is ongeldig.
    await page.goto("/wachtwoord-herstellen");
    await expect(page.getByTestId("wachtwoord-herstellen-ongeldig")).toBeVisible();
    // Met een token: het formulier, en de token verdwijnt uit de adresbalk.
    await page.goto("/wachtwoord-herstellen?token=geen-echte-token");
    await expect(page.getByTestId("wachtwoord-herstellen-wachtwoord")).toBeVisible();
    await expect(page).toHaveURL(/\/wachtwoord-herstellen$/);
    // Een onbekende uitnodigingstoken: niet meer geldig.
    await page.goto("/uitnodiging/geen-echte-token");
    await expect(page.getByTestId("uitnodiging-ongeldig")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("een inloglink geeft altijd dezelfde, neutrale melding", async ({ browser }) => {
  const { context, page } = await zonderSessie(browser);
  try {
    await ga(page, "/inloggen");
    await page.getByTestId("inloggen-email").fill("niemand@e2e.elentrik.test");
    await page.getByTestId("inloglink-knop").click();
    await expect(page.getByTestId("inloggen-melding")).toHaveText("Als dit adres bekend is, ontvang je een link.");
  } finally {
    await context.close();
  }
});

test("de bovenbalk toont de organisatie en het menu van de gebruiker", async ({ page }) => {
  await ga(page, "/");
  await expect(page.getByTestId("organisatie-keuze")).toContainText("Paginas Elektro");
  await page.getByTestId("organisatie-keuze").click();
  await expect(page.getByRole("menuitemcheckbox", { name: /Paginas Elektro/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByTestId("gebruiker-menu").click();
  await expect(page.getByText(gebruiker().email)).toBeVisible();
  await page.getByTestId("mijn-organisatie").click();
  await expect(page).toHaveURL(/\/organisatie$/);
  await expect(page.getByTestId(`organisatie-lid-${gebruiker().email}`)).toBeVisible();
  await expect(page.getByTestId("organisatie-uitnodigen-email")).toBeVisible();
});

test("de laatste eigenaar kan niet vertrekken, en de pagina zegt waarom", async ({ page }) => {
  await ga(page, "/organisatie");
  await page.getByTestId("organisatie-verlaten").click();
  await page.getByTestId("organisatie-verlaten-bevestig").click();
  await expect(page.getByTestId("organisatie-verlaten-fout")).toHaveText("Er moet minstens één eigenaar blijven.");
});

// Als laatste: uitloggen beëindigt de sessie die de andere tests van dit bestand gebruiken.
test("uitloggen via het gebruikersmenu", async ({ page }) => {
  await ga(page, "/");
  await page.getByTestId("gebruiker-menu").click();
  await page.getByTestId("uitloggen").click();
  await expect(page).toHaveURL(/\/inloggen$/);
  await page.goto("/organisatie");
  await expect(page).toHaveURL(/\/inloggen\?terug=%2Forganisatie$/);
});
