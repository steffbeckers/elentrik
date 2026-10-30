// Rooktest van de inlog- en organisatiepagina's: de middleware, de publieke pagina's en de
// bovenbalk. De volledige stromen (registreren, magic link, uitnodigen, wisselen) staan in de
// specs van Task 8.
import { expect, test, type Browser } from "@playwright/test";
import postgres from "postgres";
import { eisE2eDatabase } from "./omgeving";
import { ga } from "./hulp/hydratatie";
import { gebruikTestgebruiker } from "./hulp/inloggen";

const { gebruiker, spoor } = gebruikTestgebruiker(test, { voorvoegsel: "paginas", bedrijf: "Paginas Elektro" });
// Een inloglink aan dit onbekende adres laat een verificatierij achter; ze wordt na afloop gewist.
const ONBEKEND_ADRES = "niemand@e2e.elentrik.test";
spoor.emails.add(ONBEKEND_ADRES);

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
    // Met een token: het formulier, en de token verdwijnt uit de URL, ook uit de geschiedenis.
    await ga(page, "/wachtwoord-herstellen?token=geen-echte-token");
    await expect(page.getByTestId("wachtwoord-herstellen-wachtwoord")).toBeVisible();
    await expect(page).toHaveURL(/\/wachtwoord-herstellen$/);
    await page.getByRole("link", { name: "Terug naar inloggen" }).click();
    await expect(page).toHaveURL(/\/inloggen$/);
    // De router onthoudt de vorige pagina zonder token (anders zet hij ze zo terug in de
    // geschiedenis, en de pagina zou ze bij "terug" pas na het laden weer weghalen).
    expect(await page.evaluate(() => JSON.stringify(window.history.state))).not.toContain("token");
    await page.goBack();
    await expect(page).toHaveURL(/\/wachtwoord-herstellen$/);
    expect(page.url()).not.toContain("token");
    // Een verlopen bevestigingslink komt terug als /?error=…: de inlogpagina meldt het.
    await page.goto("/?error=INVALID_TOKEN");
    await expect(page).toHaveURL(/\/inloggen\?terug=/);
    await expect(page.getByTestId("inloggen-melding")).toHaveText("Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.");
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
    await page.getByTestId("inloggen-email").fill(ONBEKEND_ADRES);
    await page.getByTestId("inloglink-knop").click();
    await expect(page.getByTestId("inloggen-melding")).toHaveText("Als dit adres bekend is, ontvang je een link.");
  } finally {
    await context.close();
  }
});

test("de bovenbalk toont de organisatie en het menu van de gebruiker", async ({ page }) => {
  await ga(page, "/");
  await expect(page.getByTestId("organisatie-keuze")).toContainText("Paginas Elektro");
  const mij = (await (await page.request.get("/api/mij")).json()) as { actieveOrganisatieId: string };
  await page.getByTestId("organisatie-keuze").click();
  await expect(page.getByRole("menuitemcheckbox", { name: /Paginas Elektro/ })).toBeVisible();
  await expect(page.getByTestId(`organisatie-optie-${mij.actieveOrganisatieId}`)).toHaveText("Paginas Elektro");
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

test("een sessie die tijdens SSR verlengd wordt, krijgt ook in de browser een nieuwe cookie", async ({ page }) => {
  // De sessie twee dagen ouder maken: met updateAge 1 dag verlengt het volgende verzoek ze.
  const sql = postgres(eisE2eDatabase(), { max: 1, onnotice: () => {} });
  const vervaltOp = async () => {
    const [rij] = await sql<{ verval: Date }[]>`
      select s.expires_at as verval from "session" s join "user" u on u.id = s.user_id
      where u.email = ${gebruiker().email}`;
    return rij!.verval.getTime();
  };
  try {
    await sql`
      update "session" set expires_at = expires_at - interval '2 days'
      where user_id = (select id from "user" where email = ${gebruiker().email})`;
    const voor = await vervaltOp();

    // De eerste aanvraag is de pagina zelf (SSR): de verlengde cookie staat in haar antwoord.
    const antwoord = await page.goto("/");
    const cookies = (await antwoord!.headerValue("set-cookie")) ?? "";
    expect(cookies).toContain("session_token=");
    expect(await vervaltOp()).toBeGreaterThan(voor + 24 * 3600 * 1000);
    await expect(page.getByTestId("organisatie-keuze")).toContainText("Paginas Elektro");
  } finally {
    await sql.end();
  }
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
