import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  STANDAARD,
  voegToe,
  voegOnderdeelToe,
  type InstallatieDocument,
  type NodeInvoer,
} from "@elentrik/model";
import { gebruikTestgebruiker } from "./hulp/inloggen";

gebruikTestgebruiker(test, { voorvoegsel: "elektricien-workflow" });
type Project = { versie: number; document: InstallatieDocument };
async function haal(request: APIRequestContext, id: string): Promise<Project> {
  return (await (await request.get(`/api/projecten/${id}`)).json()) as Project;
}
async function seed(request: APIRequestContext) {
  const response = await request.post("/api/projecten", {
    data: {
      naam: `Workflow ${Date.now()}`,
      klantnaam: "Bron",
      stroomtype: "2x230V",
    },
  });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  const p = await haal(request, id);
  const bord = Object.values(p.document.nodes).find(
    (n) => n.type === "verdeelbord",
  )!.id;
  const hoofd = Object.values(p.document.nodes).find(
    (n) => n.type === "differentieel",
  )!.id;
  const f = voegToe(p.document, bord, {
    ...STANDAARD.differentieel,
    referentie: "F",
  } as NodeInvoer);
  const k = voegOnderdeelToe(
    f.doc,
    { soort: "rail-einde", nodeId: f.id },
    "contactdoos",
  );
  const saved = await request.put(`/api/projecten/${id}`, {
    headers: { "If-Match": String(p.versie) },
    data: { document: k.doc },
  });
  expect(saved.ok()).toBe(true);
  return { id, bord, hoofd, f: f.id, kring: k.ids[0]!, document: k.doc };
}
async function selecteer(page: Page, id: string) {
  await page.getByRole("button", { name: "Passend maken" }).click();
  await page
    .getByTestId("schema-canvas")
    .locator(`[data-node-id="${id}"]`)
    .click({ force: true });
}
function aantalDifferentielen(doc: InstallatieDocument) {
  return Object.values(doc.nodes).filter((n) => n.type === "differentieel")
    .length;
}

test("template requires a valid destination, reuses F and adds a new RCD only on explicit board insertion", async ({
  page,
  request,
}) => {
  const x = await seed(request);
  await page.goto(`/projecten/${x.id}`);
  await selecteer(page, x.hoofd);
  await page.getByRole("button", { name: "Wasmachine", exact: true }).click();
  await expect(page.getByTestId("bevestig-sjabloon")).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Annuleren", exact: true })
    .click();
  expect((await haal(request, x.id)).document).toEqual(x.document);
  await selecteer(page, x.f);
  await page.getByRole("button", { name: "Wasmachine", exact: true }).click();
  await expect(page.getByTestId("hergebruik-differentieel")).toContainText(
    "30 mA",
  );
  await page.getByTestId("bevestig-sjabloon").click();
  await expect
    .poll(
      async () =>
        Object.keys((await haal(request, x.id)).document.nodes).length,
    )
    .toBe(Object.keys(x.document.nodes).length + 3);
  expect(aantalDifferentielen((await haal(request, x.id)).document)).toBe(2);
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () =>
        Object.keys((await haal(request, x.id)).document.nodes).length,
    )
    .toBe(Object.keys(x.document.nodes).length);
  await selecteer(page, x.bord);
  await page.getByRole("button", { name: "Wasmachine", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Nieuwe differentieel (voorinstelling)" }),
  ).toBeVisible();
  await page.getByTestId("bevestig-sjabloon").click();
  await expect
    .poll(async () =>
      aantalDifferentielen((await haal(request, x.id)).document),
    )
    .toBe(3);
});

test("manual circuit J persists in schema, circuit list and after reload", async ({
  page,
  request,
}) => {
  const x = await seed(request);
  await page.goto(`/projecten/${x.id}`);
  await selecteer(page, x.kring);
  await page.getByTestId("werkruimte-eigenschappen").click();
  await page.getByTestId("veld-kringCode").fill("J");
  await page.getByTestId("veld-kringCode").blur();
  await expect
    .poll(async () => (await haal(request, x.id)).document.nodes[x.kring])
    .toMatchObject({ kringCode: "J" });
  await expect(
    page.getByTestId("schema-canvas").locator("svg text", { hasText: /^J1$/ }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByTestId("schema-canvas").locator("svg text", { hasText: /^J1$/ }),
  ).toHaveCount(1);
  await page.getByTestId("tab-kringenlijst").click();
  await expect(page.getByTestId("kringenlijst")).toContainText("J1");
});

test("light assembly adds separate lamps to selected circuit and undo removes the complete assembly", async ({
  page,
  request,
}) => {
  const x = await seed(request);
  await page.goto(`/projecten/${x.id}`);
  await selecteer(page, x.kring);
  await page.getByTestId("lichtschakeling-openen").click();
  await page.getByTestId("licht-schakeling").click();
  await page
    .getByRole("option", {
      name: "Twee wisselschakelaars + lichtpunt",
      exact: true,
    })
    .click();
  await page.getByTestId("licht-aantal").fill("2");
  await expect(page.getByTestId("licht-voorbeeld")).toContainText("A2");
  await page.getByTestId("bevestig-lichtschakeling").click();
  await expect
    .poll(
      async () =>
        Object.values((await haal(request, x.id)).document.nodes).filter(
          (n) => n.type === "lichtpunt",
        ).length,
    )
    .toBe(2);
  const doc = (await haal(request, x.id)).document;
  expect(
    Object.values(doc.nodes).filter((n) => n.type === "schakelaar"),
  ).toHaveLength(2);
  expect(
    Object.values(doc.nodes).filter((n) => n.type === "automaat"),
  ).toHaveLength(1);
  expect(aantalDifferentielen(doc)).toBe(2);
  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () =>
        Object.keys((await haal(request, x.id)).document.nodes).length,
    )
    .toBe(Object.keys(x.document.nodes).length);
});
