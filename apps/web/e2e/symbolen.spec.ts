// Het symbolenvenster end-to-end: een combinatie kiezen en tekenen, de sneltoets, zoeken en
// alleen-lezen (een organisatie zonder lopend abonnement, zoals in abonnement.spec.ts).
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Mij } from "../shared/mij";
import { zetProefEinde } from "./hulp/database";
import { ga } from "./hulp/hydratatie";
import { gebruikTestgebruiker } from "./hulp/inloggen";

// Eén ingelogde testgebruiker met een eigen organisatie voor dit hele bestand.
gebruikTestgebruiker(test, { voorvoegsel: "symbolen", bedrijf: "Symbolen Elektro" });

const run = Date.now();
const DAG_MS = 24 * 3600 * 1000;

type Knoop = {
  id: string;
  type: string;
  randaarde?: boolean;
  kinderbeveiliging?: boolean;
  waterdicht?: boolean;
};
type Project = { versie: number; document: { nodes: Record<string, Knoop> } };

/** Maakt een project via de API en geeft zijn id. */
async function maakProject(request: APIRequestContext, naam: string): Promise<string> {
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam: `${naam} ${run}`, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  expect(aangemaakt.status()).toBe(201);
  return ((await aangemaakt.json()) as { id: string }).id;
}

/** Opent het project in de editor en wacht tot het canvas er is. */
async function openProject(page: Page, id: string): Promise<void> {
  await ga(page, `/projecten/${id}`);
  await expect(page.getByTestId("schema-canvas")).toBeVisible();
}

test("combinatie kiezen en tekenen", async ({ page, request }) => {
  // 1. Een nieuw project, geopend in de editor.
  const id = await maakProject(request, "Symbolen combinatie");
  await openProject(page, id);

  // 2. Het symbolenvenster via de knop in het paneel Onderdelen.
  await page.getByTestId("symbolen-openen").click();
  const venster = page.getByRole("dialog");
  await expect(venster).toBeVisible();

  // 3. De kaart van de contactdoos.
  await venster.getByTestId("symbolenkaart-contactdoos").click();

  // 4. Een combinatie die afwijkt van de standaard (randaarde + kinderbeveiliging): randaarde +
  // waterdicht, zonder kinderbeveiliging. Op naam, niet op volgorde.
  const combinatie = venster.getByTestId(/^combinatie-\d+$/).filter({
    has: page.getByText("Randaarde, waterdicht", { exact: true }),
  });
  await expect(combinatie).toHaveCount(1);
  await expect(combinatie).toHaveAttribute("aria-pressed", "false");
  await combinatie.click();
  await expect(combinatie).toHaveAttribute("aria-pressed", "true");

  // 5. Kiezen en tekenen sluit het venster (6).
  await venster.getByTestId("symbolen-kiezen").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("onderdeel-contactdoos")).toHaveAttribute("aria-pressed", "true");

  // 7. Toevoegen met de + op een kring-einde: eerst een kring via de + van de rail.
  const canvas = page.getByTestId("schema-canvas");
  await page.getByRole("button", { name: "Passend maken" }).click();
  await canvas.locator('[data-testid^="plus-rail-einde-"]').click();
  const kringPlus = canvas.locator('[data-testid^="plus-kring-einde-"]');
  await expect(kringPlus).toHaveCount(1);
  await page.getByRole("button", { name: "Passend maken" }).click();
  await kringPlus.click();
  await expect(canvas.locator("svg text", { hasText: /^A1$/ })).toHaveCount(1);

  // 8. De nieuwe contactdoos heeft de gekozen eigenschappen op de server.
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await expect
    .poll(async () => {
      const { document } = (await (await request.get(`/api/projecten/${id}`)).json()) as Project;
      const doos = Object.values(document.nodes).find((n) => n.type === "contactdoos");
      return doos && {
        randaarde: doos.randaarde,
        kinderbeveiliging: doos.kinderbeveiliging,
        waterdicht: doos.waterdicht,
      };
    }, { timeout: 30_000 })
    .toEqual({ randaarde: true, kinderbeveiliging: false, waterdicht: true });
});

test("sneltoets a opent het venster en Escape sluit het", async ({ page, request }) => {
  await openProject(page, await maakProject(request, "Symbolen sneltoets"));
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("a");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("symbolenvenster")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("zoeken: wissel toont de schakelaar, xyz de melding", async ({ page, request }) => {
  await openProject(page, await maakProject(request, "Symbolen zoeken"));
  await page.getByTestId("symbolen-openen").click();
  const venster = page.getByRole("dialog");
  const zoek = venster.getByTestId("symbolen-zoeken");
  await expect(venster.getByTestId("symbolenkaart-contactdoos")).toBeVisible();

  await zoek.fill("wissel");
  await expect(venster.getByTestId("symbolenkaart-schakelaar")).toBeVisible();
  await expect(venster.getByTestId("symbolenkaart-contactdoos")).toHaveCount(0);
  await expect(venster.getByTestId("symbolen-geen")).toHaveCount(0);

  await zoek.fill("xyz");
  const melding = venster.getByTestId("symbolen-geen");
  await expect(melding).toContainText("Geen symbool gevonden voor \"xyz\".");
  await expect(venster.locator('[data-testid^="symbolenkaart-"]')).toHaveCount(0);
});

test("alleen-lezen: het venster opent, maar kiezen kan niet", async ({ page, request }) => {
  const mij = (await (await request.get("/api/mij")).json()) as Mij;
  const organisatie = mij.actieveOrganisatieId!;
  const id = await maakProject(request, "Symbolen alleen-lezen");

  // De proef van gisteren: de editor is alleen-lezen.
  await zetProefEinde(organisatie, new Date(Date.now() - DAG_MS));
  try {
    await openProject(page, id);
    await expect(page.getByTestId("abonnement-banner-alleen-lezen")).toBeVisible();

    await page.getByTestId("symbolen-openen").click();
    const venster = page.getByRole("dialog");
    await expect(venster).toBeVisible();
    await expect(venster.getByTestId("dialoog-alleen-lezen")).toBeVisible();
    // Bekijken kan: de kaart en haar combinaties openen.
    await venster.getByTestId("symbolenkaart-contactdoos").click();
    await expect(venster.getByTestId(/^combinatie-\d+$/).first()).toBeVisible();
    await expect(venster.getByTestId("symbolen-kiezen")).toBeDisabled();

    // Dubbelklikken op een niet-standaardcombinatie kiest niets: het venster blijft open.
    const waterdicht = venster.getByTestId(/^combinatie-\d+$/).filter({
      has: page.getByText("Randaarde, waterdicht", { exact: true }),
    });
    await expect(waterdicht).toHaveCount(1);
    await waterdicht.dblclick();
    await expect(venster).toBeVisible();
    await expect(venster.getByTestId("symbolen-kiezen")).toBeDisabled();

    // Sluiten: het paneel is ongewijzigd (onderdeel en variant), ook na de sneltoets a.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("onderdeel-contactdoos")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Randaarde, waterdicht", { exact: true })).toHaveCount(0);
    await page.keyboard.press("a");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByTestId("dialoog-alleen-lezen")).toBeVisible();
  } finally {
    await zetProefEinde(organisatie, new Date(Date.now() + 20 * DAG_MS));
  }
});
