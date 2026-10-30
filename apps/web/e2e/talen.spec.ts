import { BERICHTEN } from "@elentrik/arei";
import { en_gb, fr } from "@nuxt/ui/locale";
import { TEKSTEN } from "@elentrik/render";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { meldAan } from "./hulp/aanmelden";
import { zetBedrijfBasislijn } from "./hulp/bedrijfsgegevens";
import { wachtOpHydratatie } from "./hulp/hydratatie";
import { gebruikTestgebruiker } from "./hulp/inloggen";
import { leesPdf } from "./hulp/pdf";
import { sjabloonRegex, vertaling } from "./hulp/teksten";
import { E2E_URL } from "./omgeving";

// De interface en de dossiertaal in drie talen (plan 8). Eén gebruiker en één organisatie voor
// het hele bestand (de rate limiter laat geen login per test toe). De tests zijn onafhankelijk:
// elke test zet de taal van die gebruiker zelf (`zetTaal`) en kan dus apart en in elke volgorde draaien.
const { gebruiker } = gebruikTestgebruiker(test, { voorvoegsel: "talen" });

// Elke run gebruikt een unieke naam, zodat de projecten van deze run herkenbaar zijn; `ruimOp` wist ze na afloop.
const naam = `Test Talen ${Date.now()}`;

/** Zet de taal van de ingelogde testgebruiker, zoals het taalmenu dat doet (PUT /api/mij/taal). */
async function zetTaal(request: APIRequestContext, taal: "nl" | "fr" | "en"): Promise<void> {
  const antwoord = await request.put("/api/mij/taal", { data: { taal } });
  expect(antwoord.status()).toBe(200);
}

/** Een nieuwe browsercontext met de taal van de browser. De `storageState` is expliciet leeg: anders erft hij de sessie van de testgebruiker. */
async function browserIn(browser: Browser, locale: string): Promise<BrowserContext> {
  return browser.newContext({ baseURL: E2E_URL, locale, storageState: { cookies: [], origins: [] } });
}

/** Kies in het uitgeklapte taalmenu (gebruikersmenu of taalkiezer) een taal bij haar eigen naam. */
async function kiesTaal(page: Page, taalnaam: string): Promise<void> {
  await page.getByRole("menuitemcheckbox", { name: taalnaam }).click();
}

async function nieuwProject(request: APIRequestContext, achtervoegsel: string): Promise<string> {
  const antwoord = await request.post("/api/projecten", {
    data: { naam: `${naam} ${achtervoegsel}`, klantnaam: "", stroomtype: "2x230V" },
  });
  expect(antwoord.status()).toBe(201);
  return ((await antwoord.json()) as { id: string }).id;
}

