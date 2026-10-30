import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { gebruikTestgebruiker } from "./hulp/inloggen";

// Eén ingelogde testgebruiker met een eigen organisatie voor dit hele bestand.
gebruikTestgebruiker(test, { voorvoegsel: "situatie" });

// Elke run gebruikt een unieke naam, zodat de projecten van deze run herkenbaar zijn; `ruimOp` wist ze na afloop.
const naam = `Test Situatie ${Date.now()}`;
const PLAN_PNG = fileURLToPath(new URL("./fixtures/plan.png", import.meta.url));
const PLAN_PDF = fileURLToPath(new URL("./fixtures/plan-2p.pdf", import.meta.url));
const ONBEKEND_ID = "00000000-0000-0000-0000-000000000000";
const NIET_GEPLAATST_A1 = "Punt A1 is nog niet op een situatieplan geplaatst.";
const NIET_GEPLAATST_A2 = "Punt A2 is nog niet op een situatieplan geplaatst.";

type Plaatsing = { nodeId: string; x: number; y: number };
type Pagina = {
  id: string;
  titel: string;
  plaatsingen: Plaatsing[];
  achtergrond?: { rasterBestandId: string; origineelBestandId: string };
};
type Project = { versie: number; document: { situatie: { paginas: Pagina[] } } };

/** De tekstlabels in de SVG van het schema (puntlabels als "A1"). */
function schemaTekst(page: Page, tekst: string) {
  return page.getByTestId("schema-canvas").locator("svg text", { hasText: new RegExp(`^${tekst}$`) });
}

/** Brengt de hele strook in beeld; het schema groeit omhoog en kan anders buiten het venster raken. */
async function pasTeMaken(page: Page) {
  await page.getByRole("button", { name: "Passend maken" }).click();
}

/** Maakt een project met een kring en twee contactdozen (A1 en A2) en opent het op het eendraadschema. */
async function maakProjectMetContactdozen(page: Page, projectNaam: string): Promise<string> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nieuw project" }).click();
  const nieuw = page.getByRole("dialog");
  await nieuw.getByLabel("Naam").fill(projectNaam);
  await nieuw.getByRole("button", { name: "Aanmaken" }).click();
  const rij = page.getByRole("row").filter({ hasText: projectNaam });
  await expect(rij).toHaveCount(1);
  await rij.getByRole("link", { name: "Openen" }).click();
  await expect(page).toHaveURL(/\/projecten\/[0-9a-f-]+$/);
  const projectId = new URL(page.url()).pathname.split("/").pop()!;

  const canvas = page.getByTestId("schema-canvas");
  await pasTeMaken(page);
  await canvas.locator('[data-testid^="plus-rail-einde-"]').click();
  const kringPlus = canvas.locator('[data-testid^="plus-kring-einde-"]');
  await expect(kringPlus).toHaveCount(1);

  await page.keyboard.press("c");
  await expect(page.getByTestId("onderdeel-contactdoos")).toHaveAttribute("aria-pressed", "true");
  for (let i = 1; i <= 2; i++) {
    await pasTeMaken(page);
    await kringPlus.click();
    await expect(schemaTekst(page, `A${i}`)).toHaveCount(1);
  }
  return projectId;
}

/** Voegt via de dialoog het eerste plan (leeg tabblad) of een extra pagina toe. */
async function voegPlanToe(page: Page, bestand: string, opties: { pdfPagina?: number; leeg?: boolean } = {}) {
  await page.getByTestId(opties.leeg ? "plan-toevoegen-leeg" : "pagina-toevoegen").click();
  const dialoog = page.getByRole("dialog");
  await dialoog.getByTestId("plan-bestand").setInputFiles(bestand);
  if (opties.pdfPagina !== undefined) {
    const tegel = dialoog.getByTestId(`pdf-pagina-${opties.pdfPagina}`);
    await tegel.click();
    await expect(tegel).toHaveAttribute("aria-pressed", "true");
  }
  await dialoog.getByTestId("plan-toevoegen-bevestig").click();
  await expect(dialoog).toHaveCount(0, { timeout: 30_000 });
}

async function haalProject(request: APIRequestContext, projectId: string): Promise<Project> {
  const antwoord = await request.get(`/api/projecten/${projectId}`);
  return (await antwoord.json()) as Project;
}

/** Wacht tot de eerste pagina `aantal` plaatsingen op de server heeft, en geeft het project terug. */
async function wachtOpPlaatsingen(request: APIRequestContext, projectId: string, aantal: number): Promise<Project> {
  await expect
    .poll(async () => (await haalProject(request, projectId)).document.situatie.paginas[0]?.plaatsingen.length)
    .toBe(aantal);
  return haalProject(request, projectId);
}

/** Het symbool van de geplaatste nodes op het plan. */
function planSymbolen(page: Page) {
  return page.getByTestId("plan-canvas").locator("g[data-node-id]");
}

