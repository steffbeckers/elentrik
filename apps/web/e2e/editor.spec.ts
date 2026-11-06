import { expect, test, type Page } from "@playwright/test";
import { gebruikTestgebruiker } from "./hulp/inloggen";
import { selecteerSchemaNode } from "./hulp/schema-selectie";

// Eén ingelogde testgebruiker met een eigen organisatie voor dit hele bestand.
gebruikTestgebruiker(test, { voorvoegsel: "editor" });

// Elke run gebruikt een unieke naam, zodat de projecten van deze run herkenbaar zijn; `ruimOp` wist ze na afloop.
const naam = `Test Editor ${Date.now()}`;
const xssLabel = "<img src=x onerror=alert(1)>";

type Knoop = { id: string; type: string; label?: string; kabeltype?: string; kinderen: string[] };
type Project = { document: { nodes: Record<string, Knoop> } };

/** De tekstlabels in de SVG van het schema (puntlabels als "A1", kringlabels, leidingen). */
function schemaTekst(page: Page, tekst: string) {
  const letterlijk = tekst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByTestId("schema-canvas").locator("svg text", { hasText: new RegExp(`^${letterlijk}$`) });
}

/** Brengt de hele strook in beeld; het schema groeit omhoog en kan anders buiten het venster raken. */
async function pasTeMaken(page: Page) {
  await page.getByRole("button", { name: "Passend maken" }).click();
}

/**
 * Selecteert de node bij de gegeven schematekst. De teksten staan in de SVG naast de symbolen,
 * niet erin: het dichtstbijzijnde symbool is dat van de node. Een leiding is een lijn zonder
 * breedte, dus Playwright vindt die niet "zichtbaar"; de klik op het midden raakt wel de lijn.
 */
async function selecteerBij(page: Page, tekst: string) {
  await pasTeMaken(page);
  const canvas = page.getByTestId("schema-canvas");
  const doel = schemaTekst(page, tekst);
  await expect(doel).toHaveCount(1);
  const midden = (doos: { x: number; y: number; width: number; height: number }) => ({
    x: doos.x + doos.width / 2,
    y: doos.y + doos.height / 2,
  });
  const tekstMidden = midden((await doel.boundingBox())!);
  let beste = { afstand: Infinity, id: "" };
  for (const symbool of await canvas.locator("[data-node-id]").all()) {
    const doos = await symbool.boundingBox();
    if (!doos) continue;
    const m = midden(doos);
    const afstand = Math.hypot(m.x - tekstMidden.x, m.y - tekstMidden.y);
    if (afstand < beste.afstand) beste = { afstand, id: (await symbool.getAttribute("data-node-id"))! };
  }
  await selecteerSchemaNode(page, beste.id);
  return beste.id;
}

/** Selecteert een node via een werkelijk aanklikbaar symboolsegment. */
async function selecteerOpId(page: Page, id: string) {
  await pasTeMaken(page);
  await selecteerSchemaNode(page, id);
}

