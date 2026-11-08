import { bevestigSjabloonOpBord } from './hulp/sjabloon';
// Abonnementen end-to-end, tegen een nep-Stripe op poort 3199 (zie hulp/nep-stripe.ts en
// global-setup.ts). De server draait met Stripe aan. Een nieuwe organisatie start gratis, zonder
// proef; de overgangsproef (en het einde ervan) zetten we rechtstreeks in de e2e-database. Wat
// tijdens de proef bewaard wordt, is gestempeld en wordt na de proef alleen-lezen.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Mij } from "../shared/mij";
import { metE2eDatabase, stempelProject, zetProefEinde, zetVrijgesteld } from "./hulp/database";
import { ga } from "./hulp/hydratatie";
import { gebruikTestgebruiker, maakTestgebruiker, uniekAdres } from "./hulp/inloggen";
import { E2E_STRIPE_URL, E2E_URL } from "./omgeving";

const { spoor } = gebruikTestgebruiker(test, { voorvoegsel: "abonnement", bedrijf: "Abonnement Elektro" });

const run = Date.now();
const DAG_MS = 24 * 3600 * 1000;

async function organisatieId(request: APIRequestContext): Promise<string> {
  return ((await (await request.get("/api/mij")).json()) as Mij).actieveOrganisatieId!;
}

test.describe.configure({ mode: "serial" });

