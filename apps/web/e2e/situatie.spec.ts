import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import type { Mij } from "../shared/mij";
import type { InstallatieDocument } from "@elentrik/model";
import { zetProefEinde } from "./hulp/database";
import { gebruikTestgebruiker } from "./hulp/inloggen";

// Eén ingelogde testgebruiker met een eigen organisatie voor dit hele bestand.
gebruikTestgebruiker(test, { voorvoegsel: "situatie" });

// Elke run gebruikt een unieke naam, zodat de projecten van deze run herkenbaar zijn; `ruimOp` wist ze na afloop.
const naam = `Test Situatie ${Date.now()}`;
const PLAN_PNG = fileURLToPath(new URL("./fixtures/plan.png", import.meta.url));
const PLAN_PDF = fileURLToPath(new URL("./fixtures/plan-2p.pdf", import.meta.url));
const ONBEKEND_ID = "00000000-0000-0000-0000-000000000000";

test("opmaak aanpassen in het echte afdrukvoorbeeld bewaart labeloffset zonder bronpositie te veranderen", async ({ page, request }) => {
  test.setTimeout(120_000);
  const id = await maakProjectMetContactdozen(page, `${naam} afdrukopmaak`, 1);
  await page.getByTestId("tab-situatieschema").click();
  await voegPlanToe(page, PLAN_PNG, { leeg: true });
  await page.getByRole("button", { name: "Teller", exact: true }).click();
  await page.getByTestId("plan-canvas").click({ position: { x: 350, y: 250 } });
  const voor = (await wachtOpPlaatsingen(request, id, 1)).document.situatie.paginas[0]!.plaatsingen[0]!;
  await voegPlanToe(page, PLAN_PNG);
  await expect.poll(async () => (await haalProject(request, id)).document.situatie.paginas.length).toBe(2);
  const tweedePagina = (await haalProject(request, id)).document.situatie.paginas[1]!.id;
  await page.getByTestId("pagina-tab-0").click();
  await page.getByTestId("werkruimte-opmaak").click();
  await page.getByTestId("plan-afdruk-opmaken").click();
  const dialoog = page.getByRole("dialog", { name: "Afdrukvoorbeeld", exact: true });
  await expect(dialoog).toBeVisible();
  await dialoog.getByTestId("afdruk-punt").selectOption(voor.nodeId);
  const frame = page.frameLocator('[data-testid="afdrukvoorbeeld"]');
  const label = frame.locator(`g[data-node-id="${voor.nodeId}"] > text`).first();
  await expect(label).toHaveText("Teller");
  const x = Number(await label.getAttribute("x"));
  const offset = dialoog.getByTestId("plan-label-offset-x");
  await offset.fill("70");
  await offset.blur();
  await expect.poll(async () => Number(await label.getAttribute("x"))).toBeCloseTo(x + 70, 1);
  await expect.poll(async () => {
    const p = await (await request.get(`/api/projecten/${id}`)).json() as { document: InstallatieDocument };
    return p.document.situatie.paginas[0]!.plaatsingen[0];
  }).toMatchObject({ ...voor, labelOffset: { x: 70, y: 0 } });
  await dialoog.getByTestId("afdruk-instellingen-open").click();
  const instellingen = page.getByRole("dialog", { name: "Afdrukinstellingen", exact: true });
  await instellingen.getByRole("radio", { name: "A3", exact: true }).click();
  await instellingen.getByRole("button", { name: "Instellingen bewaren" }).click();
  await expect.poll(async () => frame.locator('.pagina').first().evaluate(el => parseFloat(getComputedStyle(el).width))).toBeGreaterThan(1500);
  await dialoog.getByTestId("afdruk-pagina").selectOption(tweedePagina);
  await expect.poll(() => frame.locator(`[data-situatie-pagina-id="${tweedePagina}"]`).evaluate(el => {
    const rect = el.closest('section')!.getBoundingClientRect();
    return rect.top >= -1 && rect.bottom <= el.ownerDocument.defaultView!.innerHeight + 1;
  })).toBe(true);
  await dialoog.getByTestId("afdruk-pagina").selectOption((await haalProject(request, id)).document.situatie.paginas[0]!.id);
  await dialoog.getByTestId("afdruk-punt").selectOption(voor.nodeId);
  await page.screenshot({ path: 'test-results/afdruk-opmaak-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(offset).toBeVisible();
  await expect.poll(() => dialoog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/afdruk-opmaak-mobiel.png' });
  await dialoog.getByRole("button", { name: "Sluiten", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await page.reload();
  await page.getByTestId("tab-situatieschema").click();
  const bewaard = await (await request.get(`/api/projecten/${id}`)).json() as { document: InstallatieDocument };
  expect(bewaard.document.situatie.paginas[0]!.plaatsingen[0]).toMatchObject({ ...voor, labelOffset: { x: 70, y: 0 } });
});

type Plaatsing = { nodeId: string; x: number; y: number; rotatie: number };
type Pagina = {
  id: string;
  titel: string;
  plaatsingen: Plaatsing[];
  afdekkingen?: { id: string; x: number; y: number; breedte: number; hoogte: number }[];
  achtergrond?: { rasterBestandId: string; origineelBestandId: string };
};
type Project = { versie: number; document: { situatie: { paginas: Pagina[] } } };

/** Ongeplaatste onderdelen staan in de dossierchecklist; het verdeelbord telt ook mee. */
async function verwachtOngeplaatst(page: Page, aantal: number) {
  await page.getByTestId("werkruimte-bevindingen").click();
  const checklist = page.getByTestId("dossier-checklist");
  const details = checklist.locator("..");
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await expect(checklist.getByRole("button", { name: `Nog ${aantal} onderdelen op het plan plaatsen`, exact: true })).toBeVisible();
  await page.getByTestId("werkruimte-onderdelen").click();
}

/** De tekstlabels in de SVG van het schema (puntlabels als "A1"). */
function schemaTekst(page: Page, tekst: string) {
  return page.getByTestId("schema-canvas").locator("svg text", { hasText: new RegExp(`^${tekst}$`) });
}

/** Brengt de hele strook in beeld; het schema groeit omhoog en kan anders buiten het venster raken. */
async function pasTeMaken(page: Page) {
  await page.getByRole("button", { name: "Passend maken" }).click();
}

/** Maakt een project met een kring en twee contactdozen (A1 en A2) en opent het op het eendraadschema. */
async function maakProjectMetContactdozen(page: Page, projectNaam: string, aantal = 2): Promise<string> {
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
  // The rail action already added A1. Add only the remaining requested points.
  await expect(schemaTekst(page, "A1")).toHaveCount(1);
  for (let i = 2; i <= aantal; i++) {
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

test("kwartslag in één klik, fijn draaien, undo en herladen op desktop en mobiel", async ({ page, request }) => {
  test.setTimeout(120_000);
  const projectId = await maakProjectMetContactdozen(page, `${naam} kwartslag`);
  await page.getByTestId("tab-situatieschema").click();
  await voegPlanToe(page, PLAN_PNG, { leeg: true });
  await planAfbeeldingGeladen(page);
  const canvas = page.getByTestId("plan-canvas");
  await page.getByTestId("te-plaatsen-A1").click();
  await canvas.click({ position: { x: 180, y: 180 } });
  const punt = await symboolPunt(page);
  await page.mouse.click(punt.x, punt.y);
  const rechts = page.getByRole("button", { name: "Draai 90° rechtsom", exact: true });
  const links = page.getByRole("button", { name: "Draai 90° linksom", exact: true });
  const rotatie = () => haalProject(request, projectId).then(p => p.document.situatie.paginas[0]?.plaatsingen[0]?.rotatie);
  await rechts.click();
  await expect.poll(rotatie).toBe(90);
  await canvas.focus();
  await page.keyboard.press("r");
  await expect.poll(rotatie).toBe(105);
  await page.keyboard.press("Shift+r");
  await expect.poll(rotatie).toBe(90);
  await links.click();
  await expect.poll(rotatie).toBe(0);
  await page.keyboard.press("Control+z");
  await expect.poll(rotatie).toBe(90);
  await page.keyboard.press("Control+y");
  await expect.poll(rotatie).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rechts).toBeInViewport();
  await expect(links).toBeInViewport();
  await rechts.click();
  await expect.poll(rotatie).toBe(90);
  await page.reload();
  await page.getByTestId("tab-situatieschema").click();
  await expect(planLabel(page, "A1")).toHaveCount(1);
  await expect.poll(rotatie).toBe(90);
});

test("bron handmatig afdekken, ongedaan maken, herladen en verwijderen op mobiel", async ({ page, request }) => {
  test.setTimeout(120_000);
  const projectId = await maakProjectMetContactdozen(page, `${naam} afdekken`);
  await page.getByTestId("tab-situatieschema").click();
  await voegPlanToe(page, PLAN_PNG, { leeg: true });
  await planAfbeeldingGeladen(page);
  const canvas = page.getByTestId("plan-canvas");
  await page.getByTestId("te-plaatsen-A1").click();
  await canvas.click({ position: { x: 180, y: 180 } });
  await wachtOpPlaatsingen(request, projectId, 1);
  const voor = (await haalProject(request, projectId)).document.situatie.paginas[0]!;
  await page.getByTestId("plan-opschonen").click();
  await expect(page.getByRole("button", { name: "Draai 90° rechtsom", exact: true })).toBeDisabled();
  const hoek = async (x: number, y: number) => {
    const scherm = await canvas.locator("svg").evaluate((svg, p) => {
      const punt = (svg as SVGSVGElement).createSVGPoint();
      punt.x = p.x; punt.y = p.y;
      const s = punt.matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
      return { x: s.x, y: s.y };
    }, { x, y });
    await page.mouse.click(scherm.x, scherm.y);
  };
  await hoek(100, 100);
  await expect(page.getByTestId("plan-afdekbediening")).toContainText("Tik op de tegenoverliggende hoek");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("plan-afdekbediening")).toContainText("Tik op twee tegenoverliggende hoeken");
  await expect(canvas.getByTestId("plan-afdekkingen").locator("rect")).toHaveCount(0);
  await hoek(100, 100);
  await hoek(180, 160);
  const afdekkingen = () => haalProject(request, projectId).then(p => p.document.situatie.paginas[0]?.afdekkingen ?? []);
  await expect.poll(async () => (await afdekkingen()).length).toBe(1);
  await expect(canvas.getByTestId("plan-afdekkingen").locator("rect")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await afdekkingen()).length).toBe(0);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await afdekkingen()).length).toBe(1);
  await page.getByRole("button", { name: "Klaar", exact: true }).click();
  await expect(canvas.locator("[data-afdekking-id]")).toHaveCount(0);
  expect((await haalProject(request, projectId)).document.situatie.paginas[0]).toMatchObject({ achtergrond: voor.achtergrond, plaatsingen: voor.plaatsingen });
  await page.reload();
  await page.getByTestId("tab-situatieschema").click();
  await expect(canvas.getByTestId("plan-afdekkingen").locator("rect")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("plan-opschonen").click();
  const vlak = (await afdekkingen())[0]!;
  await page.getByTestId("plan-afdekkeuze").selectOption(vlak.id);
  await page.getByTestId("plan-afdekverwijder").click();
  await expect.poll(async () => (await afdekkingen()).length).toBe(0);
  await page.getByText("Afmetingen invoeren", { exact: true }).click();
  await page.getByLabel("Links (beeldpunten van het plan)", { exact: true }).fill("30");
  await page.getByLabel("Boven (beeldpunten van het plan)", { exact: true }).fill("40");
  await page.getByLabel("Breedte (beeldpunten van het plan)", { exact: true }).fill("50");
  await page.getByLabel("Hoogte (beeldpunten van het plan)", { exact: true }).fill("60");
  await page.getByRole("button", { name: "Afdekking toevoegen", exact: true }).click();
  await expect.poll(async () => (await afdekkingen()).map(({ x, y, breedte, hoogte }) => ({ x, y, breedte, hoogte }))).toEqual([{ x: 30, y: 40, breedte: 50, hoogte: 60 }]);
});

test("plan toevoegen, plaatsen, herstellen, van plan halen en een ontbrekend plan", async ({ page, request }) => {
  test.setTimeout(120_000);
  const dialogen: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogen.push(dialog.message());
    await dialog.dismiss();
  });

  const projectId = await maakProjectMetContactdozen(page, `${naam} plan`);

  // 1. Het tabblad Situatieschema is leeg; een PNG als eerste plan geeft een pagina met een geladen afbeelding.
  await page.getByTestId("tab-situatieschema").click();
  await expect(page.getByTestId("plan-leeg")).toBeVisible();
  await expect(page.getByTestId("te-plaatsen-A1")).toBeVisible();
  await expect(page.getByTestId("te-plaatsen-A2")).toBeVisible();
  const ongeplaatst = await page.locator('button[draggable][data-testid^="te-plaatsen-"]').count();
  await voegPlanToe(page, PLAN_PNG, { leeg: true });
  await expect(page.getByTestId("pagina-tab-0")).toContainText("plan");
  await expect.poll(() => planAfbeeldingGeladen(page)).toBe(1200);
  await verwachtOngeplaatst(page, ongeplaatst);

  // 2. A1 uit "Te plaatsen" naar het plan slepen: het label staat op het plan, de bevinding verdwijnt.
  const canvas = page.getByTestId("plan-canvas");
  await expect(planSymbolen(page)).toHaveCount(0);
  await page.getByTestId("te-plaatsen-A1").dragTo(canvas);
  await expect(planLabel(page, "A1")).toHaveCount(1);
  await expect(page.getByTestId("te-plaatsen-A1")).toHaveCount(0);
  await expect(page.getByTestId("te-plaatsen-A2")).toHaveCount(1);
  await verwachtOngeplaatst(page, ongeplaatst - 1);

  // 3. Ctrl+Z haalt de plaatsing weg: A1 staat weer in "Te plaatsen". Ctrl+Y zet haar terug.
  // (De ongedaan-geschiedenis overleeft een herlading niet, dus dit gebeurt vóór het herladen.)
  await page.keyboard.press("Control+z");
  await expect(planLabel(page, "A1")).toHaveCount(0);
  await expect(page.getByTestId("te-plaatsen-A1")).toBeVisible();
  await verwachtOngeplaatst(page, ongeplaatst);
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



test("zeven punten doorplaatsen houdt het paneel en plananker stabiel", async ({ page, request }) => {
  test.setTimeout(120_000);
  const projectId = await maakProjectMetContactdozen(page, `${naam} doorplaatsen`, 7);
  await page.getByTestId("tab-situatieschema").click();
  await voegPlanToe(page, PLAN_PNG, { leeg: true });
  await planAfbeeldingGeladen(page);
  // The circuit filter is an existing work context before counting the placement route.
  await page.getByTestId("te-plaatsen-kring").click();
  await page.getByRole("option", { name: "Kring A", exact: true }).click();
  // Start with a closed pane: open, enable mode, choose first, seven placements = ten clicks.
  const toggle = page.getByTestId("werkruimte-onderdelen");
  if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
  await toggle.click();
  await page.getByTestId("te-plaatsen-doorgaan").click();
  const afbeelding = page.getByTestId("plan-afbeelding");
  const voor = (await afbeelding.boundingBox())!;
  await page.getByTestId("te-plaatsen-A1").click();
  const canvas = page.getByTestId("plan-canvas");
  for (let i = 0; i < 7; i++) {
    await canvas.click({ position: { x: 90 + 36 * i, y: 130 } });
    await expect(planSymbolen(page)).toHaveCount(i + 1);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const na = (await afbeelding.boundingBox())!;
    expect(Math.abs(na.x - voor.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(na.y - voor.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(na.width - voor.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(na.height - voor.height)).toBeLessThanOrEqual(1);
  }
  await canvas.click({ position: { x: 170, y: 210 } });
  await expect(planSymbolen(page)).toHaveCount(7);
  await wachtOpPlaatsingen(request, projectId, 7);
  await page.keyboard.press("Control+z");
  await expect(planSymbolen(page)).toHaveCount(6);
  // Undo returns the point to the list without restarting the queue.
  await canvas.click({ position: { x: 210, y: 210 } });
  await expect(planSymbolen(page)).toHaveCount(6);
});

test("zoeken, kringfilter en Escape stoppen de plaatskeuze", async ({ page }) => {
  test.setTimeout(120_000);
  await maakProjectMetContactdozen(page, `${naam} filters`);
  await page.getByTestId("tab-situatieschema").click();
  await voegPlanToe(page, PLAN_PNG, { leeg: true });
  const zoek = page.getByTestId("te-plaatsen-zoeken");
  await zoek.fill("A2");
  await expect(page.getByTestId("te-plaatsen-A1")).toHaveCount(0);
  await expect(page.getByTestId("te-plaatsen-A2")).toBeVisible();
  await page.getByTestId("te-plaatsen-A2").click();
  await page.getByTestId("te-plaatsen-kring").click();
  await page.getByRole("option", { name: "Verdeelborden", exact: true }).click();
  await page.getByTestId("plan-canvas").click({ position: { x: 180, y: 180 } });
  await expect(planSymbolen(page)).toHaveCount(0);
  await page.getByTestId("te-plaatsen-kring").click();
  await page.getByRole("option", { name: "Kring A", exact: true }).click();
  await page.getByTestId("te-plaatsen-A2").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("plan-canvas").click({ position: { x: 180, y: 180 } });
  await expect(planSymbolen(page)).toHaveCount(0);
});


test("pagina wisselen stopt de keuze; smalle schermen behouden de paneelroute", async ({ page }) => {
  test.setTimeout(120_000);
  await maakProjectMetContactdozen(page, `${naam} pagina mobiel`);
  await page.getByTestId("tab-situatieschema").click();
  await voegPlanToe(page, PLAN_PNG, { leeg: true });
  await voegPlanToe(page, PLAN_PNG);
  await page.getByTestId("te-plaatsen-A1").click();
  await page.getByTestId("pagina-tab-0").click();
  await page.getByTestId("plan-canvas").click({ position: { x: 170, y: 170 } });
  await expect(planSymbolen(page)).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.getByTestId("werkruimte-onderdelen");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.getByTestId("te-plaatsen-A1").click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("plan-canvas").click({ position: { x: 170, y: 170 } });
  await expect(planSymbolen(page)).toHaveCount(1);
});


test("alleen-lezen worden stopt een gekozen punt en blokkeert doorplaatsen", async ({ page, request }) => {
  test.setTimeout(120_000);
  await maakProjectMetContactdozen(page, `${naam} alleen lezen`);
  await page.getByTestId("tab-situatieschema").click();
  await voegPlanToe(page, PLAN_PNG, { leeg: true });
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await page.getByTestId("te-plaatsen-doorgaan").click();
  await page.getByTestId("te-plaatsen-A1").click();
  const mij = (await (await request.get("/api/mij")).json()) as Mij;
  const dag = 24 * 3600 * 1000;
  try {
    await zetProefEinde(mij.actieveOrganisatieId!, new Date(Date.now() - dag));
    const sessie = page.waitForResponse(r => r.url().endsWith("/api/mij") && r.request().method() === "GET");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect((await sessie).ok()).toBe(true);
    await expect(page.getByTestId("abonnement-banner-alleen-lezen")).toBeVisible();
    await expect(page.getByTestId("te-plaatsen-A1")).toBeDisabled();
    await expect(page.getByTestId("te-plaatsen-doorgaan")).toBeDisabled();
    await page.getByTestId("plan-canvas").click({ position: { x: 170, y: 170 } });
    await expect(planSymbolen(page)).toHaveCount(0);
  } finally {
    await zetProefEinde(mij.actieveOrganisatieId!, new Date(Date.now() + 20 * dag));
  }
});

test("mislukte opslag houdt lokale plaatsing en lokale status tot automatische herpoging", async ({ page, request }) => {
  test.setTimeout(120_000);
  const projectId = await maakProjectMetContactdozen(page, `${naam} opslagfout`);
  await page.getByTestId("tab-situatieschema").click();
  await voegPlanToe(page, PLAN_PNG, { leeg: true });
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  const url = `**/api/projecten/${projectId}`;
  await page.route(url, async route => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 500, json: { statusMessage: "Opslaan mislukt" } });
    else await route.continue();
  });
  await page.getByTestId("te-plaatsen-A1").click();
  await page.getByTestId("plan-canvas").click({ position: { x: 170, y: 170 } });
  await expect(planSymbolen(page)).toHaveCount(1);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Niet opgeslagen: lokaal bewaard", { timeout: 15_000 });
  expect((await haalProject(request, projectId)).document.situatie.paginas[0]!.plaatsingen).toHaveLength(0);
  await page.unroute(url);
  // Recoverable 5xx failures retry after ten seconds; the explicit error button belongs to terminal failures.
  await expect.poll(async () => (await haalProject(request, projectId)).document.situatie.paginas[0]!.plaatsingen.length,
    { timeout: 15_000 }).toBe(1);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
});

test("twee uitsneden uit één PDF, rotatie, bronbehoud en samen undo", async ({ page, request }) => {
  const id = await maakProjectMetContactdozen(page, `${naam} uitsneden`);
  await page.getByTestId("tab-situatieschema").click();
  await page.getByTestId("plan-toevoegen-leeg").click();
  const dialoog = page.getByRole("dialog");
  await dialoog.getByTestId("plan-bestand").setInputFiles(PLAN_PDF);
  await dialoog.getByTestId("pdf-pagina-1").click();
  await dialoog.getByRole("button", { name: "Nog een uitsnede" }).click();
  const crops = dialoog.getByTestId("plan-uitsnede");
  await expect(crops).toHaveCount(2);
  await crops.nth(0).getByLabel("Naam van de verdieping").fill("Gelijkvloers");
  await crops.nth(0).getByLabel("Hoogte (%)").fill("45");
  await crops.nth(1).getByLabel("Naam van de verdieping").fill("Verdieping 1");
  await crops.nth(1).getByLabel("Boven (%)").fill("50");
  await crops.nth(1).getByLabel("Hoogte (%)").fill("45");
  await crops.nth(1).getByRole("button", { name: /90° draaien/ }).click();
  await dialoog.getByTestId("plan-toevoegen-bevestig").click();
  await expect(dialoog).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await haalProject(request, id)).document.situatie.paginas.length).toBe(2);
  const paginas = (await haalProject(request, id)).document.situatie.paginas as (Pagina & { achtergrond: { bronUitsnede: { rotatie: number }; schaal?: unknown } })[];
  expect(paginas.map(p => p.titel)).toEqual(["Gelijkvloers", "Verdieping 1"]);
  expect(paginas[0]!.achtergrond.origineelBestandId).toBe(paginas[1]!.achtergrond.origineelBestandId);
  expect(paginas[1]!.achtergrond.bronUitsnede.rotatie).toBe(90);
  expect(paginas.every(p => p.achtergrond.schaal === undefined)).toBe(true);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await haalProject(request, id)).document.situatie.paginas.length).toBe(0);
});

