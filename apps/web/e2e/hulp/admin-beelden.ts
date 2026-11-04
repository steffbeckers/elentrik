import { expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** Optionele, gebundelde visuele bewijsronde; alleen synthetische e2e-gegevens. */
export async function adminBeelden(page: Page, naam: string) {
  if (process.env.ELENTRIK_ADMIN_BEELDEN !== '1') return;
  const map = fileURLToPath(new URL('../../.impeccable/review/', import.meta.url));
  await mkdir(map, { recursive: true });
  const vorig = page.viewportSize();
  for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: join(map, `${naam}-${label}.png`), fullPage: true, animations: 'disabled' });
  }
  if (vorig) await page.setViewportSize(vorig);
}