test("formules: gratis, per project en twee kaarten met bedragen en korting, en Kies bij Jaarlijks gaat naar de nep-Stripe", async ({
  page,
}) => {
  await ga(page, "/abonnement");
  await expect(page.getByTestId("abonnement-status")).toHaveText("Je gebruikt de gratis versie van Elentrik.");
  await expect(page.getByTestId("abonnement-blok-gratis")).toContainText(
    "Elk gratis project mag maximaal 5 kringen en 1 situatieschema bevatten.",
  );
  await expect(page.getByTestId("abonnement-blok-project")).toContainText("25,00");

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
  spoor.emails.add(lid.email);
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

test("verlopen proef: het gestempelde project is alleen-lezen met de balk, Nieuw project blijft, geen wijzigingen, wel exporteren", async ({
  page,
  request,
}) => {
  const thuis = await organisatieId(request);
  // De overgangsproef loopt: volledige toegang, en wat bewaard wordt, krijgt een stempel.
  await zetProefEinde(thuis, new Date(Date.now() + 20 * DAG_MS));
  await ga(page, "/abonnement");
  await expect(page.getByTestId("abonnement-status")).toContainText("Gratis proefperiode: nog");

  // Een project met een kring, gemaakt zolang de proef nog loopt.
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam: `Abonnement ${run} verlopen`, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  expect(aangemaakt.status()).toBe(201);
  const { id } = (await aangemaakt.json()) as { id: string };
  await ga(page, `/projecten/${id}`);
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  await bevestigSjabloonOpBord(page);
  // Wachten tot de kring op de server staat (de versie gaat omhoog).
  await expect
    .poll(async () => ((await (await request.get(`/api/projecten/${id}`)).json()) as { versie: number }).versie, {
      timeout: 30_000,
    })
    .toBeGreaterThan(1);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");
  const voor = (await (await request.get(`/api/projecten/${id}`)).json()) as { versie: number; document: unknown };

  // De proef van gisteren.
  await zetProefEinde(thuis, new Date(Date.now() - DAG_MS));

  // De projectenlijst: geen banner voor het hele bedrijf, "Nieuw project" blijft (een nieuw project
  // is gratis), en het gestempelde project heeft het label "Alleen-lezen".
  await ga(page, "/");
  await expect(page.getByRole("row").filter({ hasText: `Abonnement ${run} verlopen` })).toHaveCount(1);
  await expect(page.getByTestId(`projectlabel-${id}`)).toHaveText("Alleen-lezen");
  await expect(page.getByRole("button", { name: "Nieuw project" })).toBeVisible();
  await expect(page.locator('[data-testid^="abonnement-banner-"]')).toHaveCount(0);

  // Het project opent met de alleen-lezenbalk, en de knoppen om iets toe te voegen zijn uitgeschakeld.
  await ga(page, `/projecten/${id}`);
  await expect(page.getByTestId("schema-canvas")).toBeVisible();
  await expect(page.getByTestId("alleen-lezen-balk")).toContainText("Dit project is gemaakt tijdens je abonnement.");
  const sjabloon = page.getByRole("button", { name: "Kring stopcontacten" });
  await expect(sjabloon).toBeDisabled();
  await expect(page.getByTestId("onderdeel-contactdoos")).toBeDisabled();
  await sjabloon.click({ force: true });
  await expect(page.getByTestId("opslagstatus")).not.toHaveText(/Niet opgeslagen|Conflict/);

  // De projectgegevens zijn te bekijken, maar niet te wijzigen: uitgeschakelde velden, geen Bewaren.
  await page.getByTestId("projectnaam").click();
  const gegevens = page.getByRole("dialog");
  await expect(gegevens.getByTestId("dialoog-alleen-lezen")).toContainText("Alleen lezen");
  await expect(gegevens.getByLabel("Projectnaam")).toBeDisabled();
  await expect(gegevens.getByTestId("werf-zelfde-als-klant")).toBeDisabled();
  await expect(gegevens.getByTestId("klant-straat")).toBeDisabled();
  await expect(gegevens.getByTestId("projectdatum")).toBeDisabled();
  await expect(gegevens.getByRole("button", { name: "Bewaren" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(gegevens).toHaveCount(0);

  // Ook op de server verandert er niets: een schrijfpoging geeft 402.
  const put = await request.put(`/api/projecten/${id}`, {
    headers: { "If-Match": String(voor.versie) },
    data: { naam: `Abonnement ${run} verlopen`, document: voor.document },
  });
  expect(put.status()).toBe(402);
  expect(await put.text()).toContain("PROJECT_ALLEEN_LEZEN");
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

test("een dialoog die openstaat als het bewaren alleen-lezen terugkrijgt, blijft open met een melding", async ({
  page,
  request,
}) => {
  const thuis = await organisatieId(request);
  // Gemaakt tijdens de overgangsproef: het project is gestempeld.
  await zetProefEinde(thuis, new Date(Date.now() + 20 * DAG_MS));
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam: `Abonnement ${run} overgang`, klantnaam: "Peeters", stroomtype: "2x230V" },
  });
  expect(aangemaakt.status()).toBe(201);
  const { id } = (await aangemaakt.json()) as { id: string };

  try {
    await ga(page, `/projecten/${id}`);
    await expect(page.getByTestId("schema-canvas")).toBeVisible();

    // De proef loopt af terwijl de editor openstaat. De editor merkt dat bij het volgende bewaren
    // (402 PROJECT_ALLEEN_LEZEN). Dat bewaren houden we vast tot de dialoog openstaat.
    await zetProefEinde(thuis, new Date(Date.now() - DAG_MS));
    let laatDoor!: () => void;
    const poort = new Promise<void>((klaar) => (laatDoor = klaar));
    await page.route(`**/api/projecten/${id}`, async (route) => {
      if (route.request().method() === "PUT") await poort;
      await route.continue();
    });
    const bewaren = page.waitForResponse(
      (r) => r.url().endsWith(`/api/projecten/${id}`) && r.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Kring stopcontacten" }).click();
    await bevestigSjabloonOpBord(page);

    await page.getByTestId("projectnaam").click();
    const dialoog = page.getByRole("dialog");
    await expect(dialoog.getByRole("button", { name: "Bewaren" })).toBeVisible();
    await expect(dialoog.getByTestId("dialoog-alleen-lezen")).toHaveCount(0);

    laatDoor();
    expect((await bewaren).status()).toBe(402);

    await expect(dialoog).toBeVisible();
    await expect(dialoog.getByTestId("dialoog-alleen-lezen")).toContainText("kunnen niet bewaard worden");
    await expect(dialoog.getByRole("button", { name: "Bewaren" })).toHaveCount(0);
    await expect(dialoog.getByLabel("Projectnaam")).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("alleen-lezen-balk")).toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await request.delete(`/api/projecten/${id}`);
  }
});

test("conceptdialoog die alleen-lezen wordt: 'Later' sluit zonder het concept te wissen", async ({ page, request }) => {
  const thuis = await organisatieId(request);
  // Gratis, zonder proef: het project heeft een limiet, en dan leest de editor bij het terugkeren in
  // het tabblad de projecttoegang opnieuw.
  await zetProefEinde(thuis, new Date(Date.now() - DAG_MS));
  const gebruikerId = ((await (await request.get("/api/mij")).json()) as { gebruiker: { id: string } }).gebruiker.id;
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam: `Abonnement ${run} later`, klantnaam: "Peeters", stroomtype: "2x230V" },
  });
  expect(aangemaakt.status()).toBe(201);
  const { id } = (await aangemaakt.json()) as { id: string };
  const project = (await (await request.get(`/api/projecten/${id}`)).json()) as {
    naam: string;
    versie: number;
    document: unknown;
  };
  const sleutel = `concept:u:${gebruikerId}:${id}:e2e`;

  /** Of het concept nog in het IndexedDB-archief van de editor staat. */
  const staatInArchief = () =>
    page.evaluate(
      (s) =>
        new Promise<boolean>((klaar, fout) => {
          const open = indexedDB.open("keyval-store");
          open.onerror = () => fout(open.error);
          open.onsuccess = () => {
            const vraag = open.result.transaction("keyval").objectStore("keyval").getAllKeys();
            vraag.onsuccess = () => klaar(vraag.result.map(String).includes(s));
            vraag.onerror = () => fout(vraag.error);
          };
        }),
      sleutel,
    );

  try {
    // Een openstaand concept van dit project, zoals een eerder venster het achterliet.
    await ga(page, `/projecten/${id}`);
    await expect(page.getByTestId("schema-canvas")).toBeVisible();
    await page.evaluate(
      ({ s, concept }) =>
        new Promise<void>((klaar, fout) => {
          const open = indexedDB.open("keyval-store");
          open.onerror = () => fout(open.error);
          open.onsuccess = () => {
            const transactie = open.result.transaction("keyval", "readwrite");
            transactie.objectStore("keyval").put(concept, s);
            transactie.oncomplete = () => klaar();
            transactie.onerror = () => fout(transactie.error);
          };
        }),
      { s: sleutel, concept: { document: project.document, versie: project.versie, naam: project.naam, tijd: Date.now() } },
    );
    await ga(page, `/projecten/${id}`);
    const dialoog = page.getByRole("dialog");
    await expect(dialoog).toContainText("Lokaal concept gevonden");
    await expect(dialoog.getByRole("button", { name: "Concept laden" })).toBeEnabled();
    await expect(dialoog.getByTestId("concept-later")).toHaveCount(0);

    // Het project blijkt intussen gestempeld (bewaard tijdens een abonnement dat voorbij is) en dus
    // alleen-lezen, terwijl de dialoog openstaat: laden kan niet meer, "Later" wel.
    await stempelProject(id);
    await keerTerugInTabblad(page, id);
    await expect(dialoog.getByRole("button", { name: "Concept laden" })).toHaveCount(0);
    await expect(dialoog.getByRole("button", { name: "Verwerpen" })).toBeVisible();
    await dialoog.getByTestId("concept-later").click();

    await expect(dialoog).toHaveCount(0);
    expect(await staatInArchief()).toBe(true);
  } finally {
    await request.delete(`/api/projecten/${id}`);
  }
});

test("een vrijgesteld bedrijf ziet op /abonnement geen Kies-kaarten, alleen de status", async ({ page, request }) => {
  const thuis = await organisatieId(request);
  await zetVrijgesteld(thuis);
  try {
    await controleerVrijgesteld(page);
  } finally {
    await metE2eDatabase((sql) => sql`update organization set vrijgesteld = false where id = ${thuis}`);
  }
});

/**
 * De gebruiker komt terug in het tabblad: de editor leest dan de sessie en, bij een beperkt project
 * (met limiet of alleen-lezen), de projecttoegang opnieuw (een `focus` op het venster, zoals bij het
 * terugkeren uit een ander tabblad). Zo volgt de pagina wat intussen in de database veranderde,
 * zonder in de interne toestand van de app te grijpen.
 */
async function keerTerugInTabblad(page: Page, projectId: string): Promise<void> {
  const sessie = page.waitForResponse((r) => r.url().endsWith("/api/mij") && r.request().method() === "GET");
  const toegang = page.waitForResponse(
    (r) => r.url().endsWith(`/api/projecten/${projectId}`) && r.request().method() === "GET",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await sessie).ok()).toBe(true);
  expect((await toegang).ok()).toBe(true);
}

async function controleerVrijgesteld(page: Page): Promise<void> {
  await ga(page, "/abonnement");
  await expect(page.getByTestId("abonnement-status")).toContainText("Je bedrijf hoeft niet te betalen");
  await expect(page.getByTestId("abonnement-kaart-maand")).toHaveCount(0);
  await expect(page.getByTestId("abonnement-kaart-jaar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kies", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("abonnement-prijzen-ontbreken")).toHaveCount(0);
}
