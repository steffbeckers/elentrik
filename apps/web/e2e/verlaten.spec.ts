import { expect, test } from "@playwright/test";
import { gebruikTestgebruiker } from "./hulp/inloggen";
import { E2E_URL } from "./omgeving";

// Eén ingelogde testgebruiker met een eigen organisatie voor dit hele bestand.
gebruikTestgebruiker(test, { voorvoegsel: "verlaten" });

// Elke run gebruikt een unieke naam, zodat de opruiming enkel de projecten van deze run raakt.
const naam = `Test Verlaten ${Date.now()}`;
const bevestiging = "Je wijzigingen staan nog niet op de server. Wil je de editor toch verlaten?";

type Samenvatting = { id: string; naam: string };
type Project = { versie: number; document: unknown };

test.afterAll(async ({ request }) => {
  const antwoord = await request.get("/api/projecten");
  const projecten = (await antwoord.json()) as Samenvatting[];
  for (const project of projecten.filter((p) => p.naam.startsWith(naam))) {
    await request.delete(`/api/projecten/${project.id}`);
  }
});

test("navigeren in de app bij een conflict vraagt een bevestiging en het concept blijft", async ({ page, request }) => {
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  const { id } = (await aangemaakt.json()) as { id: string };

  await page.goto(`/projecten/${id}`);
  await page.waitForLoadState("networkidle");
  const canvas = page.getByTestId("schema-canvas");
  await expect(canvas.locator('[data-testid^="plus-rail-einde-"]')).toHaveCount(1);

  // Een ander venster bewaart intussen: de server staat nu een versie verder.
  const project = (await (await request.get(`/api/projecten/${id}`)).json()) as Project;
  const ander = await request.put(`/api/projecten/${id}`, {
    headers: { "If-Match": String(project.versie) },
    data: { document: project.document },
  });
  expect(ander.ok()).toBe(true);

  // Een wijziging in dit venster botst daarop: conflict.
  await page.getByRole("button", { name: "Passend maken" }).click();
  await canvas.locator('[data-testid^="plus-rail-einde-"]').click();
  const status = page.getByTestId("opslagstatus");
  await expect(status).toHaveText("Conflict", { timeout: 15_000 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const dialogen: string[] = [];
  let accepteer = false;
  page.on("dialog", async (dialog) => {
    dialogen.push(dialog.message());
    if (accepteer) await dialog.accept();
    else await dialog.dismiss();
  });

  // Annuleren houdt de gebruiker op de pagina, nog altijd in conflict.
  const terug = page.getByRole("link", { name: "Naar de projecten" });
  await terug.click();
  await expect.poll(() => dialogen).toEqual([bevestiging]);
  await expect(page).toHaveURL(new RegExp(`/projecten/${id}$`));
  await expect(status).toHaveText("Conflict");

  // Bevestigen verlaat de pagina; het concept blijft staan en wordt bij het openen aangeboden.
  accepteer = true;
  await terug.click();
  await expect(page).toHaveURL(/\/$/);
  expect(dialogen).toEqual([bevestiging, bevestiging]);

  await page.goto(`/projecten/${id}`);
  const conceptDialoog = page.getByRole("dialog");
  await expect(conceptDialoog).toContainText("Lokaal concept gevonden");
  // Het concept steunt op een oudere versie: bewaren geeft opnieuw het conflict, niets gaat stil verloren.
  await conceptDialoog.getByRole("button", { name: "Concept laden" }).click();
  await expect(status).toHaveText("Conflict", { timeout: 15_000 });
});

test("de sessie verloopt tijdens het tekenen: lokaal bewaard, met een melding, en na opnieuw inloggen opgeslagen", async ({
  page,
  context,
  request,
}) => {
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam: `${naam} sessie`, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  const { id } = (await aangemaakt.json()) as { id: string };

  await page.goto(`/projecten/${id}`);
  await page.waitForLoadState("networkidle");
  const canvas = page.getByTestId("schema-canvas");
  await expect(canvas.locator('[data-testid^="plus-rail-einde-"]')).toHaveCount(1);

  // De sessie is weg (verlopen): de volgende bewaring krijgt een 401.
  const cookies = await context.cookies();
  await context.clearCookies();
  await page.getByRole("button", { name: "Passend maken" }).click();
  await canvas.locator('[data-testid^="plus-rail-einde-"]').click();
  const status = page.getByTestId("opslagstatus");
  await expect(status).toHaveText("Niet opgeslagen: lokaal bewaard", { timeout: 15_000 });
  const melding = page.getByTestId("afgemeld-melding");
  await expect(melding).toContainText("Je bent afgemeld. Log opnieuw in om op te slaan.");
  // "Opnieuw inloggen" opent een nieuw tabblad dat na het inloggen op /weer-aangemeld uitkomt.
  const [tabblad] = await Promise.all([
    context.waitForEvent("page"),
    melding.getByRole("button", { name: "Opnieuw inloggen" }).click(),
  ]);
  await expect(tabblad).toHaveURL(/\/inloggen\?terug=%2Fweer-aangemeld$/);
  await tabblad.close();

  // Opnieuw ingelogd (hier: de sessie terug): "Opnieuw proberen" bewaart alles.
  await context.addCookies(cookies);
  await melding.getByRole("button", { name: "Opnieuw proberen" }).click();
  await expect(status).toHaveText("Opgeslagen", { timeout: 15_000 });
  await expect(melding).toHaveCount(0);
  const project = (await (await request.get(`/api/projecten/${id}`)).json()) as Project;
  expect(project.versie).toBe(2);
});

test("een project van een andere eigen organisatie openen maakt die organisatie actief", async ({ page, request }) => {
  const mij = (await (await request.get("/api/mij")).json()) as { actieveOrganisatieId: string };
  const thuis = mij.actieveOrganisatieId;

  // Een tweede bedrijf met een project; daarna is het eerste weer actief.
  const tweedeNaam = `Tweede Elektro ${Date.now()}`;
  const aangemaakt = await request.post("/api/auth/organization/create", {
    data: { name: tweedeNaam, slug: `tweede-${Date.now()}`, keepCurrentActiveOrganization: true },
    headers: { origin: E2E_URL },
  });
  expect(aangemaakt.ok()).toBe(true);
  const tweede = (await aangemaakt.json()) as { id: string };
  expect((await request.post("/api/organisaties/actief", { data: { organisatieId: tweede.id } })).ok()).toBe(true);
  const project = await request.post("/api/projecten", {
    data: { naam: `${naam} tweede`, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  const { id } = (await project.json()) as { id: string };
  expect((await request.post("/api/organisaties/actief", { data: { organisatieId: thuis } })).ok()).toBe(true);

  try {
    await page.goto(`/projecten/${id}`);
    await expect(page.getByTestId("schema-canvas")).toBeVisible();
    await expect(page.getByText(`Je werkt nu in ${tweedeNaam}.`, { exact: true })).toBeVisible();
    await expect(page.getByTestId("organisatie-keuze")).toHaveAttribute("title", `Organisatie kiezen: ${tweedeNaam}`);
  } finally {
    await request.delete(`/api/projecten/${id}`);
    await request.post("/api/organisaties/actief", { data: { organisatieId: thuis } });
  }
});

test("na opnieuw inloggen vanuit de editor: een pagina die zegt wat er nu moet", async ({ page }) => {
  await page.goto("/weer-aangemeld");
  const pagina = page.getByTestId("weer-aangemeld");
  await expect(pagina).toContainText(
    "Je bent opnieuw aangemeld. Sluit dit tabblad en klik in de editor op ‘Opnieuw proberen’.",
  );
  await expect(pagina.getByRole("button", { name: "Tabblad sluiten" })).toBeVisible();
});