/** Een punt op het eerste symbool zelf (niet op de lege ruimte in zijn kader, waar een klik het plan raakt). */
async function symboolPunt(page: Page): Promise<{ x: number; y: number }> {
  const punt = await planSymbolen(page)
    .first()
    .evaluate((g) => {
      for (const deel of g.querySelectorAll("*")) {
        if (deel.tagName === "text") continue;
        const r = deel.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        if (r.width > 0 && document.elementFromPoint(x, y)?.closest("[data-node-id]") === g) return { x, y };
      }
      return null;
    });
  expect(punt).not.toBeNull();
  return punt!;
}

function planLabel(page: Page, tekst: string) {
  return planSymbolen(page).locator("text", { hasText: new RegExp(`^${tekst}$`) });
}

/** Het rasterbestand is geladen: de browser kan het decoderen tot een afbeelding met breedte. */
async function planAfbeeldingGeladen(page: Page): Promise<number> {
  return page.getByTestId("plan-afbeelding").evaluate(async (el) => {
    const afbeelding = new Image();
    afbeelding.src = el.getAttribute("href")!;
    await afbeelding.decode();
    return afbeelding.naturalWidth;
  });
}

test("plan toevoegen, plaatsen, herstellen, van plan halen en een ontbrekend plan", async ({ page, request }) => {
  test.setTimeout(120_000);
  const dialogen: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogen.push(dialog.message());
    await dialog.dismiss();
  });

  const projectId = await maakProjectMetContactdozen(page, `${naam} plan`);
  const bevindingen = page.getByTestId("bevindingen-info");

  // 1. Het tabblad Situatieschema is leeg; een PNG als eerste plan geeft een pagina met een geladen afbeelding.
  await page.getByTestId("tab-situatieschema").click();
  await expect(page.getByTestId("plan-leeg")).toBeVisible();
  await expect(page.getByTestId("te-plaatsen-A1")).toBeVisible();
  await expect(page.getByTestId("te-plaatsen-A2")).toBeVisible();
  await voegPlanToe(page, PLAN_PNG, { leeg: true });
  await expect(page.getByTestId("pagina-tab-0")).toContainText("plan");
  await expect.poll(() => planAfbeeldingGeladen(page)).toBe(1200);
  await expect(bevindingen).toContainText(NIET_GEPLAATST_A1);

  // 2. A1 uit "Te plaatsen" naar het plan slepen: het label staat op het plan, de bevinding verdwijnt.
  const canvas = page.getByTestId("plan-canvas");
  await expect(planSymbolen(page)).toHaveCount(0);
  await page.getByTestId("te-plaatsen-A1").dragTo(canvas);
  await expect(planLabel(page, "A1")).toHaveCount(1);
  await expect(page.getByTestId("te-plaatsen-A1")).toHaveCount(0);
  await expect(page.getByTestId("te-plaatsen-A2")).toHaveCount(1);
  await expect(bevindingen).not.toContainText(NIET_GEPLAATST_A1);
  await expect(bevindingen).toContainText(NIET_GEPLAATST_A2);

  // 3. Ctrl+Z haalt de plaatsing weg: A1 staat weer in "Te plaatsen". Ctrl+Y zet haar terug.
  // (De ongedaan-geschiedenis overleeft een herlading niet, dus dit gebeurt vóór het herladen.)
  await page.keyboard.press("Control+z");
  await expect(planLabel(page, "A1")).toHaveCount(0);
  await expect(page.getByTestId("te-plaatsen-A1")).toBeVisible();
  await expect(bevindingen).toContainText(NIET_GEPLAATST_A1);
  await page.keyboard.press("Control+y");
  await expect(planLabel(page, "A1")).toHaveCount(1);
  await expect(page.getByTestId("te-plaatsen-A1")).toHaveCount(0);

  // 4. Wachten op "Opgeslagen" en herladen: A1 staat nog op het plan.
  await wachtOpPlaatsingen(request, projectId, 1);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByTestId("tab-situatieschema").click();
  await expect(planLabel(page, "A1")).toHaveCount(1);
  await expect(page.getByTestId("te-plaatsen-A1")).toHaveCount(0);

  // 5. Selecteer A1 op het plan en druk op Delete: alleen van het plan, het punt blijft in het eendraadschema.
  const punt = await symboolPunt(page);
  await page.mouse.click(punt.x, punt.y);
  await expect(page.locator('[data-testid^="plan-selectie-"]')).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(planLabel(page, "A1")).toHaveCount(0);
  await expect(page.getByTestId("te-plaatsen-A1")).toBeVisible();
  await page.getByTestId("tab-eendraadschema").click();
  await expect(schemaTekst(page, "A1")).toHaveCount(1);
  await expect(schemaTekst(page, "A2")).toHaveCount(1);
  await page.getByTestId("tab-situatieschema").click();

  // 6. Een tweede pagina uit een PDF van 2 pagina's, pagina 2: titel "plan-2p p2" en een geladen afbeelding.
  await voegPlanToe(page, PLAN_PDF, { pdfPagina: 2 });
  await expect(page.getByTestId("pagina-tab-1")).toContainText("plan-2p p2");
  await expect(page.getByTestId("pagina-tab-1")).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => planAfbeeldingGeladen(page)).toBeGreaterThan(0);
  await expect(page.getByTestId("plan-niet-gevonden")).toHaveCount(0);

  // 7. Review Focus 1: een rasterbestand dat niet bestaat geeft "Plan niet gevonden"; de plaatsingen blijven.
  // Eerst A1 opnieuw plaatsen op pagina 1 (klikken), zodat er iets te behouden is.
  await page.getByTestId("pagina-tab-0").click();
  await page.getByTestId("te-plaatsen-A1").click();
  await canvas.click({ position: { x: 300, y: 200 } });
  await expect(planLabel(page, "A1")).toHaveCount(1);
  await wachtOpPlaatsingen(request, projectId, 1);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  const bewaard = await haalProject(request, projectId);

  const kapot = structuredClone(bewaard.document);
  for (const pagina of kapot.situatie.paginas) {
    pagina.achtergrond = {
      ...pagina.achtergrond!,
      rasterBestandId: ONBEKEND_ID,
      origineelBestandId: ONBEKEND_ID,
    };
  }
  const put = await request.put(`/api/projecten/${projectId}`, {
    headers: { "If-Match": String(bewaard.versie) },
    data: { document: kapot },
  });
  expect(put.ok(), await put.text()).toBe(true);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByTestId("tab-situatieschema").click();
  await expect(page.getByTestId("plan-niet-gevonden")).toContainText("Plan niet gevonden");
  await expect(page.getByRole("button", { name: "Plan opnieuw kiezen" })).toBeVisible();
  await expect(planLabel(page, "A1")).toHaveCount(1);

  // 8. Een SVG wordt geweigerd met een melding en voegt geen pagina toe.
  const paginas = page.locator('[data-testid^="pagina-tab-"]');
  const paginasVoor = await paginas.count();
  await page.getByTestId("pagina-toevoegen").click();
  const dialoog = page.getByRole("dialog");
  await dialoog.getByTestId("plan-bestand").setInputFiles({
    name: "plan.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    ),
  });
  await expect(page.getByText("Dit bestandstype wordt niet aanvaard.", { exact: true })).toBeVisible();
  await expect(dialoog.getByTestId("plan-toevoegen-bevestig")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialoog).toHaveCount(0);
  await expect(paginas).toHaveCount(paginasVoor);

  expect(dialogen).toEqual([]);
});

