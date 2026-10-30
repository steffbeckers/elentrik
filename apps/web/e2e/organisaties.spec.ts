// Gescheiden organisaties, wisselen tussen eigen organisaties en de laatste eigenaar. Gebruiker A
// (met "Bedrijf Alfa") komt uit `storageState`, gebruiker B (met "Bedrijf Beta") wordt in
// `beforeAll` aangemaakt; niemand logt per test in, zodat de rate limiter nooit in de weg zit.
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import type { Mij } from "../shared/mij";
import { zetVrijgesteld } from "./hulp/database";
import { ga } from "./hulp/hydratatie";
import { gebruikTestgebruiker, maakTestgebruiker, uniekAdres, type StorageState } from "./hulp/inloggen";
import { E2E_URL } from "./omgeving";

const { gebruiker } = gebruikTestgebruiker(test, { voorvoegsel: "alfa", bedrijf: "Bedrijf Alfa", naam: "Alfa Eigenaar" });

const run = Date.now();
const naamAlfa = `Project Alfa ${run}`;
const naamTweede = `Project Alfa Twee ${run}`;
const bedrijfTweede = `Bedrijf Alfa Twee ${run}`;
let staatB: StorageState;

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: E2E_URL });
  try {
    staatB = await maakTestgebruiker(request, {
      naam: "Beta Eigenaar",
      email: uniekAdres("beta"),
      bedrijf: "Bedrijf Beta",
    });
  } finally {
    await request.dispose();
  }
});

async function leesMij(request: APIRequestContext): Promise<Mij> {
  return (await (await request.get("/api/mij")).json()) as Mij;
}

async function maakProject(request: APIRequestContext, naam: string): Promise<string> {
  const antwoord = await request.post("/api/projecten", {
    data: { naam, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  expect(antwoord.status()).toBe(201);
  return ((await antwoord.json()) as { id: string }).id;
}

/** Een pagina met de sessie van gebruiker B, los van gebruiker A. */
async function alsB(browser: Browser) {
  const context = await browser.newContext({ storageState: staatB });
  return { context, page: await context.newPage() };
}

test("een andere organisatie ziet de projecten niet, en een project van een andere organisatie is niet gevonden", async ({
  page,
  browser,
}) => {
  const id = await maakProject(page.request, naamAlfa);

  // Gebruiker A ziet zijn project.
  await ga(page, "/");
  await expect(page.getByRole("row").filter({ hasText: naamAlfa })).toHaveCount(1);

  const { context, page: paginaB } = await alsB(browser);
  try {
    // Gebruiker B heeft een eigen, lege lijst.
    await ga(paginaB, "/");
    await expect(paginaB.getByTestId("organisatie-keuze")).toContainText("Bedrijf Beta");
    await expect(paginaB.getByText("Nog geen projecten. Maak je eerste project aan.")).toBeVisible();
    await expect(paginaB.getByText(naamAlfa)).toHaveCount(0);

    // Het adres van het project van A rechtstreeks openen: "Project niet gevonden".
    await ga(paginaB, `/projecten/${id}`);
    await expect(paginaB.getByText("Project niet gevonden")).toBeVisible();
    await expect(paginaB.getByTestId("schema-canvas")).toHaveCount(0);

    // Ook de API geeft 404, niet 403: het bestaan van het project lekt niet.
    expect((await context.request.get(`/api/projecten/${id}`)).status()).toBe(404);
  } finally {
    await context.close();
  }
});

test("een gebruiker met twee organisaties wisselt via de organisatiekeuze, en de lijsten wisselen mee", async ({
  page,
}) => {
  const { organisaties, actieveOrganisatieId: alfaId } = await leesMij(page.request);
  expect(organisaties).toHaveLength(1);

  try {
    // Een tweede bedrijf aanmaken: het wordt meteen de actieve organisatie, met een lege lijst.
    await ga(page, "/");
    await expect(page.getByRole("row").filter({ hasText: naamAlfa })).toHaveCount(1);
    await page.getByTestId("organisatie-keuze").click();
    await page.getByTestId("organisatie-nieuw").click();
    await page.getByTestId("organisatie-nieuw-naam").fill(bedrijfTweede);
    await page.getByTestId("organisatie-nieuw-knop").click();
    await expect(page.getByTestId("organisatie-keuze")).toContainText(bedrijfTweede);
    // Een tweede eigen bedrijf heeft geen gratis proef (alleen het eerste heeft er een). Dit
    // bestand test het wisselen, niet de abonnementen: dat bedrijf mag daarom schrijven.
    const tweedeBedrijfId = (await leesMij(page.request)).organisaties.find((o) => o.naam === bedrijfTweede)!.id;
    await zetVrijgesteld(tweedeBedrijfId);
    await ga(page, "/");
    await expect(page.getByText("Nog geen projecten. Maak je eerste project aan.")).toBeVisible();
    await expect(page.getByText(naamAlfa)).toHaveCount(0);

    // Een project in het tweede bedrijf.
    await maakProject(page.request, naamTweede);
    await ga(page, "/");
    await expect(page.getByRole("row").filter({ hasText: naamTweede })).toHaveCount(1);
    await expect(page.getByText(naamAlfa)).toHaveCount(0);

    // Terug naar het eerste: andere lijst.
    await page.getByTestId("organisatie-keuze").click();
    await page.getByTestId(`organisatie-optie-${alfaId}`).click();
    await expect(page.getByTestId("organisatie-keuze")).toContainText("Bedrijf Alfa");
    await expect(page.getByRole("row").filter({ hasText: naamAlfa })).toHaveCount(1);
    await expect(page.getByText(naamTweede)).toHaveCount(0);

    // En weer naar het tweede, nu via de keuze.
    const tweedeId = (await leesMij(page.request)).organisaties.find((o) => o.naam === bedrijfTweede)!.id;
    await page.getByTestId("organisatie-keuze").click();
    await page.getByTestId(`organisatie-optie-${tweedeId}`).click();
    await expect(page.getByTestId("organisatie-keuze")).toContainText(bedrijfTweede);
    await expect(page.getByRole("row").filter({ hasText: naamTweede })).toHaveCount(1);
    await expect(page.getByText(naamAlfa)).toHaveCount(0);
  } finally {
    // De actieve organisatie hoort bij de sessie, die alle tests van dit bestand delen.
    await page.request.post("/api/organisaties/actief", { data: { organisatieId: alfaId } });
  }
});

test("de laatste eigenaar kan zichzelf niet degraderen, en de pagina zegt waarom", async ({ page }) => {
  await ga(page, "/organisatie");
  const rij = page.getByTestId(`organisatie-lid-${gebruiker().email}`);
  await expect(rij).toBeVisible();
  await expect(rij.getByTestId("organisatie-lid-rol")).toContainText("Eigenaar");

  await rij.getByTestId("organisatie-lid-rol").click();
  await page.getByRole("option", { name: "Lid" }).click();
  // Exact: de toast staat ook nog in een verborgen aria-live-gebied voor schermlezers.
  await expect(page.getByText("Er moet minstens één eigenaar blijven.", { exact: true })).toBeVisible();

  // Niets veranderd: de gebruiker is nog eigenaar, ook op de server.
  await expect(rij.getByTestId("organisatie-lid-rol")).toContainText("Eigenaar");
  const leden = (await (await page.request.get("/api/organisaties/leden")).json()) as { email: string; rol: string }[];
  expect(leden.find((l) => l.email === gebruiker().email)?.rol).toBe("eigenaar");
  await expect(page.getByTestId("organisatie-uitnodigen-email")).toBeVisible();
});
