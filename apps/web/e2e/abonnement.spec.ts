// Abonnementen end-to-end, tegen een nep-Stripe op poort 3199 (zie hulp/nep-stripe.ts en
// global-setup.ts). De server draait met Stripe aan, dus elke nieuwe organisatie krijgt een proef.
// Een verlopen proef zetten we rechtstreeks in de e2e-database.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { metE2eDatabase, zetProefEinde, zetVrijgesteld } from "./hulp/database";
import { ga } from "./hulp/hydratatie";
import { gebruikTestgebruiker, maakTestgebruiker, uniekAdres } from "./hulp/inloggen";
import { E2E_STRIPE_URL, E2E_URL } from "./omgeving";

gebruikTestgebruiker(test, { voorvoegsel: "abonnement", bedrijf: "Abonnement Elektro" });

const run = Date.now();
const DAG_MS = 24 * 3600 * 1000;

type Mij = { actieveOrganisatieId: string };

async function organisatieId(request: APIRequestContext): Promise<string> {
  return ((await (await request.get("/api/mij")).json()) as Mij).actieveOrganisatieId;
}

test.afterAll(async ({ request }) => {
  const antwoord = await request.get("/api/projecten");
  const projecten = (await antwoord.json()) as { id: string; naam: string }[];
  for (const project of projecten.filter((p) => p.naam.startsWith(`Abonnement ${run}`))) {
    await request.delete(`/api/projecten/${project.id}`);
  }
});

test.describe.configure({ mode: "serial" });

