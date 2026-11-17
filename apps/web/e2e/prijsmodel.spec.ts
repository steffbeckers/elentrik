// Het prijsmodel end-to-end (spec 2026-11-07, §5): de gratis limiet in de editor, een project
// vrijgeven via de nep-Stripe (hulp/nep-stripe.ts), een gestempeld project na het abonnement en een
// onderwijsbedrijf. De server draait met Stripe aan en met de standaardlimieten (5 kringen,
// 1 situatieschema). Het watermerk lezen we uit de tekst van de PDF die Gotenberg maakt, zoals
// export.spec.ts de echte export leest.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { voegSjabloonToe, type InstallatieDocument } from "@elentrik/model";
import type { Mij } from "../shared/mij";
import { metE2eDatabase, stempelProject, zetOnderwijs, zetProefEinde } from "./hulp/database";
import { ga } from "./hulp/hydratatie";
import { gebruikTestgebruiker, maakTestgebruiker, uniekAdres } from "./hulp/inloggen";
import { leesPdf } from "./hulp/pdf";
import { E2E_STRIPE_URL, E2E_URL } from "./omgeving";

const { spoor } = gebruikTestgebruiker(test, { voorvoegsel: "prijsmodel", bedrijf: "Prijsmodel Elektro" });

const run = Date.now();
const DAG_MS = 24 * 3600 * 1000;

type Project = { versie: number; document: InstallatieDocument };

test.describe.configure({ mode: "serial" });

async function organisatieId(request: APIRequestContext): Promise<string> {
  return ((await (await request.get("/api/mij")).json()) as Mij).actieveOrganisatieId!;
}

async function haal(request: APIRequestContext, id: string): Promise<Project> {
  const antwoord = await request.get(`/api/projecten/${id}`);
  expect(antwoord.ok()).toBe(true);
  return (await antwoord.json()) as Project;
}

function aantalKringen(document: InstallatieDocument): number {
  return Object.values(document.nodes).filter((n) => n.type === "automaat" || n.type === "zekering").length;
}

