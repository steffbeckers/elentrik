import { expect, test } from '@playwright/test';
import { gebruikTestgebruiker, maakTestgebruiker, uniekAdres } from './hulp/inloggen';
import { metE2eDatabase } from './hulp/database';
import { ga } from './hulp/hydratatie';
import { E2E_URL } from './omgeving';

const { spoor } = gebruikTestgebruiker(test, { voorvoegsel: 'admin-instances', naam: 'Instances Eigenaar', bedrijf: 'Instances Bedrijf' });
const HOST = 'e2e-kopie.example';

test('superuser ziet een gemelde instance en het label Stil bij een oude melding', async ({ browser, playwright }) => {
  test.setTimeout(120_000);
  const beheerder = { naam: 'Instances Beheerder', email: uniekAdres('admin-instances-su'), bedrijf: 'Tijdelijk Instancesbedrijf' };
  spoor.emails.add(beheerder.email);
  const registratie = await playwright.request.newContext({ baseURL: E2E_URL });
  const staat = await maakTestgebruiker(registratie, beheerder);
  await registratie.dispose();
  const instanceId = crypto.randomUUID();
  await metE2eDatabase(async sql => {
    await sql`update "user" set superuser = true where email = ${beheerder.email}`;
    await sql`insert into instance_meldingen (instance_id, host, versie, abonnementen_aan, aantal_organisaties, aantal_gebruikers, eerste_melding_op, laatste_melding_op)
      values (${instanceId}, ${HOST}, 'e2e-versie', false, 2, 5, now() - interval '30 days', now() - interval '8 days')`;
  });
  const context = await browser.newContext({ storageState: staat, locale: 'nl-BE' });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await ga(page, '/admin/installaties');
    await expect(page.getByRole('heading', { name: 'Installaties', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: HOST, exact: true }).or(page.getByRole('rowheader', { name: HOST, exact: true }))).toBeVisible();
    await expect(page.getByText('Stil', { exact: true })).toBeVisible();
  } finally {
    await context.close();
    await metE2eDatabase(sql => sql`delete from instance_meldingen where instance_id = ${instanceId}`);
  }
});
