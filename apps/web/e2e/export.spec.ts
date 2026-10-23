import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { zetBedrijfBasislijn } from "./hulp/bedrijfsgegevens";
import { gebruikTestgebruiker } from "./hulp/inloggen";
import { leesPdf } from "./hulp/pdf";

// Eén ingelogde eigenaar met een eigen organisatie, en dus eigen bedrijfsgegevens, voor dit hele
// bestand.
gebruikTestgebruiker(test, { voorvoegsel: "export" });

// Elke run gebruikt een unieke naam, zodat de opruiming enkel de projecten van deze run raakt.
const naam = `Test Exportdialoog ${Date.now()}`;

type Samenvatting = { id: string; naam: string };

test.afterAll(async ({ request }) => {
  const antwoord = await request.get("/api/projecten");
  const projecten = (await antwoord.json()) as Samenvatting[];
  for (const project of projecten.filter((p) => p.naam.startsWith(naam))) {
    await request.delete(`/api/projecten/${project.id}`);
  }
});

async function nieuwProject(request: APIRequestContext, achtervoegsel: string): Promise<string> {
  const antwoord = await request.post("/api/projecten", {
    data: { naam: `${naam} ${achtervoegsel}`, klantnaam: "", stroomtype: "2x230V" },
  });
  expect(antwoord.status()).toBe(201);
  return ((await antwoord.json()) as { id: string }).id;
}

async function openMetKring(page: Page, id: string): Promise<void> {
  await page.goto(`/projecten/${id}`);
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
}

test("exporteren bewaart eerst, downloadt de PDF en werkt de lijst bij", async ({ page, request }) => {
  const id = await nieuwProject(request, "gewoon");
  await openMetKring(page, id);
  // Meteen exporteren, zonder de vertraging van de autosave af te wachten.
  await page.getByTestId("exporteren").click();

  const dialoog = page.getByRole("dialog");
  await expect(dialoog.getByTestId("export-versie")).toHaveValue("V1");
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");
  await expect(dialoog.getByTestId("export-lijst")).toContainText("Nog geen exports.");
  await expect(dialoog.getByTestId("export-bijlage")).toBeEnabled();

  const download = page.waitForEvent("download");
  await dialoog.getByTestId("export-start").click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

  await expect(dialoog.getByTestId("export-rij-V1")).toContainText("geen fouten");
  await expect(dialoog.getByTestId("export-versie")).toHaveValue("V2");
  await expect(dialoog.getByTestId("export-rij-V1").getByRole("link", { name: "Downloaden" })).toHaveAttribute(
    "href",
    /^\/api\/bestanden\/[0-9a-f-]+$/,
  );
});

test("onopgeloste fouten: bijlage verplicht en eerst een bevestiging", async ({ page, request }) => {
  const id = await nieuwProject(request, "fouten");
  await openMetKring(page, id);
  // Een zevende contactdoos die er vijf telt: elf op één kring is een fout.
  await page.getByTestId("schema-canvas").locator('[data-testid^="plus-kring-einde-"]').click();
  const aantal = page.getByTestId("veld-aantal");
  await aantal.fill("5");
  await aantal.blur();
  await expect(page.getByTestId("bevindingenteller")).toHaveAttribute("title", /^1 fout/);

  await page.getByTestId("exporteren").click();
  const dialoog = page.getByRole("dialog");
  const bijlage = dialoog.getByTestId("export-bijlage");
  await expect(bijlage).toBeChecked();
  await expect(bijlage).toBeDisabled();
  await expect(dialoog).toContainText("Er is 1 onopgeloste fout; de bijlage komt verplicht mee.");

  await dialoog.getByTestId("export-start").click();
  const bevestiging = dialoog.getByTestId("export-bevestiging");
  await expect(bevestiging).toContainText(
    "Er is 1 onopgeloste fout. De PDF vermeldt ze in de bijlage. Toch exporteren?",
  );
  await bevestiging.getByRole("button", { name: "Annuleren" }).click();
  await expect(bevestiging).toHaveCount(0);

  await dialoog.getByTestId("export-start").click();
  const download = page.waitForEvent("download");
  await dialoog.getByRole("button", { name: "Toch exporteren" }).click();
  await download;
  await expect(dialoog.getByTestId("export-rij-V1")).toContainText("1 fout");
});

