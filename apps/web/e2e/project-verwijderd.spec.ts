import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { gebruikTestgebruiker } from "./hulp/inloggen";

// Eén ingelogde testgebruiker met een eigen organisatie voor dit hele bestand.
gebruikTestgebruiker(test, { voorvoegsel: "verwijderd" });

// Elke run gebruikt een unieke naam, zodat de opruiming enkel de projecten van deze run raakt.
const naam = `Test Verwijderd ${Date.now()}`;
const bevestiging = "Je wijzigingen staan nog niet op de server. Wil je de editor toch verlaten?";

type Samenvatting = { id: string; naam: string };
type Project = { id: string; versie: number; naam: string; document: { nodes: Record<string, unknown> } };

test.afterAll(async ({ request }) => {
  const projecten = (await (await request.get("/api/projecten")).json()) as Samenvatting[];
  for (const project of projecten.filter((p) => p.naam.startsWith(naam))) {
    await request.delete(`/api/projecten/${project.id}`);
  }
});

/** Opent een nieuw project in de editor, verwijdert het via de API (een ander venster) en wijzigt iets. */
async function openVerwijderdProject(page: Page, request: APIRequestContext, suffix: string) {
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam: `${naam} ${suffix}`, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  const { id } = (await aangemaakt.json()) as { id: string };
  await page.goto(`/projecten/${id}`);
  await page.waitForLoadState("networkidle");
  const canvas = page.getByTestId("schema-canvas");
  await expect(canvas.locator('[data-testid^="plus-rail-einde-"]')).toHaveCount(1);
  const voor = (await (await request.get(`/api/projecten/${id}`)).json()) as Project;

  // Het project verdwijnt elders.
  expect((await request.delete(`/api/projecten/${id}`)).status()).toBe(204);

  // Een wijziging in dit venster: de autosave krijgt een 404.
  await page.getByRole("button", { name: "Passend maken" }).click();
  await canvas.locator('[data-testid^="plus-rail-einde-"]').click();
  return { id, canvas, aantalNodesVoor: Object.keys(voor.document.nodes).length };
}

test("een project dat elders verwijderd werd: melding, en 'Bewaar als nieuw project' opent het nieuwe project met de wijziging", async ({
  page,
  request,
}) => {
  const { id, aantalNodesVoor } = await openVerwijderdProject(page, request, "nieuw");

  const melding = page.getByTestId("verwijderd-melding");
  await expect(melding).toContainText("Dit project werd verwijderd.", { timeout: 15_000 });
  await expect(page.getByTestId("opslagstatus")).toHaveText("Project verwijderd");
  // Hij blijft niet hangen op "fout": er is geen "Opnieuw proberen".
  await expect(page.getByRole("button", { name: "Opnieuw proberen" })).toHaveCount(0);

  await melding.getByRole("button", { name: "Bewaar als nieuw project" }).click();
  await expect(page).toHaveURL(new RegExp(`/projecten/(?!${id})[0-9a-f-]{36}$`), { timeout: 15_000 });
  const nieuwId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(nieuwId).not.toBe(id);

  // Het nieuwe project heeft de wijziging (er is een onderdeel bij) en laadt zonder melding.
  const nieuw = (await (await request.get(`/api/projecten/${nieuwId}`)).json()) as Project;
  expect(Object.keys(nieuw.document.nodes).length).toBeGreaterThan(aantalNodesVoor);
  expect(nieuw.naam).toBe(`${naam} nieuw`);
  await expect(page.getByTestId("schema-canvas")).toBeVisible();
  await expect(page.getByTestId("verwijderd-melding")).toHaveCount(0);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");
  // Het oude project blijft verwijderd.
  expect((await request.get(`/api/projecten/${id}`)).status()).toBe(404);
});

test("'Terug naar de projecten' vraagt niets over onbewaarde wijzigingen, en het concept blijft lokaal", async ({
  page,
  request,
}) => {
  const { id } = await openVerwijderdProject(page, request, "terug");
  const melding = page.getByTestId("verwijderd-melding");
  await expect(melding).toContainText("Dit project werd verwijderd.", { timeout: 15_000 });

  const dialogen: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogen.push(dialog.message());
    await dialog.dismiss();
  });

  await melding.getByRole("link", { name: "Terug naar de projecten" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(dialogen).not.toContain(bevestiging);
  expect(dialogen).toEqual([]);

  // Het concept van het verwijderde project staat nog in IndexedDB.
  const sleutels = await page.evaluate(
    () =>
      new Promise<string[]>((klaar, fout) => {
        const open = indexedDB.open("keyval-store");
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const vraag = open.result.transaction("keyval").objectStore("keyval").getAllKeys();
          vraag.onsuccess = () => klaar(vraag.result.map(String));
          vraag.onerror = () => fout(vraag.error);
        };
      }),
  );
  expect(sleutels.some((sleutel) => sleutel.includes(id))).toBe(true);
});

test("de pijl in de balk vraagt nog wel om bevestiging: het concept van een verwijderd project is nooit meer te openen", async ({
  page,
  request,
}) => {
  const { id } = await openVerwijderdProject(page, request, "pijl");
  await expect(page.getByTestId("verwijderd-melding")).toBeVisible({ timeout: 15_000 });
  const dialogen: string[] = [];
  let accepteer = false;
  page.on("dialog", async (dialog) => {
    dialogen.push(dialog.message());
    if (accepteer) await dialog.accept();
    else await dialog.dismiss();
  });

  // Annuleren houdt de gebruiker in de editor, met de melding.
  const pijl = page.getByRole("link", { name: "Naar de projecten", exact: true });
  await pijl.click();
  await expect.poll(() => dialogen).toEqual([bevestiging]);
  await expect(page).toHaveURL(new RegExp(`/projecten/${id}$`));
  await expect(page.getByTestId("verwijderd-melding")).toBeVisible();

  // Bevestigen verlaat de pagina.
  accepteer = true;
  await pijl.click();
  await expect(page).toHaveURL(/\/$/);
  expect(dialogen).toEqual([bevestiging, bevestiging]);
});