test("referentieblad importeert zonder export of definitieve plaatsing", async ({ page, request }) => {
  const id = await maakProjectMetContactdozen(page, `${naam} referentie`);
  await page.getByTestId("tab-situatieschema").click();
  await page.getByTestId("plan-toevoegen-leeg").click();
  const dialoog = page.getByRole("dialog");
  await dialoog.getByTestId("plan-bestand").setInputFiles(PLAN_PNG);
  await dialoog.getByLabel("Referentieblad, niet exporteren").check();
  await dialoog.getByTestId("plan-toevoegen-bevestig").click();
  await expect(dialoog).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await haalProject(request, id)).document.situatie.paginas.length).toBe(1);
  const project = await haalProject(request, id);
  expect((project.document.situatie.paginas[0] as Pagina & { referentie: boolean }).referentie).toBe(true);
  expect(project.document.situatie.paginas[0]!.plaatsingen).toEqual([]);
  await expect(page.getByTestId("plan-opschonen")).toHaveCount(0);
  await expect(page.getByTestId("plan-werkbalk")).toHaveCount(0);
  await page.getByTestId("plan-canvas").click({ position: { x: 180, y: 180 } });
  await page.keyboard.press("r");
  await page.keyboard.press("Delete");
  expect((await haalProject(request, id)).document).toEqual(project.document);

});