test("exporteren kan niet als opslaan mislukt", async ({ page, request }) => {
  const id = await nieuwProject(request, "offline");
  await page.goto(`/projecten/${id}`);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");
  await page.route(`**/api/projecten/${id}`, (route) =>
    route.request().method() === "PUT" ? route.fulfill({ status: 503 }) : route.fallback(),
  );
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  await page.getByTestId("exporteren").click();

  const dialoog = page.getByRole("dialog");
  await expect(dialoog.getByTestId("export-geblokkeerd")).toContainText("Exporteren kan nu niet");
  await expect(dialoog.getByTestId("export-start")).toBeDisabled();
});

test("een ander venster bewaarde intussen: de export geeft het conflictscherm en maakt geen PDF", async ({
  page,
  request,
}) => {
  const id = await nieuwProject(request, "conflict");
  await page.goto(`/projecten/${id}`);
  // Ruime wachttijd: als eerste test van een run compileert de dev-server de editor nog.
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 30_000 });

  // Een ander "venster" bewaart een nieuwe versie; dit venster toont nog de oude en heeft zelf niets gewijzigd.
  const project = (await (await request.get(`/api/projecten/${id}`)).json()) as {
    versie: number;
    naam: string;
    document: unknown;
  };
  const put = await request.put(`/api/projecten/${id}`, {
    headers: { "If-Match": String(project.versie) },
    data: { naam: `${project.naam} elders`, document: project.document },
  });
  expect(put.ok(), await put.text()).toBe(true);

  await page.getByTestId("exporteren").click();
  const dialoog = page.getByRole("dialog");
  await expect(dialoog.getByTestId("export-hint-zonder-plan")).toHaveText(
    "Situatiepagina's zonder plan worden in de bijlage vermeld.",
  );
  await expect(dialoog.getByTestId("export-versie")).toHaveValue("V1");
  const antwoord = page.waitForResponse(
    (r) => r.url().endsWith(`/api/projecten/${id}/exports`) && r.request().method() === "POST",
  );
  await dialoog.getByTestId("export-start").click();
  expect((await antwoord).status()).toBe(409);
  expect((await antwoord).request().headers()["if-match"]).toBe(String(project.versie));

  // De exportdialoog sluit en het bestaande conflictscherm neemt het over.
  const conflict = page.getByRole("dialog");
  await expect(conflict).toContainText("Conflict");
  await expect(conflict.getByRole("button", { name: "Serverversie laden" })).toBeVisible();
  await expect(conflict.getByRole("button", { name: "Mijn versie als kopie bewaren" })).toBeVisible();
  await expect(page.getByTestId("export-start")).toHaveCount(0);
  const lijst = (await (await request.get(`/api/projecten/${id}/exports`)).json()) as unknown[];
  expect(lijst).toEqual([]);

  // Serverversie laden: daarna toont dit venster de nieuwe versie en lukt de export.
  await conflict.getByRole("button", { name: "Serverversie laden" }).click();
  await expect(conflict).toHaveCount(0);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");
  await expect(page.getByTestId("projectnaam")).toContainText("elders");
  await page.getByTestId("exporteren").click();
  const download = page.waitForEvent("download");
  await page.getByRole("dialog").getByTestId("export-start").click();
  await download;
  await expect(page.getByRole("dialog").getByTestId("export-rij-V1")).toBeVisible();
});

test("kan de lijst van eerdere exports niet laden, dan geen voorgesteld versielabel", async ({ page, request }) => {
  const id = await nieuwProject(request, "lijstfout");
  await page.route(`**/api/projecten/${id}/exports`, (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 500 }) : route.fallback(),
  );
  await page.goto(`/projecten/${id}`);
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 30_000 });
  await page.getByTestId("exporteren").click();

  const dialoog = page.getByRole("dialog");
  await expect(dialoog.getByTestId("export-lijst")).toContainText("De eerdere exports konden niet geladen worden.");
  await expect(dialoog.getByTestId("export-versie")).toHaveValue("");
  await expect(dialoog.getByTestId("export-start")).toBeDisabled();
  await dialoog.getByTestId("export-versie").fill("V7");
  await expect(dialoog.getByTestId("export-start")).toBeEnabled();
});

// ---------------------------------------------------------------------------------------------
// De echte export door Gotenberg: bedrijfsgegevens, situatieplan, werfadres, download en pagina's.
// ---------------------------------------------------------------------------------------------

const PLAN_PNG = fileURLToPath(new URL("./fixtures/plan.png", import.meta.url));

type Project = { versie: number; document: { nodes: Record<string, { type: string; doorsnede_mm2?: number }> } };

