import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { gebruikTestgebruiker } from './hulp/inloggen';
import { metE2eDatabase, zetProefEinde } from './hulp/database';
import { ga } from './hulp/hydratatie';
import { adminBeelden } from './hulp/admin-beelden';
const { gebruiker } = gebruikTestgebruiker(test, { voorvoegsel: 'support-editor', bedrijf: 'Support Editorbedrijf' });

test('support is reason-bound, bypasses local billing, flushes before finish and retains refused work', async ({ page, request }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);
  const created = await request.post('/api/projecten', { data: { naam: 'Te corrigeren woning', klantnaam: 'Klant', stroomtype: '2x230V' } });
  expect(created.ok()).toBe(true); const { id } = await created.json();
  const mij = await (await request.get('/api/mij')).json();
  await zetProefEinde(mij.actieveOrganisatieId, new Date('2020-01-01'));
  await metE2eDatabase(sql => sql`update "user" set superuser = true where email = ${gebruiker().email}`);
  const customerRequests: string[] = [];
  page.on('request', r => { if (/\/api\/projecten(?:\/|$)/.test(new URL(r.url()).pathname)) customerRequests.push(r.url()); });
  await ga(page, `/admin/projecten/${id}/bewerken`);
  const banner = page.getByTestId('support-banner'); const canvas = page.getByTestId('schema-canvas');
  const plus = canvas.locator('[data-testid^="plus-rail-einde-"]');
  await expect(canvas).toBeVisible(); await expect(banner).toContainText('Support Editorbedrijf');
  await adminBeelden(page, 'editor-alleen-lezen');
  await expect(plus).toHaveCount(0); await expect(page.getByTestId('exporteren')).toHaveCount(0);
  await banner.getByRole('textbox', { name: 'Reden voor de correctie' }).fill('Schema nagekeken voor klant');
  await banner.getByRole('button', { name: 'Correctie starten', exact: true }).click();
  await expect(plus).toHaveCount(1);
  await adminBeelden(page, 'editor-correctie');
  await page.getByRole('button', { name: 'Passend maken' }).click(); await plus.click();
  await page.getByTestId('tab-situatieschema').click();
  await page.getByTestId('plan-toevoegen-leeg').click();
  const plan = page.getByRole('dialog');
  await plan.getByTestId('plan-bestand').setInputFiles(fileURLToPath(new URL('./fixtures/plan.png', import.meta.url)));
  await plan.getByTestId('plan-toevoegen-bevestig').click();
  await expect(plan).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('plan-canvas').locator('image')).toHaveAttribute('href', /\/api\/admin\/bestanden\//);
  await page.getByTestId('tab-eendraadschema').click();
  await banner.getByRole('button', { name: 'Correctie afronden' }).click();
  await expect(plus).toHaveCount(0); await expect(banner.getByRole('button', { name: 'Correctie starten', exact: true })).toBeVisible();
  const saved = await (await request.get(`/api/admin/projecten/${id}/document`)).json(); expect(saved.versie).toBeGreaterThan(1);
  expect(saved.document.situatie.paginas).toHaveLength(1);
  const history = await (await request.get(`/api/admin/audit?projectId=${id}`)).json();
  expect(history.items.map((a: { actie: string }) => a.actie)).toEqual(expect.arrayContaining(['correctie.gestart', 'project.bewaard', 'correctie.afgerond']));
  await page.reload(); await expect(canvas).toBeVisible(); await expect(plus).toHaveCount(0);
  await banner.getByRole('textbox', { name: 'Reden voor de correctie' }).fill('Tweede correctie');
  await banner.getByRole('button', { name: 'Correctie starten', exact: true }).click(); await expect(plus).toHaveCount(1);
  await metE2eDatabase(sql => sql`update admin_correcties set verloopt = now() - interval '1 minute' where project_id = ${id} and beeindigd is null`);
  await page.getByRole('button', { name: 'Passend maken' }).click(); await plus.click();
  await expect(banner).toContainText('Deze correctie is gestopt of verlopen.', { timeout: 15_000 });
  await expect(plus).toHaveCount(0);
  await expect.poll(async () => (await (await request.get(`/api/admin/projecten/${id}/document`)).json()).versie).toBe(saved.versie);
  const download = page.waitForEvent('download'); await banner.getByRole('button', { name: 'Lokaal document downloaden (JSON)' }).click();
  expect((await download).suggestedFilename()).toBe(`project-${id}-lokaal.json`);
  page.on('dialog', d => d.accept()); await page.reload(); await expect(canvas).toBeVisible(); await expect(plus).toHaveCount(0);
  await banner.getByRole('textbox', { name: 'Reden voor de correctie' }).fill('Lokaal werk herstellen');
  await banner.getByRole('button', { name: 'Correctie starten', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('concept');
  expect(customerRequests).toEqual([]);
});

test('support recovery never downloads the previous project while a new document loads or fails', async ({ page, request }) => {
  const mij = await (await request.get('/api/mij')).json();
  await zetProefEinde(mij.actieveOrganisatieId, new Date('2099-01-01'));
  await metE2eDatabase(sql => sql`update "user" set superuser = true where email = ${gebruiker().email}`);
  const ids: string[] = [];
  for (const naam of ['Downloadproject A', 'Downloadproject B']) {
    const antwoord = await request.post('/api/projecten', { data: { naam, klantnaam: 'Klant', stroomtype: '2x230V' } });
    expect(antwoord.ok()).toBe(true); ids.push((await antwoord.json()).id);
  }
  await ga(page, `/admin/projecten/${ids[0]}/bewerken`);
  await expect(page.getByTestId('schema-canvas')).toBeVisible();
  await page.getByRole('link', { name: 'Terug naar projectbeheer' }).click();
  await page.getByRole('link', { name: 'Projecten', exact: true }).last().click();
  await page.getByRole('link', { name: 'Downloadproject B', exact: true }).click();
  let vrijgeven!: () => void;
  const wacht = new Promise<void>(resolve => { vrijgeven = resolve; });
  await page.route(`**/api/admin/projecten/${ids[1]}/document`, async route => {
    await wacht; await route.fulfill({ status: 503, contentType: 'application/json', body: '{"statusCode":503}' });
  });
  try {
    await page.locator(`a[href="/admin/projecten/${ids[1]}/bewerken"]`).click();
    const download = page.getByTestId('support-banner').getByRole('button', { name: 'Lokaal document downloaden (JSON)' });
    await expect(download).toBeDisabled();
    vrijgeven();
    await expect(page.getByTestId('schema-canvas')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Opnieuw proberen', exact: true })).toBeVisible();
    await expect(download).toBeDisabled();
  } finally { vrijgeven(); }
});