test("bouw een kring, herstel, verwijder, wijzig een label en herlaad", async ({ page, request }) => {
  const dialogen: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogen.push(dialog.message());
    await dialog.dismiss();
  });

  // 1. Een nieuw project aanmaken en openen: de rail heeft een +.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nieuw project" }).click();
  const nieuw = page.getByRole("dialog");
  await nieuw.getByLabel("Naam").fill(naam);
  await nieuw.getByRole("button", { name: "Aanmaken" }).click();
  const rij = page.getByRole("row").filter({ hasText: naam });
  await expect(rij).toHaveCount(1);
  await rij.getByRole("link", { name: "Openen" }).click();
  await expect(page).toHaveURL(/\/projecten\/[0-9a-f-]+$/);
  const projectId = new URL(page.url()).pathname.split("/").pop()!;

  const canvas = page.getByTestId("schema-canvas");
  const railPlus = canvas.locator('[data-testid^="plus-rail-einde-"]');
  const kringPlus = canvas.locator('[data-testid^="plus-kring-einde-"]');
  await expect(railPlus).toHaveCount(1);
  await expect(kringPlus).toHaveCount(0);

  // 2. De railknop voegt een kring met het gekozen onderdeel toe: automaat, leiding en A1.
  await pasTeMaken(page);
  await railPlus.click();
  await expect(schemaTekst(page, "B16 2P")).toHaveCount(1);
  await expect(schemaTekst(page, "XVB 3G2,5")).toHaveCount(1);
  await expect(kringPlus).toHaveCount(1);

  // 3. A1 bestaat al en is geselecteerd: C voegt meteen A2 toe, zonder extra klik, en de
  // invoegbalk blijft dicht. De plusknop geeft daarna A3.
  await expect(schemaTekst(page, "A1")).toHaveCount(1);
  await page.keyboard.press("c");
  await expect(page.getByTestId("onderdeel-contactdoos")).toHaveAttribute("aria-pressed", "true");
  await expect(schemaTekst(page, "A2")).toHaveCount(1);
  await expect(page.locator("#schema-invoegen")).toHaveCount(0);
  await pasTeMaken(page);
  await kringPlus.click();
  await expect(schemaTekst(page, "A3")).toHaveCount(1);

  // 4. Ctrl+Z haalt A3 weg; A2 staat er nog.
  await page.keyboard.press("Control+z");
  await expect(schemaTekst(page, "A3")).toHaveCount(0);
  await expect(schemaTekst(page, "A2")).toHaveCount(1);

  // 5. De contactdoos A1 verwijderen: er blijft één contactdoos over, nu met label A1.
  await selecteerBij(page, "A1");
  await page.keyboard.press("Delete");
  await expect(schemaTekst(page, "A2")).toHaveCount(0);
  await expect(schemaTekst(page, "A1")).toHaveCount(1);
  await expect(canvas.locator("svg text", { hasText: /^A\d+$/ })).toHaveCount(1);

  // 6. Tekst van de leiding wordt platte tekst, nooit HTML. Het algemene label bereikt de SVG niet;
  // het kabeltype wel (via `v-html`), dus daar is de escaping van `render` de enige bescherming.
  const leidingId = await selecteerBij(page, "XVB 3G2,5");
  await page.getByTestId("werkruimte-eigenschappen").click();
  const labelVeld = page.getByTestId("veld-label");
  await labelVeld.fill(xssLabel);
  await labelVeld.blur();
  await expect(labelVeld).toHaveValue(xssLabel);
  const kabeltypeVeld = page.getByTestId("veld-kabeltype");
  await kabeltypeVeld.fill(xssLabel);
  await kabeltypeVeld.blur();
  await expect(kabeltypeVeld).toHaveValue(xssLabel);
  // Het kabeltype staat letterlijk als tekst in de SVG, nooit als element.
  await expect(canvas.locator("svg text", { hasText: xssLabel })).toHaveCount(1);
  await expect(canvas.locator("img")).toHaveCount(0);
  await expect(page.locator("img[src=x]")).toHaveCount(0);

  // 7. Wacht tot alles is opgeslagen en herlaad: de toestand van stap 5, het leidinglabel en het kabeltype staan er nog.
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await expect
    .poll(async () => {
      const antwoord = await request.get(`/api/projecten/${projectId}`);
      const { document } = (await antwoord.json()) as Project;
      const leiding = Object.values(document.nodes).find((n) => n.type === "leiding");
      return leiding && { id: leiding.id, label: leiding.label, kabeltype: leiding.kabeltype };
    })
    .toEqual({ id: leidingId, label: xssLabel, kabeltype: xssLabel });

  // De keten is verbonden: de leiding draagt de enige contactdoos.
  const { document } = (await (await request.get(`/api/projecten/${projectId}`)).json()) as Project;
  const leiding = Object.values(document.nodes).find((n) => n.type === "leiding")!;
  const contactdozen = Object.values(document.nodes).filter((n) => n.type === "contactdoos");
  expect(contactdozen).toHaveLength(1);
  expect(leiding.kinderen).toEqual([contactdozen[0]!.id]);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(canvas.locator("svg").first()).toBeVisible();
  await expect(schemaTekst(page, "A1")).toHaveCount(1);
  await expect(schemaTekst(page, "A2")).toHaveCount(0);
  await expect(canvas.locator("svg text", { hasText: /^A\d+$/ })).toHaveCount(1);
  await expect(canvas.locator("svg text", { hasText: xssLabel })).toHaveCount(1);
  await expect(canvas.locator("img")).toHaveCount(0);
  await expect(page.locator("img[src=x]")).toHaveCount(0);

  await selecteerOpId(page, leidingId);
  await expect(page.getByTestId("veld-label")).toHaveValue(xssLabel);
  await expect(page.getByTestId("veld-kabeltype")).toHaveValue(xssLabel);

  expect(dialogen).toEqual([]);
});