test("de taal kiezen in het gebruikersmenu blijft na herladen en volgt het account", async ({
  page,
  browser,
  request,
}) => {
  await zetTaal(request, "nl");
  await page.goto("/");
  await wachtOpHydratatie(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(vertaling("nl", "projecten.titel"));

  await page.getByTestId("gebruiker-menu").click();
  await page.getByTestId("taal-menu").click();
  const bewaard = page.waitForResponse((r) => r.url().endsWith("/api/mij/taal") && r.request().method() === "PUT");
  await kiesTaal(page, "Français");
  expect((await bewaard).ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(vertaling("fr", "projecten.titel"));
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-BE");

  await page.reload();
  await wachtOpHydratatie(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(vertaling("fr", "projecten.titel"));

  // Ook Nuxt UI zelf spreekt Frans: de sluitknop van een dialoog heeft het aria-label van zijn Franse locale.
  await page.getByRole("button", { name: vertaling("fr", "projecten.nieuw") }).click();
  const nieuwDialoog = page.getByRole("dialog");
  await expect(nieuwDialoog.getByRole("button", { name: fr.messages.modal.close, exact: true })).toBeVisible();
  await expect(nieuwDialoog.getByRole("button", { name: en_gb.messages.modal.close, exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(nieuwDialoog).toHaveCount(0);

  // Een andere browser (Engels, zonder cookie) die inlogt als dezelfde gebruiker: het account wint.
  const context = await browserIn(browser, "en-GB");
  try {
    const andere = await context.newPage();
    await andere.goto("/inloggen");
    await wachtOpHydratatie(andere);
    await expect(andere.getByTestId("inloggen-knop")).toHaveText(vertaling("en", "inloggen.knop"));
    await meldAan(andere, gebruiker().email);
    await expect(andere.getByRole("heading", { level: 1 })).toHaveText(vertaling("fr", "projecten.titel"));
    await expect(andere.locator("html")).toHaveAttribute("lang", "fr-BE");
  } finally {
    await context.close();
  }
});

test.describe("dossiertaal en pdf", () => {
  test.beforeEach(async ({ request }) => {
    await zetBedrijfBasislijn(request);
  });

  /** Opent de exportdialoog, exporteert en geeft de tekst van elke pagina van de PDF terug. */
  async function exporteer(page: Page): Promise<string[]> {
    await page.getByTestId("exporteren").click();
    const dialoog = page.getByRole("dialog");
    const download = page.waitForEvent("download");
    await dialoog.getByTestId("export-start").click();
    const bestand = await (await download).createReadStream();
    const delen: Buffer[] = [];
    for await (const deel of bestand) delen.push(deel as Buffer);
    const bytes = new Uint8Array(Buffer.concat(delen));
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    return (await leesPdf(bytes)).paginaTeksten;
  }

  test("een nieuw project krijgt de taal van de gebruiker; de pdf volgt de dossiertaal", async ({ page, request }) => {
    await zetTaal(request, "fr");
    const id = await nieuwProject(request, "dossiertaal");
    await page.goto(`/projecten/${id}`);
    await expect(page.getByTestId("opslagstatus")).toHaveText(vertaling("fr", "editor.status.opgeslagen"), {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: vertaling("fr", "editor.sjablonen.kring-stopcontacten") }).click();

    // Projectgegevens: de dossiertaal is Frans, de taal van de maker.
    await page.getByTestId("projectnaam").click();
    const gegevens = page.getByRole("dialog");
    await expect(gegevens.getByTestId("dossiertaal")).toContainText("Français");
    await gegevens.getByRole("button", { name: vertaling("fr", "algemeen.annuleren") }).click();
    await expect(gegevens).toHaveCount(0);

    // De pdf heeft de Franse paginatitel.
    const frans = (await exporteer(page)).join(" ");
    expect(frans).toContain(TEKSTEN.fr.paginatitels.eendraadschema);
    expect(frans).not.toContain(TEKSTEN.en.paginatitels.eendraadschema);

    // De dossiertaal op English zetten (de interface blijft Frans): de export zegt het en de volgende is Engels.
    await page.getByTestId("projectnaam").click();
    await gegevens.getByTestId("dossiertaal").click();
    await page.getByRole("option", { name: "English" }).click();
    await gegevens.getByRole("button", { name: vertaling("fr", "editor.projectgegevens.bewaren") }).click();
    await expect(gegevens).toHaveCount(0);

    await page.getByTestId("exporteren").click();
    await expect(page.getByRole("dialog").getByTestId("export-dossiertaal")).toContainText("English");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const engels = (await exporteer(page)).join(" ");
    expect(engels).toContain(TEKSTEN.en.paginatitels.eendraadschema);
    expect(engels).not.toContain(TEKSTEN.fr.paginatitels.eendraadschema);
  });
});

test("de aanmeldpagina volgt de browsertaal en de taalkiezer wisselt ze", async ({ browser }) => {
  const context = await browserIn(browser, "en-GB");
  try {
    const page = await context.newPage();
    await page.goto("/inloggen");
    await wachtOpHydratatie(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vertaling("en", "inloggen.titel"));
    await expect(page.getByTestId("taal-kiezer")).toContainText("English");

    await page.getByTestId("taal-kiezer").click();
    await kiesTaal(page, "Nederlands");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vertaling("nl", "inloggen.titel"));
    await expect(page.getByTestId("taal-kiezer")).toContainText("Nederlands");
    await expect(page.locator("html")).toHaveAttribute("lang", "nl-BE");
    // De keuze blijft in de cookie.
    expect((await context.cookies()).find((c) => c.name === "elentrik_taal")?.value).toBe("nl");
  } finally {
    await context.close();
  }
});

test("een bevinding in de editor staat in de taal van de interface", async ({ page, request }) => {
  await zetTaal(request, "fr");
  const id = await nieuwProject(request, "bevinding");
  await page.goto(`/projecten/${id}`);
  await expect(page.getByTestId("opslagstatus")).toHaveText(vertaling("fr", "editor.status.opgeslagen"), {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: vertaling("fr", "editor.sjablonen.kring-stopcontacten") }).click();
  // Een zevende contactdoos die er vijf telt: elf op één kring is een fout.
  await page.getByTestId("schema-canvas").locator('[data-testid^="plus-kring-einde-"]').click();
  const aantal = page.getByTestId("veld-aantal");
  await aantal.fill("5");
  await aantal.blur();

  const sleutel = "arei.kring.max-contactdozen.overschreden";
  const fouten = page.getByTestId("bevindingen-fout");
  await expect(fouten).toContainText(sjabloonRegex(BERICHTEN.fr[sleutel]!));
  // Niet het Nederlands van dezelfde bevinding.
  await expect(fouten).not.toContainText(sjabloonRegex(BERICHTEN.nl[sleutel]!));
});