/** Een nieuw project met `kringen` keer het sjabloon "Kring stopcontacten" (elk één automaat) op het bord. */
async function projectMetKringen(request: APIRequestContext, naam: string, kringen: number): Promise<string> {
  const aangemaakt = await request.post("/api/projecten", {
    data: { naam: `Prijsmodel ${run} ${naam}`, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  expect(aangemaakt.status()).toBe(201);
  const { id } = (await aangemaakt.json()) as { id: string };
  if (kringen === 0) return id;
  const project = await haal(request, id);
  const bord = Object.values(project.document.nodes).find((n) => n.type === "verdeelbord")!.id;
  let document = project.document;
  for (let i = 0; i < kringen; i++) {
    document = voegSjabloonToe(document, { soort: "nieuw-op-bord", nodeId: bord }, "kring-stopcontacten").doc;
  }
  const bewaard = await request.put(`/api/projecten/${id}`, {
    headers: { "If-Match": String(project.versie) },
    data: { document },
  });
  expect(bewaard.ok()).toBe(true);
  expect(aantalKringen((await haal(request, id)).document)).toBe(kringen);
  return id;
}

/**
 * Exporteert het eendraadschema via de exportroute (die de PDF door Gotenberg laat maken) en geeft
 * de tekst van alle pagina's van de PDF.
 */
async function exportTekst(request: APIRequestContext, id: string, versieLabel: string): Promise<string> {
  const project = await haal(request, id);
  const antwoord = await request.post(`/api/projecten/${id}/exports`, {
    headers: { "If-Match": String(project.versie) },
    data: {
      onderdelen: { eendraadschema: true, situatieschema: false, kringenlijst: false, bijlage: true },
      papier: "A4",
      versieLabel,
    },
    timeout: 120_000,
  });
  expect(antwoord.status(), await antwoord.text()).toBe(201);
  const { bestandId } = (await antwoord.json()) as { bestandId: string };
  const bestand = await request.get(`/api/bestanden/${bestandId}`);
  expect(bestand.ok()).toBe(true);
  const bytes = new Uint8Array(await bestand.body());
  expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  return (await leesPdf(bytes)).paginaTeksten.join("\n");
}

/** Klikt op het sjabloon "Kring stopcontacten" en bevestigt het op het eerste bord. */
async function voegKringToeViaSjabloon(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  await page.getByTestId("invoeg-bestemming").click();
  await page.getByRole("option").first().click();
  await page.getByTestId("bevestig-sjabloon").click();
}

/** Het limietvenster, aan zijn titel herkend. */
function limietvenster(page: Page) {
  return page.getByRole("dialog").filter({ hasText: "Dit project gaat over de gratis limiet" });
}

test("gratis: vijf kringen, zesde opent venster, vrijgeven via nep-Stripe, zesde kring toevoegen lukt, export zonder watermerk", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await zetProefEinde(await organisatieId(request), new Date(Date.now() - DAG_MS));
  const id = await projectMetKringen(request, "vrijgeven", 5);

  // Een gratis project krijgt het watermerk van de gratis versie, ook binnen de limiet.
  const gratis = await exportTekst(request, id, "V1");
  expect(gratis).toContain("Gratis versie");
  expect(gratis).toContain("Geen officieel dossier");

  // De teller staat in beeld.
  await ga(page, `/projecten/${id}`);
  await expect(page.getByTestId("schema-canvas")).toBeVisible();
  await expect(page.getByTestId("limietteller-kringen")).toHaveText("5 van 5 kringen");
  await expect(page.getByTestId("limietteller-situatieschemas")).toHaveText("0 van 1 situatieschema");

  // De zesde kring: het limietvenster, met de prijs en beide knoppen voor de eigenaar.
  await voegKringToeViaSjabloon(page);
  const venster = limietvenster(page);
  await expect(venster).toBeVisible();
  await expect(venster.getByTestId("limietvenster-prijs")).toContainText("25,00");
  await expect(venster.getByTestId("limietvenster-abonnement")).toBeVisible();
  await expect(venster.getByTestId("limietvenster-lid")).toHaveCount(0);
  // De operatie is niet uitgevoerd.
  await expect(page.getByTestId("limietteller-kringen")).toHaveText("5 van 5 kringen");

  // Vrijgeven: naar de nep-Checkout, betalen, terug naar het project.
  await venster.getByTestId("limietvenster-vrijgeven").click();
  await expect(page).toHaveURL(new RegExp(`^${E2E_STRIPE_URL}/checkout/`), { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Nep-Checkout" })).toBeVisible();
  await page.getByRole("button", { name: "Betalen" }).click();
  await expect(page).toHaveURL(new RegExp(`^${E2E_URL}/projecten/${id}`), { timeout: 20_000 });
  await expect(page.getByText("Dit project is vrijgegeven", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page).not.toHaveURL(/vrijgave=/);
  expect(
    await metE2eDatabase(async (sql) => {
      const [rij] = await sql<{ gekocht: boolean; aankoop: string | null }[]>`
        select p.gekocht_op is not null as gekocht,
               (select status from projectaankopen a where a.project_id = p.id) as aankoop
        from projecten p where p.id = ${id}`;
      return rij;
    }),
  ).toEqual({ gekocht: true, aankoop: "betaald" });

  // Een vrijgegeven project heeft geen limiet meer: geen teller, en de zesde kring lukt.
  await expect(page.getByTestId("schema-canvas")).toBeVisible();
  await expect(page.getByTestId("limietteller")).toHaveCount(0);
  await voegKringToeViaSjabloon(page);
  await expect(page.getByTestId("bevestig-sjabloon")).toHaveCount(0);
  await expect(limietvenster(page)).toHaveCount(0);
  await expect.poll(async () => aantalKringen((await haal(request, id)).document), { timeout: 30_000 }).toBe(6);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");

  // En de export heeft geen watermerk meer.
  const vrij = await exportTekst(request, id, "V2");
  expect(vrij).not.toContain("Gratis versie");
  expect(vrij).not.toContain("Geen officieel dossier");
});

test("lid ziet venster zonder betaalknop", async ({ browser, playwright, request }) => {
  const thuis = await organisatieId(request);
  await zetProefEinde(thuis, new Date(Date.now() - DAG_MS));
  const id = await projectMetKringen(request, "lid", 5);

  const api = await playwright.request.newContext({ baseURL: E2E_URL });
  const lid = { naam: "Lid Tester", email: uniekAdres("prijsmodel-lid"), bedrijf: "Lid Elektro" };
  spoor.emails.add(lid.email);
  const staat = await maakTestgebruiker(api, lid).finally(() => api.dispose());
  await metE2eDatabase(
    (sql) => sql`
      insert into member (id, organization_id, user_id, role, created_at)
      select ${`prijsmodel-lid-${run}`}, ${thuis}, id, 'member', now() from "user" where email = ${lid.email}`,
  );

  const context = await browser.newContext({ storageState: staat });
  try {
    expect((await context.request.post("/api/organisaties/actief", { data: { organisatieId: thuis } })).ok()).toBe(true);
    const pagina = await context.newPage();
    await ga(pagina, `/projecten/${id}`);
    await expect(pagina.getByTestId("schema-canvas")).toBeVisible();
    await expect(pagina.getByTestId("limietteller-kringen")).toHaveText("5 van 5 kringen");

    await voegKringToeViaSjabloon(pagina);
    const venster = limietvenster(pagina);
    await expect(venster).toBeVisible();
    await expect(venster.getByTestId("limietvenster-lid")).toHaveText(
      "Vraag de eigenaar van je bedrijf om dit project vrij te geven.",
    );
    await expect(venster.getByTestId("limietvenster-vrijgeven")).toHaveCount(0);
    await expect(venster.getByTestId("limietvenster-abonnement")).toHaveCount(0);
    await expect(venster.getByTestId("limietvenster-prijs")).toHaveCount(0);

    // Ook de server laat een lid niet vrijgeven.
    expect((await context.request.post(`/api/projecten/${id}/vrijgeven`)).status()).toBe(403);
  } finally {
    await context.close();
  }
  expect(aantalKringen((await haal(request, id)).document)).toBe(5);
});

test("gestempeld project na einde abonnement: alleen-lezenbalk, export zonder watermerk", async ({ page, request }) => {
  test.setTimeout(180_000);
  await zetProefEinde(await organisatieId(request), new Date(Date.now() - DAG_MS));
  const id = await projectMetKringen(request, "gestempeld", 2);
  // Bewaard tijdens een abonnement dat intussen voorbij is: het bedrijf is weer gratis.
  await stempelProject(id, new Date(Date.now() - 30 * DAG_MS));
  const voor = await haal(request, id);

  // De projectlijst toont het label.
  await ga(page, "/");
  await expect(page.getByTestId(`projectlabel-${id}`)).toHaveText("Alleen-lezen");
  await expect(page.getByRole("button", { name: "Nieuw project" })).toBeVisible();

  // De editor: de balk met uitleg en de knoppen van de eigenaar; toevoegen kan niet.
  await ga(page, `/projecten/${id}`);
  await expect(page.getByTestId("schema-canvas")).toBeVisible();
  const balk = page.getByTestId("alleen-lezen-balk");
  await expect(balk).toContainText("Dit project is gemaakt tijdens je abonnement.");
  await expect(balk.getByTestId("alleen-lezen-vrijgeven")).toBeVisible();
  await expect(balk.getByTestId("alleen-lezen-abonnement")).toBeVisible();
  await expect(page.getByTestId("limietteller")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kring stopcontacten" })).toBeDisabled();
  await expect(page.getByTestId("onderdeel-contactdoos")).toBeDisabled();

  // De server weigert elke wijziging.
  const put = await request.put(`/api/projecten/${id}`, {
    headers: { "If-Match": String(voor.versie) },
    data: { naam: `Prijsmodel ${run} gewijzigd`, document: voor.document },
  });
  expect(put.status()).toBe(402);
  expect(await put.text()).toContain("PROJECT_ALLEEN_LEZEN");
  expect((await haal(request, id)).versie).toBe(voor.versie);

  // Exporteren kan, zonder watermerk.
  const tekst = await exportTekst(request, id, "V1");
  expect(tekst).not.toContain("Gratis versie");
  expect(tekst).not.toContain("Onderwijsversie");
  expect(tekst).not.toContain("Geen officieel dossier");
});

test("onderwijs: acht kringen, export met Onderwijsversie", async ({ page, request }) => {
  test.setTimeout(180_000);
  const thuis = await organisatieId(request);
  await zetOnderwijs(thuis);
  try {
    // Zeven kringen via de API, de achtste in de editor: geen limiet, geen teller, geen venster.
    const id = await projectMetKringen(request, "onderwijs", 7);
    await ga(page, `/projecten/${id}`);
    await expect(page.getByTestId("schema-canvas")).toBeVisible();
    await expect(page.getByTestId("limietteller")).toHaveCount(0);
    await voegKringToeViaSjabloon(page);
    await expect(page.getByTestId("bevestig-sjabloon")).toHaveCount(0);
    await expect(limietvenster(page)).toHaveCount(0);
    await expect.poll(async () => aantalKringen((await haal(request, id)).document), { timeout: 30_000 }).toBe(8);
    await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");

    // Elke export van een onderwijsbedrijf heeft het watermerk.
    const tekst = await exportTekst(request, id, "V1");
    // pdf.js verliest soms de eerste letter van de diagonale titel ("nderwijsversie"): zonder de O zoeken.
    expect(tekst).toContain("nderwijsversie");
    expect(tekst).toContain("Geen officieel dossier");
    expect(tekst).not.toContain("Gratis versie");
  } finally {
    await zetOnderwijs(thuis, false);
  }
});