test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("een geplaatst symbool verschuift met één vinger op het plan", async ({ page, request }) => {
    test.setTimeout(120_000);
    const projectId = await maakProjectMetContactdozen(page, `${naam} touch`);
    await page.getByTestId("tab-situatieschema").click();
    await voegPlanToe(page, PLAN_PNG, { leeg: true });

    // Plaatsen met een klik: kies A1 in de lijst en klik op het plan.
    await page.getByTestId("te-plaatsen-A1").click();
    await page.getByTestId("plan-canvas").click({ position: { x: 300, y: 200 } });
    await expect(planLabel(page, "A1")).toHaveCount(1);
    const voor = (await wachtOpPlaatsingen(request, projectId, 1)).document.situatie.paginas[0]!.plaatsingen[0]!;
    await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });

    // Het midden van de groep ligt niet noodzakelijk op een lijn van het symbool: alleen het raakvlak
    // maakt dat punt aanwijsbaar.
    const symbool = planSymbolen(page).first();
    const symboolVoor = (await symbool.boundingBox())!;
    const start = { x: symboolVoor.x + symboolVoor.width / 2, y: symboolVoor.y + symboolVoor.height / 2 };
    const planVoor = (await page.getByTestId("plan-afbeelding").boundingBox())!;

    const cdp = await page.context().newCDPSession(page);
    const raak = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
      });
    await raak("touchStart", start.x, start.y);
    for (let stap = 1; stap <= 10; stap++) await raak("touchMove", start.x + stap * 8, start.y + stap * 4);
    await raak("touchEnd", start.x + 80, start.y + 40);

    // Het symbool staat 80 x 40 schermpixels verder terwijl het plan blijft liggen, en de plaatsing is bewaard.
    await expect
      .poll(async () => {
        const nu = (await symbool.boundingBox())!;
        return { dx: Math.round(nu.x - symboolVoor.x), dy: Math.round(nu.y - symboolVoor.y) };
      })
      .toEqual({ dx: 80, dy: 40 });
    expect(await page.getByTestId("plan-afbeelding").boundingBox()).toEqual(planVoor);
    await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
    await expect
      .poll(async () => {
        const p = (await haalProject(request, projectId)).document.situatie.paginas[0]!.plaatsingen[0]!;
        return p.x > voor.x && p.y > voor.y;
      })
      .toBe(true);
  });
});
