import { expect, test } from '@playwright/test';
import { gebruikTestgebruiker, maakTestgebruiker, uniekAdres } from './hulp/inloggen';
import { metE2eDatabase } from './hulp/database';
import { ga } from './hulp/hydratatie';
import { E2E_URL } from './omgeving';
import { adminBeelden } from './hulp/admin-beelden';

const { spoor, gebruiker } = gebruikTestgebruiker(test, { voorvoegsel: 'admin-doel', naam: 'Beheer Doelgebruiker', bedrijf: 'Beheer Doelbedrijf' });

test('eigenaar heeft geen beheertoegang', async ({ page, request }) => {
  expect((await request.get('/api/admin/overzicht')).status()).toBe(403);
  await page.goto('/admin');
  await expect(page.getByRole('navigation', { name: 'Beheernavigatie' })).toHaveCount(0);
});

test('superuser zonder bedrijf zoekt, corrigeert, beheert toegang en leest audit', async ({ browser, playwright, request }) => {
  test.setTimeout(120_000);
  const doel = await (await request.get('/api/mij')).json();
  const beheerder = { naam: 'Support Beheerder', email: uniekAdres('admin-support'), bedrijf: 'Tijdelijk Supportbedrijf' };
  spoor.emails.add(beheerder.email);
  const registratie = await playwright.request.newContext({ baseURL: E2E_URL });
  const staat = await maakTestgebruiker(registratie, beheerder);
  const eigen = await (await registratie.get('/api/mij')).json();
  await registratie.dispose();
  await metE2eDatabase(async sql => {
    await sql`update "user" set superuser = true where email = ${beheerder.email}`;
    // Verwijder uitsluitend de lege testorganisatie; de cascade laat het account zonder lidmaatschap.
    await sql`delete from bedrijfsinstellingen where organisatie_id = ${eigen.actieveOrganisatieId}`;
    await sql`delete from organization where id = ${eigen.actieveOrganisatieId}`;
  });
  const context = await browser.newContext({ storageState: staat, locale: 'nl-BE' });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await ga(page, '/admin');
    await expect(page.getByRole('heading', { name: 'Overzicht', exact: true })).toBeVisible();
    await expect(page.getByText('Gegevens laden…', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Naar de inhoud' }).focus();
    await expect(page.getByRole('link', { name: 'Naar de inhoud' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Beheer', exact: true })).toBeFocused();
    await adminBeelden(page, 'overzicht');
    expect((await (await context.request.get('/api/mij')).json()).organisaties).toEqual([]);
    await page.getByRole('textbox', { name: 'Zoeken', exact: true }).fill(gebruiker().email);
    await page.getByRole('link', { name: /Beheer Doelgebruiker/ }).click();
    await page.getByRole('button', { name: 'Naam corrigeren', exact: true }).click();
    await expect(page.locator('form')).toBeVisible();
    await page.getByRole('textbox', { name: /^Naam/ }).fill('Gecorrigeerde Gebruiker');
    await page.getByRole('textbox', { name: 'Reden voor de correctie' }).fill('Naam nagekeken met de klant');
    await page.getByRole('button', { name: 'Wijziging bewaren' }).click();
    await expect(page.getByRole('heading', { name: 'Gecorrigeerde Gebruiker', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Gebruikersnaam gecorrigeerd', exact: true }).click();
    await expect(page.getByText('Naam nagekeken met de klant', { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Beheer Doelgebruiker', exact: true })).toBeVisible();
    await ga(page, `/admin/organisaties/${doel.actieveOrganisatieId}`);
    await expect(page.getByRole('heading', { name: 'Beheer Doelbedrijf', exact: true })).toBeVisible();
    await adminBeelden(page, 'bedrijf');
    await page.getByRole('button', { name: 'Overschakelen naar donkere modus' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await adminBeelden(page, 'bedrijf-donker');
    await page.getByRole('button', { name: 'Overschakelen naar lichte modus' }).click();
    await page.getByRole('button', { name: 'Gratis toegang toekennen' }).click();
    await page.getByRole('textbox', { name: 'Reden voor de correctie' }).fill('Partnerbedrijf krijgt gratis toegang');
    await page.getByRole('button', { name: 'Wijziging bewaren' }).click();
    await expect(page.getByRole('button', { name: 'Gratis toegang stopzetten' })).toBeVisible();
    await page.getByRole('button', { name: 'Proefperiode verlengen', exact: true }).click();
    await page.getByLabel('Nieuwe laatste proefdag').fill('2099-12-31');
    await page.getByRole('textbox', { name: 'Reden voor de correctie' }).fill('Extra tijd voor evaluatie');
    await page.getByRole('button', { name: 'Wijziging bewaren' }).click();
    await expect(page.getByRole('link', { name: 'Proefperiode verlengd', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Notitie toevoegen', exact: true }).click();
    await page.getByRole('textbox', { name: /^Notitie/ }).fill('Klant volgende week contacteren');
    await page.getByLabel('Opvolgdatum (optioneel)').fill('2026-01-01');
    await page.getByRole('button', { name: 'Wijziging bewaren' }).click();
    await expect(page.getByText('Klant volgende week contacteren', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Supportnotitie toegevoegd', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Beheernavigatie' }).getByRole('link', { name: 'Overzicht' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Overzicht', exact: true })).toBeVisible();
    await expect(page.getByText('Klant volgende week contacteren', { exact: true }).first()).toBeVisible();
    await page.route('**/api/admin/sessie', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.getByRole('navigation', { name: 'Beheernavigatie' }).getByRole('link', { name: 'Gebruikers', exact: true }).click();
    await expect(page.getByText('Beheer is tijdelijk niet bereikbaar. Probeer opnieuw.', { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Beheernavigatie' })).toHaveCount(0);
  } finally { await context.close(); }
});