test("formules: twee kaarten met bedragen en korting, en Kies bij Jaarlijks gaat naar de nep-Stripe", async ({
  page,
}) => {
  await ga(page, "/abonnement");
  await expect(page.getByTestId("abonnement-status")).toContainText("Gratis proefperiode: nog");

  const maand = page.getByTestId("abonnement-kaart-maand");
  const jaar = page.getByTestId("abonnement-kaart-jaar");
  await expect(maand).toContainText("Maandelijks");
  await expect(maand).toContainText("15,00");
  await expect(maand.getByTestId("abonnement-korting")).toHaveCount(0);
  await expect(jaar).toContainText("Jaarlijks");
  await expect(jaar).toContainText("150,00");
  await expect(jaar.getByTestId("abonnement-korting")).toHaveText("−17 %");

  await page.getByTestId("abonnement-kies-jaar").click();
  await expect(page).toHaveURL(new RegExp(`^${E2E_STRIPE_URL}/checkout/`), { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Nep-Checkout" })).toBeVisible();
});

test("een lid ziet op /abonnement geen knoppen", async ({ page, browser, playwright, request }) => {
  const thuis = await organisatieId(request);
  const api = await playwright.request.newContext({ baseURL: E2E_URL });
  const lid = { naam: "Lid Tester", email: uniekAdres("abonnement-lid"), bedrijf: "Lid Elektro" };
  const staat = await maakTestgebruiker(api, lid).finally(() => api.dispose());

  // Het lid wordt rechtstreeks in de database lid van de organisatie van de eigenaar.
  await metE2eDatabase(
    (sql) => sql`
      insert into member (id, organization_id, user_id, role, created_at)
      select ${`lid-${run}`}, ${thuis}, id, 'member', now() from "user" where email = ${lid.email}`,
  );

  const context = await browser.newContext({ storageState: staat });
  try {
    expect((await context.request.post("/api/organisaties/actief", { data: { organisatieId: thuis } })).ok()).toBe(true);
    const pagina = await context.newPage();
    await ga(pagina, "/abonnement");
    await expect(pagina.getByTestId("abonnement-lid")).toContainText(
      "Vraag een eigenaar van je bedrijf om het abonnement te regelen.",
    );
    await expect(pagina.getByTestId("abonnement-kies-maand")).toHaveCount(0);
    await expect(pagina.getByTestId("abonnement-kies-jaar")).toHaveCount(0);
    await expect(pagina.getByTestId("abonnement-beheren")).toHaveCount(0);
    await expect(pagina.getByRole("button", { name: "Kies", exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("verlopen proef: alleen-lezen met banner, zonder Nieuw project, geen wijzigingen, wel exporteren", async ({
  page,
  request,
}) => {
  // Een project met een kring, gemaakt zolang de proef nog loopt.
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam: `Abonnement ${run} verlopen`, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  expect(aangemaakt.status()).toBe(201);
  const { id } = (await aangemaakt.json()) as { id: string };
  await ga(page, `/projecten/${id}`);
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  // Wachten tot de kring op de server staat (de versie gaat omhoog).
  await expect
    .poll(async () => ((await (await request.get(`/api/projecten/${id}`)).json()) as { versie: number }).versie, {
      timeout: 30_000,
    })
    .toBeGreaterThan(1);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");
  const voor = (await (await request.get(`/api/projecten/${id}`)).json()) as { versie: number; document: unknown };

  // De proef van gisteren.
  await zetProefEinde(await organisatieId(request), new Date(Date.now() - DAG_MS));

  // De projectenlijst: de alleen-lezenbanner en geen "Nieuw project".
  await ga(page, "/");
  await expect(page.getByTestId("abonnement-banner-alleen-lezen")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `Abonnement ${run} verlopen` })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Nieuw project" })).toHaveCount(0);

  // Het project opent, maar de knoppen om iets toe te voegen zijn uitgeschakeld.
  await ga(page, `/projecten/${id}`);
  await expect(page.getByTestId("schema-canvas")).toBeVisible();
  await expect(page.getByTestId("abonnement-banner-alleen-lezen")).toBeVisible();
  const sjabloon = page.getByRole("button", { name: "Kring stopcontacten" });
  await expect(sjabloon).toBeDisabled();
  await expect(page.getByTestId("onderdeel-contactdoos")).toBeDisabled();
  await sjabloon.click({ force: true });
  await expect(page.getByTestId("opslagstatus")).not.toHaveText(/Niet opgeslagen|Conflict/);

  // De projectgegevens zijn te bekijken, maar niet te wijzigen: uitgeschakelde velden, geen Bewaren.
  await page.getByTestId("projectnaam").click();
  const gegevens = page.getByRole("dialog");
  await expect(gegevens.getByTestId("dialoog-alleen-lezen")).toContainText("Alleen lezen");
  await expect(gegevens.getByLabel("Naam").first()).toBeDisabled();
  await expect(gegevens.getByTestId("werf-straat")).toBeDisabled();
  await expect(gegevens.getByTestId("projectdatum")).toBeDisabled();
  await expect(gegevens.getByRole("button", { name: "Bewaren" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(gegevens).toHaveCount(0);

  // Ook op de server verandert er niets: een schrijfpoging geeft 402.
  const put = await request.put(`/api/projecten/${id}`, {
    headers: { "If-Match": String(voor.versie) },
    data: { naam: `Abonnement ${run} verlopen` },
  });
  expect(put.status()).toBe(402);
  const na = (await (await request.get(`/api/projecten/${id}`)).json()) as { versie: number; document: unknown };
  expect(na.versie).toBe(voor.versie);
  expect(na.document).toEqual(voor.document);

  // Exporteren blijft kunnen.
  await page.getByTestId("exporteren").click();
  const dialoog = page.getByRole("dialog");
  await expect(dialoog.getByTestId("export-start")).toBeEnabled();
  const download = page.waitForEvent("download");
  await dialoog.getByTestId("export-start").click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  await expect(dialoog.getByTestId("export-rij-V1")).toBeVisible();
});

test("een dialoog die openstaat bij de overgang naar alleen-lezen blijft open met een melding", async ({
  page,
  request,
}) => {
  const thuis = await organisatieId(request);
  await zetProefEinde(thuis, new Date(Date.now() + 20 * DAG_MS));
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam: `Abonnement ${run} overgang`, klantnaam: "Peeters", stroomtype: "2x230V" },
  });
  expect(aangemaakt.status()).toBe(201);
  const { id } = (await aangemaakt.json()) as { id: string };

  try {
    await ga(page, `/projecten/${id}`);
    await expect(page.getByTestId("schema-canvas")).toBeVisible();
    await page.getByTestId("projectnaam").click();
    const dialoog = page.getByRole("dialog");
    await expect(dialoog.getByRole("button", { name: "Bewaren" })).toBeVisible();
    await expect(dialoog.getByTestId("dialoog-alleen-lezen")).toHaveCount(0);

    // Het abonnement vervalt en de sessie wordt opnieuw gelezen terwijl de dialoog openstaat.
    await zetProefEinde(thuis, new Date(Date.now() - DAG_MS));
    await page.evaluate(async () => {
      const app = (
        window as unknown as { useNuxtApp: () => { $pinia: { _s: Map<string, { laad(): Promise<void> }> } } }
      ).useNuxtApp();
      await app.$pinia._s.get("sessie")!.laad();
    });

    await expect(dialoog).toBeVisible();
    await expect(dialoog.getByTestId("dialoog-alleen-lezen")).toContainText("kunnen niet meer bewaard worden");
    await expect(dialoog.getByRole("button", { name: "Bewaren" })).toHaveCount(0);
    await expect(dialoog.getByLabel("Naam").first()).toBeDisabled();
  } finally {
    await zetProefEinde(thuis, new Date(Date.now() + 20 * DAG_MS));
    await request.delete(`/api/projecten/${id}`);
  }
});

test("een vrijgesteld bedrijf ziet op /abonnement geen Kies-kaarten, alleen de status", async ({ page, request }) => {
  await zetVrijgesteld(await organisatieId(request));
  await ga(page, "/abonnement");
  await expect(page.getByTestId("abonnement-status")).toContainText("Je bedrijf hoeft niet te betalen");
  await expect(page.getByTestId("abonnement-kaart-maand")).toHaveCount(0);
  await expect(page.getByTestId("abonnement-kaart-jaar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kies", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("abonnement-prijzen-ontbreken")).toHaveCount(0);
});
