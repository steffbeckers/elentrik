import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import type { InstallatieDocument } from "@elentrik/model";
import { gebruikTestgebruiker } from "./hulp/inloggen";
gebruikTestgebruiker(test, { voorvoegsel: "invoegen-tussen" });
async function haal(
  request: APIRequestContext,
  id: string,
): Promise<InstallatieDocument> {
  return (await (await request.get(`/api/projecten/${id}`)).json()).document;
}
async function openProject(page: Page, request: APIRequestContext) {
  const response = await request.post("/api/projecten", {
    data: {
      naam: `Invoegen ${Date.now()}`,
      klantnaam: "Bron",
      stroomtype: "2x230V",
    },
  });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  await page.goto(`/projecten/${id}`);
  // The first editor navigation also loads Nuxt's development modules.
  await expect(page.getByTestId("schema-canvas")).toBeVisible({ timeout: 20_000 });
  return { id, doc: await haal(request, id) };
}
// Same real-symbol-segment hit testing as root's current hulp/schema-selectie.ts.
async function selecteer(page: Page, id: string): Promise<void> {
  await page.getByRole("button", { name: "Passend maken" }).click();
  const node = page
    .getByTestId("schema-canvas")
    .locator(`[data-node-id="${id}"]`);
  let punt: { x: number; y: number } | null = null;
  await expect
    .poll(async () => {
      punt = await node.evaluate((g) => {
        for (const deel of g.querySelectorAll("*")) {
          const rect = deel.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          const x = rect.x + rect.width / 2,
            y = rect.y + rect.height / 2;
          if (document.elementFromPoint(x, y)?.closest("[data-node-id]") === g)
            return { x, y };
        }
        return null;
      });
      return punt !== null;
    })
    .toBe(true);
  await page.mouse.click(punt!.x, punt!.y);
  await expect(page.getByTestId(`selectie-${id}`)).toHaveCount(1);
}
async function tool(page: Page, naam: string) {
  if (!(await page.getByTestId(`onderdeel-${naam}`).isVisible()))
    await page.getByTestId("werkruimte-onderdelen").click();
  await page.getByTestId(`onderdeel-${naam}`).click();
}

test("explicit cable insertion before main RCD preserves the existing chain, supports undo/redo and source 4x10 notation", async ({
  page,
  request,
}) => {
  const x = await openProject(page, request);
  const hoofd = Object.values(x.doc.nodes).find(
    (n) => n.type === "differentieel",
  )!;
  const teller = hoofd.parentId!;
  await tool(page, "leiding");
  await selecteer(page, teller);
  await expect(page.getByTestId("invoegen-voor-selectie")).toBeDisabled();
  expect(await haal(request, x.id)).toEqual(x.doc);
  await selecteer(page, hoofd.id);
  await expect(page.getByTestId("invoegen-voor-selectie")).toContainText(
    /Leiding vóór.*Differentieel/,
  );
  await page.getByTestId("invoegen-voor-selectie").click();
  await expect(page.getByTestId("veld-kabeltype")).toBeVisible();
  await expect(page.getByTestId("veld-kabeltype")).toHaveValue("XVB");
  await expect
    .poll(async () => (await haal(request, x.id)).nodes[hoofd.id]!.parentId)
    .not.toBe(teller);
  const after = await haal(request, x.id);
  const inserted = after.nodes[hoofd.id]!.parentId!;
  expect(after.nodes[teller]!.kinderen).toEqual([inserted]);
  expect(after.nodes[inserted]!.kinderen).toEqual([hoofd.id]);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await haal(request, x.id)).nodes[hoofd.id]!.parentId)
    .toBe(teller);
  await page.keyboard.press("Control+y");
  await expect
    .poll(async () => (await haal(request, x.id)).nodes[hoofd.id]!.parentId)
    .toBe(inserted);
  await selecteer(page, inserted);
  await page.getByTestId("veld-aantalGeleiders").fill("4");
  await page.getByTestId("veld-aantalGeleiders").blur();
  await page.getByTestId("veld-doorsnede_mm2").fill("10");
  await page.getByTestId("veld-doorsnede_mm2").blur();
  await expect(
    page.getByTestId("veld-metBeschermingsgeleider"),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("veld-metBeschermingsgeleider").click();
  await expect
    .poll(async () => (await haal(request, x.id)).nodes[inserted])
    .toMatchObject({
      type: "leiding",
      aantalGeleiders: 4,
      doorsnede_mm2: 10,
      metBeschermingsgeleider: false,
    });
  await expect(
    page
      .getByTestId("schema-canvas")
      .locator("text", { hasText: /^XVB 4x10$/ }),
  ).toHaveCount(1);
});

test("EV differential inserts explicitly between circuit B breaker and its existing cable", async ({
  page,
  request,
}) => {
  const x = await openProject(page, request);
  const bord = Object.values(x.doc.nodes).find(
    (n) => n.type === "verdeelbord",
  )!;
  await tool(page, "contactdoos");
  await page.getByRole("button", { name: "Passend maken" }).click();
  await page.getByTestId(`plus-rail-einde-${bord.id}`).click();
  await expect
    .poll(
      async () =>
        Object.values((await haal(request, x.id)).nodes).filter(
          (n) => n.type === "automaat",
        ).length,
    )
    .toBe(1);
  await tool(page, "toestel");
  await page.getByTestId("toestelsoort").click();
  await page.getByRole("option", { name: "Laadpaal", exact: true }).click();
  await page.getByRole("button", { name: "Passend maken" }).click();
  await page.getByTestId(`plus-rail-einde-${bord.id}`).click();
  await expect
    .poll(
      async () =>
        Object.values((await haal(request, x.id)).nodes).filter(
          (n) => n.type === "automaat",
        ).length,
    )
    .toBe(2);
  const before = await haal(request, x.id);
  const b = before.nodes[bord.id]!.kinderen[1]!;
  const cable = before.nodes[b]!.kinderen[0]!;
  const ev = before.nodes[cable]!.kinderen[0]!;
  await tool(page, "differentieel");
  await selecteer(page, cable);
  await expect(page.getByTestId("invoegen-voor-selectie")).toContainText(
    /Differentieel vóór B/,
  );
  await page.getByTestId("invoegen-voor-selectie").click();
  await expect(page.getByTestId("veld-gevoeligheid_mA")).toBeVisible();
  await expect(page.getByTestId("veld-gevoeligheid_mA")).toHaveValue("30");
  await expect
    .poll(async () => (await haal(request, x.id)).nodes[cable]!.parentId)
    .not.toBe(b);
  const after = await haal(request, x.id);
  const inserted = after.nodes[cable]!.parentId!;
  expect(after.nodes[b]!.kinderen).toEqual([inserted]);
  expect(after.nodes[inserted]!.kinderen).toEqual([cable]);
  expect(after.nodes[ev]).toEqual(before.nodes[ev]);
  expect(after.nodes[bord.id]!.kinderen).toEqual(
    before.nodes[bord.id]!.kinderen,
  );
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await haal(request, x.id)).nodes[b]!.kinderen)
    .toEqual([cable]);
});