test("ongeldige nominale stroom blijft zichtbaar na blur en selectie verlaten", async ({ page, request }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Nieuw project" }).click();
  const nieuw = page.getByRole("dialog");
  const projectNaam = `${naam} ongeldige invoer`;
  await nieuw.getByLabel("Naam").fill(projectNaam);
  await nieuw.getByRole("button", { name: "Aanmaken" }).click();
  await page.getByRole("row").filter({ hasText: projectNaam }).getByRole("link", { name: "Openen" }).click();
  await expect(page).toHaveURL(/\/projecten\/[0-9a-f-]+$/);
  const projectId = new URL(page.url()).pathname.split("/").pop()!;
  await pasTeMaken(page);
  await page.getByTestId("schema-canvas").locator('[data-testid^="plus-rail-einde-"]').click();
  const automaatId = await selecteerBij(page, "B16 2P");
  await page.getByTestId("werkruimte-eigenschappen").click();
  const stroom = page.getByTestId("veld-nominaal_A");
  await expect(stroom).toHaveValue("16");
  await expect(page.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
  await stroom.fill("-1");
  await stroom.blur();
  await expect(stroom).toHaveValue("-1");
  await expect(page.getByText("Deze waarde is niet opgeslagen.", { exact: false })).toBeVisible();
  await page.getByTestId("gebruiker-menu").click();
  await page.getByTestId("taal-menu").click();
  await page.getByRole("menuitemcheckbox", { name: "Français" }).click();
  await expect(stroom).toHaveValue("-1");
  await expect(page.getByText("Cette valeur n’est pas enregistrée.", { exact: false })).toBeVisible();
  await page.getByTestId("gebruiker-menu").click();
  await page.getByTestId("taal-menu").click();
  await page.getByRole("menuitemcheckbox", { name: "Nederlands" }).click();
  const antwoord = await request.get(`/api/projecten/${projectId}`);
  expect(antwoord.ok()).toBe(true);
  const doc = (await antwoord.json()).document;
  // The saved valid value survives invalid drafts, blur and a language round-trip.
  expect(doc.nodes[automaatId].nominaal_A).toBe(16);
  await selecteerBij(page, "A1");
  const melding = page.getByTestId("verlaten-concept");
  await expect(melding).toContainText("-1");
  await expect(page.getByTestId("veld-label")).toHaveValue("");
  await melding.getByRole("button", { name: "Terug naar invoer" }).click();
  await expect(stroom).toHaveValue("-1");
  await stroom.focus();
  await page.keyboard.press("Escape");
  await expect(stroom).toHaveValue("16");
  await expect(page.getByText("Deze waarde is niet opgeslagen.", { exact: false })).toHaveCount(0);
});

test("? toont de sneltoetsen en Ctrl+D dupliceert een kring met de volgende vrije letter", async ({ page, request }) => {
  const antwoord = await request.post("/api/projecten", {
    data: { naam: `${naam} sneltoetsen`, klantnaam: "Janssens", stroomtype: "2x230V" },
  });
  const { id } = (await antwoord.json()) as { id: string };
  await page.goto(`/projecten/${id}`);
  await page.waitForLoadState("networkidle");

  // Twee kringen: A en B.
  const canvas = page.getByTestId("schema-canvas");
  const railPlus = canvas.locator('[data-testid^="plus-rail-einde-"]');
  for (const kring of ["A1", "B1"]) {
    await pasTeMaken(page);
    await railPlus.click();
    await expect(schemaTekst(page, kring)).toHaveCount(1);
  }

  // ? opent het overzicht; de knop Toetsenbordhulp opent hetzelfde.
  await canvas.focus();
  await page.keyboard.press("?");
  const dialoog = page.getByRole("dialog", { name: "Sneltoetsen" });
  await expect(dialoog).toBeVisible();
  await expect(dialoog.getByText("De geselecteerde kring dupliceren met de eerste vrije letter")).toBeVisible();
  // In een open dialoog doen ? en Ctrl+D niets.
  await page.keyboard.press("Control+d");
  await expect(schemaTekst(page, "C1")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialoog).toHaveCount(0);
  await page.getByRole("button", { name: "Toetsenbordhulp" }).click();
  await expect(dialoog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialoog).toHaveCount(0);

  // Tijdens het typen in een tekstveld gaan ? en Ctrl+D niet af.
  await selecteerBij(page, "A1");
  await page.getByTestId("werkruimte-eigenschappen").click();
  const label = page.getByTestId("veld-label");
  await label.fill("Keuken");
  await label.press("?");
  await label.press("Control+d");
  await expect(label).toHaveValue("Keuken?");
  await expect(dialoog).toHaveCount(0);
  await expect(schemaTekst(page, "C1")).toHaveCount(0);
  await label.blur();

  // Ctrl+D op het canvas: kring A wordt gedupliceerd als C, de eerste vrije letter. A en B blijven.
  await selecteerBij(page, "A1");
  await page.keyboard.press("Control+d");
  await expect(page.getByText("Kring A gedupliceerd als kring C.", { exact: true })).toBeVisible();
  await expect(schemaTekst(page, "C1")).toHaveCount(1);
  await expect(schemaTekst(page, "A1")).toHaveCount(1);
  await expect(schemaTekst(page, "B1")).toHaveCount(1);
  // Eén undo-stap.
  await page.keyboard.press("Control+z");
  await expect(schemaTekst(page, "C1")).toHaveCount(0);

  // Zonder kring in de selectie: niets, met een korte melding waarom.
  await canvas.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+d");
  await expect(page.getByText("Selecteer eerst een onderdeel van een kring om die kring te dupliceren.", { exact: true })).toBeVisible();
});
