import { expect, test } from "@playwright/test";

// Echte touch-invoer via CDP: muisevents kennen geen impliciete pointercapture op het kindelement
// onder de vinger, en net die mag een pan niet afbreken wanneer het venster de capture overneemt.
const naam = `Test Touch ${Date.now()}`;

test.use({ hasTouch: true });

test.afterAll(async ({ request }) => {
  const antwoord = await request.get("/api/projecten");
  const projecten = (await antwoord.json()) as { id: string; naam: string }[];
  for (const project of projecten.filter((p) => p.naam.startsWith(naam))) {
    await request.delete(`/api/projecten/${project.id}`);
  }
});

test("een pan met één vinger verschuift het eendraadschema", async ({ page, request }) => {
  const antwoord = await request.post("/api/projecten", {
    data: { naam, klantnaam: "", stroomtype: "2x230V" },
  });
  const { id } = (await antwoord.json()) as { id: string };
  await page.goto(`/projecten/${id}`);
  await page.waitForLoadState("networkidle");

  const canvas = page.getByTestId("schema-canvas");
  const overlay = canvas.locator(":scope > svg");
  await expect(overlay).toHaveAttribute("viewBox", /.+/);
  const voor = await overlay.getAttribute("viewBox");

  // Een startpunt op lege ruimte in de basislaag (niet op een symbool of plusknop), zodat de
  // vinger impliciet op een kindelement van het venster vastgelegd wordt.
  const start = await canvas.evaluate((venster) => {
    const r = venster.getBoundingClientRect();
    for (let y = r.top + 20; y < r.bottom - 20; y += 20) {
      for (let x = r.left + 20; x < r.right - 120; x += 20) {
        const doel = document.elementFromPoint(x, y);
        if (doel && venster.contains(doel) && doel !== venster && !doel.closest("[data-node-id], [data-plus]")) {
          return { x, y };
        }
      }
    }
    return null;
  });
  expect(start).not.toBeNull();

  const cdp = await page.context().newCDPSession(page);
  const raak = (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
    });

  await raak("touchStart", start!.x, start!.y);
  for (let stap = 1; stap <= 10; stap++) await raak("touchMove", start!.x + stap * 6, start!.y + stap * 3);
  await raak("touchEnd", start!.x + 60, start!.y + 30);

  // De inhoud volgt de vinger over de hele sleep (60 x 30 px), niet alleen tot de drempel.
  const breedte = (await canvas.boundingBox())!.width;
  const [x0, y0, b] = voor!.split(" ").map(Number) as [number, number, number];
  await expect
    .poll(async () => {
      const [x1, y1] = (await overlay.getAttribute("viewBox"))!.split(" ").map(Number) as [number, number];
      return { dx: Math.round(((x0 - x1) / b) * breedte), dy: Math.round(((y0 - y1) / b) * breedte) };
    })
    .toEqual({ dx: 60, dy: 30 });
});
