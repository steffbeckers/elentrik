import { expect, test } from "@playwright/test";
import { gebruikTestgebruiker } from "./hulp/inloggen";
import { bevestigSjabloonOpBord } from "./hulp/sjabloon";

// Een onderdeel van het eendraadschema selecteren vraagt geen mikken op de getekende lijn: elk
// symbool heeft een onzichtbaar raakvlak dat ruimer is dan het symbool zelf.
gebruikTestgebruiker(test, { voorvoegsel: "klikgebied" });

test("een klik naast een leiding of naast een automaat selecteert dat onderdeel", async ({ page, request }) => {
  const antwoord = await request.post("/api/projecten", {
    data: { naam: `Test Klikgebied ${Date.now()}`, klantnaam: "", stroomtype: "2x230V" },
  });
  expect(antwoord.status()).toBe(201);
  const { id } = (await antwoord.json()) as { id: string };

  await page.goto(`/projecten/${id}`);
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  await bevestigSjabloonOpBord(page);
  await page.getByRole("button", { name: "Passend maken" }).click();

  const canvas = page.getByTestId("schema-canvas");
  // De leiding is een dunne lijn: het smalste symbool van het schema. Haar raakvlak is minstens
  // 8 mm breed; de hoek van dat vlak ligt dus een eind naast de lijn.
  const doelen = await canvas.locator("[data-node-id]").evaluateAll((groepen) =>
    groepen.map((g) => {
      const vlak = g.querySelector(":scope > .raakvlak")!.getBoundingClientRect();
      const getekend = [...g.querySelectorAll(":scope > :not(.raakvlak)")].map((e) => e.getBoundingClientRect());
      const breedte = Math.max(0, ...getekend.map((r) => r.right)) - Math.min(...getekend.map((r) => r.left));
      return { id: g.getAttribute("data-node-id")!, x: vlak.x, y: vlak.y, b: vlak.width, h: vlak.height, breedte };
    }),
  );
  const leiding = doelen.reduce((smalst, d) => (d.breedte < smalst.breedte ? d : smalst));
  // Het raakvlak is duidelijk breder dan wat er getekend staat.
  expect(leiding.b).toBeGreaterThan(leiding.breedte + 8);

  // Net binnen de linkerrand van het raakvlak, ver van de lijn in het midden.
  await page.mouse.click(leiding.x + 2, leiding.y + leiding.h / 2);
  await expect(page.getByTestId(`selectie-${leiding.id}`)).toHaveCount(1);
  await expect(page.getByTestId("schema-nodekeuze")).toContainText("Leiding");

  // Buiten elk raakvlak: de selectie verdwijnt.
  await page.mouse.click(leiding.x - 40, leiding.y + leiding.h / 2);
  await expect(page.getByTestId(`selectie-${leiding.id}`)).toHaveCount(0);

  // De hoek van het raakvlak van een ander onderdeel selecteert dat onderdeel.
  const ander = doelen.find((d) => d.id !== leiding.id && d.y > leiding.y + leiding.h)!;
  await page.mouse.click(ander.x + 2, ander.y + 2);
  await expect(page.getByTestId(`selectie-${ander.id}`)).toHaveCount(1);
});
