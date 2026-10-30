import { expect, type Page, test } from "@playwright/test";
import { ga } from "./hulp/hydratatie";
import { uniekAdres } from "./hulp/inloggen";

// Na een fout bij het verifiëren van een inloglink stuurt de server naar /inloggen?fout=INLOGLINK_MISLUKT
// (getest in test/auth-inloglink.test.ts). Hier: wat de gebruiker dan ziet.
test("na een mislukte inloglink: een vertaalde melding en de knop voor een nieuwe link", async ({ page }) => {
  await ga(page, "/inloggen?fout=INLOGLINK_MISLUKT");

  const melding = page.getByTestId("inloggen-melding");
  await expect(melding).toContainText("Inloggen met de link is niet gelukt. Vraag een nieuwe link aan.");
  const knop = melding.getByRole("button", { name: "Stuur een nieuwe link" });
  await expect(knop).toBeVisible();

  // Zonder adres vraagt het formulier eerst een adres; met een adres volgt de neutrale melding.
  await knop.click();
  await expect(page.getByText("Vul een geldig e-mailadres in.")).toBeVisible();
  await page.getByTestId("inloggen-email").fill(uniekAdres("onbekend"));
  await knop.click();
  await expect(melding).toContainText("Als dit adres bekend is, ontvang je een link.");
  await expect(melding.getByRole("button", { name: "Stuur een nieuwe link" })).toHaveCount(0);
});

/** De `callbackURL` van het verzoek dat "Stuur een nieuwe link" doet. */
async function callbackVanNieuweLink(page: Page, pad: string): Promise<string | undefined> {
  await ga(page, pad);
  await page.getByTestId("inloggen-email").fill(uniekAdres("terug"));
  const verzoek = page.waitForRequest((v) => v.url().endsWith("/api/auth/sign-in/magic-link") && v.method() === "POST");
  await page.getByTestId("inloggen-melding").getByRole("button", { name: "Stuur een nieuwe link" }).click();
  return ((await verzoek).postDataJSON() as { callbackURL?: string }).callbackURL;
}

test("de nieuwe link gaat naar de bestemming van de mislukte link", async ({ page }) => {
  expect(await callbackVanNieuweLink(page, "/inloggen?fout=INLOGLINK_MISLUKT&terug=%2Fuitnodiging%2Fabc")).toBe(
    "/uitnodiging/abc",
  );
});

test("zonder geldige bestemming gaat de nieuwe link naar de start", async ({ page }) => {
  expect(await callbackVanNieuweLink(page, "/inloggen?fout=INLOGLINK_MISLUKT")).toBe("/");
  expect(await callbackVanNieuweLink(page, "/inloggen?fout=INLOGLINK_MISLUKT&terug=%2F%2Fevil.example")).toBe("/");
  expect(await callbackVanNieuweLink(page, "/inloggen?fout=INLOGLINK_MISLUKT&terug=https%3A%2F%2Fevil.example")).toBe("/");
});

test("een andere waarde in ?fout= toont niets (alleen de vaste code telt)", async ({ page }) => {
  await ga(page, "/inloggen?fout=%3Cb%3Ehallo%3C/b%3E");
  await expect(page.getByTestId("inloggen-melding")).toHaveCount(0);
});

test("een ongeldige token blijft de eigen melding van Better Auth tonen (geen serverfout, geen onderschepping)", async ({ page }) => {
  // Een ongeldige token is geen serverfout: Better Auth stuurt zelf door met de eigen melding.
  await page.goto("/api/auth/magic-link/verify?token=bestaat-niet&callbackURL=/&errorCallbackURL=/inloggen");
  await expect(page).toHaveURL(/\/inloggen\?error=INVALID_TOKEN$/);
  await expect(page.getByTestId("inloggen-melding")).toContainText("Deze link is verlopen of al gebruikt.");
});