test.describe("echte pdf-export", () => {
  test.beforeEach(async ({ request }) => {
    await zetBedrijfBasislijn(request);
  });

  /** De soort van elke pagina, uit de paginatitel in de cartouche (vlak voor "Datum:"). */
  function soorten(paginaTeksten: string[]): string[] {
    return paginaTeksten.map(
      (tekst) =>
        /(Eendraadschema|Situatieschema|Kringenlijst|Bijlage)(?: — [^]*?)? +Datum:/.exec(tekst)?.[1] ?? "onbekend",
    );
  }

  test("van bedrijfsgegevens tot een gedownloade pdf met de verwachte pagina's", async ({ page, request }) => {
    test.setTimeout(180_000);
    page.on("dialog", (dialog) => void dialog.dismiss());

    // 1. Bedrijfsgegevens en een logo.
    await page.goto("/instellingen");
    await expect(page.getByTestId("bedrijf-bewaar")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("bedrijf-naam").fill("Elektro E2E");
    await page.getByTestId("bedrijf-bewaar").click();
    await expect(page.getByText("Bedrijfsgegevens bewaard.", { exact: true })).toBeVisible();
    await page.getByTestId("bedrijf-logo").setInputFiles(PLAN_PNG);
    await expect(page.getByText("Logo opgeladen.", { exact: true })).toBeVisible();

    // 2. Een project met een kring, een situatieplan en A1 daarop geplaatst.
    const id = await nieuwProject(request, "pdf");
    await openMetKring(page, id);
    await page.getByTestId("tab-situatieschema").click();
    await page.getByTestId("plan-toevoegen-leeg").click();
    const planDialoog = page.getByRole("dialog");
    await planDialoog.getByTestId("plan-bestand").setInputFiles(PLAN_PNG);
    await planDialoog.getByTestId("plan-toevoegen-bevestig").click();
    await expect(planDialoog).toHaveCount(0, { timeout: 30_000 });
    await page.getByTestId("te-plaatsen-A1").click();
    await page.getByTestId("plan-canvas").click({ position: { x: 300, y: 200 } });
    await expect(page.getByTestId("te-plaatsen-A1")).toHaveCount(0);

    // 3. Het werfadres.
    await page.getByTestId("projectnaam").click();
    const gegevens = page.getByRole("dialog");
    await gegevens.getByTestId("werf-straat").fill("Dorpsstraat");
    await gegevens.getByTestId("werf-nummer").fill("3");
    await gegevens.getByTestId("werf-postcode").fill("9000");
    await gegevens.getByTestId("werf-gemeente").fill("Gent");
    await gegevens.getByRole("button", { name: "Bewaren" }).click();
    await expect(gegevens).toHaveCount(0);

    // 4. Exporteren met de standaardwaarden (A4, alle onderdelen); de bijlage staat aan en meegekomen info vult ze.
    await page.getByTestId("exporteren").click();
    const dialoog = page.getByRole("dialog");
    await expect(dialoog.getByTestId("export-versie")).toHaveValue("V1");
    await expect(dialoog.getByTestId("export-bijlage")).toBeChecked();
    await expect(dialoog.getByTestId("export-bijlage")).toBeEnabled();
    const download = page.waitForEvent("download");
    await dialoog.getByTestId("export-start").click();
    const bestand = await (await download).createReadStream();
    const delen: Buffer[] = [];
    for await (const deel of bestand) delen.push(deel as Buffer);
    const bytes = new Uint8Array(Buffer.concat(delen));
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");

    // De PDF heeft: de eendraadschemapagina's, 1 situatiepagina (A1 staat op het plan), minstens 1
    // kringenlijstpagina en 1 bijlagepagina (A2 tot A6 staan niet op het plan: dat is info). Het aantal
    // eendraadschemapagina's volgt uit de PDF zelf (de pagina's met de titel Eendraadschema) en moet
    // voor dit kleine project 1 zijn: één kring met zes punten past op één liggende A4.
    const pdf = await leesPdf(bytes);
    const volgorde = soorten(pdf.paginaTeksten);
    const aantal = (soort: string) => volgorde.filter((v) => v === soort).length;
    expect(aantal("onbekend")).toBe(0);
    expect(aantal("Eendraadschema")).toBe(1);
    expect(aantal("Situatieschema")).toBe(1);
    expect(aantal("Kringenlijst")).toBeGreaterThanOrEqual(1);
    expect(aantal("Bijlage")).toBe(1);
    expect(pdf.aantalPaginas).toBe(aantal("Eendraadschema") + 1 + aantal("Kringenlijst") + 1);
    // De onderdelen staan in vaste volgorde en elke cartouche telt mee in "Pagina k / N".
    expect(volgorde).toEqual(["Eendraadschema", "Situatieschema", "Kringenlijst", "Bijlage"]);
    pdf.paginaTeksten.forEach((tekst, i) => expect(tekst).toContain(`Pagina ${i + 1} / ${pdf.aantalPaginas}`));
    // De bijlage vermeldt de info en de situatiepagina is niet overgeslagen. "Info (5)" hangt af van het
    // sjabloon "Kring stopcontacten" (6 contactdozen, A1 tot A6) waarvan enkel A1 op het plan staat.
    expect(pdf.paginaTeksten.at(-1)).toContain("Info (5)");
    expect(pdf.paginaTeksten.at(-1)).not.toContain("Overgeslagen");
    // Het logo staat in de cartouche van pagina 1 (het eendraadschema heeft zelf geen afbeelding): dat is
    // de enige afbeelding op die pagina. Het plan staat op de situatiepagina.
    expect(pdf.afbeeldingenPerPagina[0]).toBeGreaterThanOrEqual(1);
    expect(pdf.afbeeldingenPerPagina[volgorde.indexOf("Situatieschema")]).toBeGreaterThanOrEqual(2);
    // De cartouche toont de bedrijfsnaam en het werfadres.
    expect(pdf.paginaTeksten[0]).toContain("Elektro E2E");
    expect(pdf.paginaTeksten[0]).toContain("Dorpsstraat 3");
    await expect(dialoog.getByTestId("export-rij-V1")).toContainText("geen fouten");
    await expect(dialoog.getByTestId("export-versie")).toHaveValue("V2");

    // 5. Nog eens exporteren: V2 staat bovenaan.
    const tweede = page.waitForEvent("download");
    await dialoog.getByTestId("export-start").click();
    await tweede;
    const rijen = dialoog.locator('[data-testid^="export-rij-"]');
    await expect(rijen).toHaveCount(2);
    await expect(rijen.first()).toHaveAttribute("data-testid", "export-rij-V2");
    await page.keyboard.press("Escape");
    await expect(dialoog).toHaveCount(0);

    // 6. Een fout via de API: de leiding krijgt een doorsnede die te klein is voor haar automaat (20 A op 1,5 mm2).
    await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");
    const antwoord = await request.get(`/api/projecten/${id}`);
    const project = (await antwoord.json()) as Project;
    const document = structuredClone(project.document);
    const leiding = Object.values(document.nodes).find((node) => node.type === "leiding");
    expect(leiding).toBeDefined();
    leiding!.doorsnede_mm2 = 1.5;
    const put = await request.put(`/api/projecten/${id}`, {
      headers: { "If-Match": String(project.versie) },
      data: { document },
    });
    expect(put.ok(), await put.text()).toBe(true);

    await page.reload();
    await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen");
    const teller = (await page.getByTestId("bevindingenteller").getAttribute("title")) ?? "";
    const fouten = Number(/^(\d+) fout/.exec(teller)?.[1] ?? "0");
    expect(fouten, `bevindingenteller: ${teller}`).toBeGreaterThan(0);
    const zin = fouten === 1 ? "Er is 1 onopgeloste fout" : `Er zijn ${fouten} onopgeloste fouten`;

    await page.getByTestId("exporteren").click();
    const foutDialoog = page.getByRole("dialog");
    await expect(foutDialoog.getByTestId("export-versie")).toHaveValue("V3");
    const bijlage = foutDialoog.getByTestId("export-bijlage");
    await expect(bijlage).toBeChecked();
    await expect(bijlage).toBeDisabled();
    await expect(foutDialoog).toContainText(`${zin}; de bijlage komt verplicht mee.`);
    await foutDialoog.getByTestId("export-start").click();
    await expect(foutDialoog.getByTestId("export-bevestiging")).toContainText(
      `${zin}. De PDF vermeldt ze in de bijlage. Toch exporteren?`,
    );
    await foutDialoog.getByTestId("export-annuleren").click();
    await page.keyboard.press("Escape");
    await expect(foutDialoog).toHaveCount(0);

    // 7. Het tabblad Kringenlijst: A1 staat in de tabel en een klik selecteert A1 in de eigenschappen.
    await page.getByTestId("tab-kringenlijst").click();
    const rijA1 = page.getByTestId("kringenlijst-rij-A1");
    await expect(rijA1).toBeVisible();
    await rijA1.click();
    await expect(rijA1).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("eigenschappen-titel")).toContainText("A1");
  });
});
