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
