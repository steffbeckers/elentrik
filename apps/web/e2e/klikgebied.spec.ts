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

test("de actiebalk bij de selectie: eigenschappen openen, verwijderen en een hele tak verwijderen zonder toetsenbord", async ({ page, request }) => {
  const antwoord = await request.post("/api/projecten", {
    data: { naam: `Test Verwijderknop ${Date.now()}`, klantnaam: "", stroomtype: "2x230V" },
  });
  expect(antwoord.status()).toBe(201);
  const { id } = (await antwoord.json()) as { id: string };

  await page.goto(`/projecten/${id}`);
  await page.getByRole("button", { name: "Kring stopcontacten" }).click();
  await bevestigSjabloonOpBord(page);
  await page.getByRole("button", { name: "Passend maken" }).click();

  const canvas = page.getByTestId("schema-canvas");
  const nodes = canvas.locator("[data-node-id]");
  const aantal = await nodes.count();
  // Zonder selectie is er geen actiebalk.
  await page.mouse.click(5, 300);
  await expect(page.getByTestId("schema-actiebalk")).toHaveCount(0);

  // Het bovenste symbool is de laatste contactdoos van de kring: die kan alleen weg.
  const bovenste = await nodes.evaluateAll((groepen) => {
    const vlakken = groepen.map((g) => ({ id: g.getAttribute("data-node-id")!, r: g.querySelector(":scope > .raakvlak")!.getBoundingClientRect() }));
    const top = vlakken.reduce((a, b) => (b.r.y < a.r.y ? b : a));
    return { id: top.id, x: top.r.x + top.r.width / 2, y: top.r.y + top.r.height / 2, rechts: top.r.right };
  });
  await page.mouse.click(bovenste.x, bovenste.y);
  await expect(page.getByTestId(`selectie-${bovenste.id}`)).toHaveCount(1);

  // De balk staat naast het onderdeel, niet erboven of eronder: ze overlapt het raakvlak niet.
  const balk = (await page.getByTestId("schema-actiebalk").boundingBox())!;
  expect(balk.x).toBeGreaterThanOrEqual(bovenste.rechts);
  await expect(page.getByTestId("schema-actiebalk")).toHaveAttribute("data-bij-selectie", "true");

  // Eigenschappen opent het paneel; de selectie blijft.
  await page.getByTestId("schema-eigenschappen").click();
  await expect(page.getByTestId("werkruimte-eigenschappen")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId(`selectie-${bovenste.id}`)).toHaveCount(1);

  await page.getByTestId("schema-verwijder").click();
  await expect(nodes).toHaveCount(aantal - 1);

  // De hele kring: de automaat kiezen en de tak verwijderen vraagt eerst een bevestiging.
  await page.getByTestId("schema-nodekeuze").click();
  await page.getByRole("option", { name: /Automaat/ }).first().click();
  await page.getByTestId("schema-verwijder-tak").click();
  await expect(page.getByRole("dialog")).toContainText("Hele tak verwijderen");
  await page.getByTestId("tak-verwijderen-bevestigen").click();
  await expect(canvas.locator("[data-node-id]")).toHaveCount(aantal - 8);

  // Alles is ongedaan te maken.
  await page.getByTestId("ongedaan-maken").click();
  await expect(canvas.locator("[data-node-id]")).toHaveCount(aantal - 1);
});
