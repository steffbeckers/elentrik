import { expect, type Page } from "@playwright/test";

/** Click a real symbol segment: an SVG group's bounding-box centre can be an open contact gap. */
export async function selecteerSchemaNode(page: Page, id: string): Promise<void> {
  const node = page.getByTestId("schema-canvas").locator(`[data-node-id="${id}"]`);
  let punt: { x: number; y: number } | null = null;
  await expect.poll(async () => {
    punt = await node.evaluate(g => {
      for (const deel of g.querySelectorAll("*")) {
        const rect = deel.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        if (document.elementFromPoint(x, y)?.closest("[data-node-id]") === g) return { x, y };
      }
      return null;
    });
    return punt !== null;
  }, { message: `Symbol ${id} has a visible segment that receives pointer events` }).toBe(true);
  await page.mouse.click(punt!.x, punt!.y);
  await expect(page.getByTestId(`selectie-${id}`)).toHaveCount(1);
}

/**
 * Voegt `aantal` keer het gekozen onderdeel toe aan het einde van de enige kring van het schema.
 * Na elke klik verhuist de plusknop naar het nieuwe einde; de volgende klik wacht daarop.
 * `passendMaken` is de naam van de knop in de taal van de interface.
 */
export async function voegToeAanKringEinde(page: Page, aantal: number, passendMaken = "Passend maken"): Promise<void> {
  const plus = page.getByTestId("schema-canvas").locator('[data-testid^="plus-kring-einde-"]');
  for (let i = 0; i < aantal; i++) {
    await page.getByRole("button", { name: passendMaken }).click();
    const vorige = await plus.getAttribute("data-testid");
    await plus.click();
    await expect(plus).not.toHaveAttribute("data-testid", vorige!);
  }
}
