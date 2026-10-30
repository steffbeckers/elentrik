// De volledige stromen van aanmelden: registreren met overname van bestaande gegevens, de
// inlogmethoden (wachtwoord en inloglink) en een collega uitnodigen. Eén gebruiker doorloopt de
// tests in volgorde; rate limiting (aanmelden 3 per 10 s, inloglink 5 per 60 s) blijft ruim
// binnen de grenzen: twee wachtwoordlogins ver uit elkaar, twee inloglinks en één registratie.
import { expect, test } from "@playwright/test";
import { nieuwProjectDocument } from "@elentrik/model";
import { meldAan, meldAf } from "./hulp/aanmelden";
import { metE2eDatabase } from "./hulp/database";
import { ga } from "./hulp/hydratatie";
import { TESTWACHTWOORD, uniekAdres } from "./hulp/inloggen";
import { nieuwSpoor, ruimOp } from "./hulp/opruimen";
import { aantalMailsAan, laatsteMailAan, linkUit } from "./hulp/mailpit";
import { E2E_URL } from "./omgeving";

test.describe.configure({ mode: "serial" });

const run = Date.now();
const projectNamen = [`Overgenomen A ${run}`, `Overgenomen B ${run}`];
const legacyNaam = `Oude Installateur ${run}`;
const eigenaar = {
  naam: "Anna Aanmelder",
  email: uniekAdres("aanmelden"),
  wachtwoord: TESTWACHTWOORD,
  bedrijf: "Bedrijf A",
};
const collega = { naam: "Chris Collega", email: uniekAdres("collega"), wachtwoord: "collega-wachtwoord-123" };

// Wat deze spec aanmaakt, wordt in `afterAll` gewist, ook als een test faalde: beide gebruikers
// (met de organisatie, de overgenomen projecten en de bedrijfsrij) en de gezaaide gegevens.
const spoor = nieuwSpoor();
spoor.emails.add(eigenaar.email).add(collega.email);

test.afterAll(async () => {
  await ruimOp(spoor);
});

test("registreren: bevestigen en inloggen, en de bestaande projecten en bedrijfsgegevens worden overgenomen", async ({
  page,
}) => {
  // Gegevens van vóór het inloggen: twee projecten zonder organisatie en een bedrijfsrij zonder
  // organisatie (id 1). De eerstvolgende bevestigde aanmelding van een registratie neemt ze over.
  // Dat is deze registratie omdat Playwright met één worker draait (`workers: 1` in
  // playwright.config.ts) en het zaaien en het registreren in deze ene test gebeuren: tussen beide
  // kan geen andere spec iemand registreren. De volgorde van de spec-bestanden speelt geen rol;
  // gebruikers die al een organisatie hebben, nemen niets over.
  // Ook zonder overname (een falende test) staan ze in het spoor, zodat ze niet achterblijven.
  spoor.bedrijfsinstellingen.add(1);
  await metE2eDatabase(async (sql) => {
    for (const naam of projectNamen) {
      const document = nieuwProjectDocument({ klantNaam: "Overname", stroomtype: "2x230V" });
      const [rij] = await sql<{ id: string }[]>`
        insert into projecten (naam, klantnaam, document)
        values (${naam}, ${"Overname"}, ${sql.json(JSON.parse(JSON.stringify(document)))})
        returning id`;
      spoor.projecten.add(rij!.id);
    }
    await sql`
      insert into bedrijfsinstellingen (id, organisatie_id, installateur)
      values (1, null, ${sql.json({ naam: legacyNaam })})
      on conflict (id) do update set organisatie_id = null, installateur = excluded.installateur`;
  });

  await ga(page, "/registreren");
  await page.getByTestId("registreren-naam").fill(eigenaar.naam);
  await page.getByTestId("registreren-email").fill(eigenaar.email);
  await page.getByTestId("registreren-wachtwoord").fill(eigenaar.wachtwoord);
  await page.getByTestId("registreren-bedrijfsnaam").fill(eigenaar.bedrijf);
  const sinds = new Date(Date.now() - 1000);
  await page.getByTestId("registreren-knop").click();
  await expect(page.getByTestId("registreren-verstuurd")).toBeVisible();

  // De bevestigingslink bevestigt het adres en logt meteen in, op de startpagina.
  const link = linkUit(await laatsteMailAan(eigenaar.email, { na: sinds }));
  await ga(page, link);
  await expect(page).toHaveURL(`${E2E_URL}/`);
  await expect(page.getByTestId("organisatie-keuze")).toContainText(eigenaar.bedrijf);

  // Beide projecten staan in de lijst van de nieuwe organisatie.
  for (const naam of projectNamen) await expect(page.getByRole("row").filter({ hasText: naam })).toHaveCount(1);

  // De bedrijfsgegevens van vóór het inloggen zijn nu van deze organisatie.
  const bedrijf = (await (await page.request.get("/api/bedrijfsgegevens")).json()) as { naam: string };
  expect(bedrijf.naam).toBe(legacyNaam);
  await ga(page, "/instellingen");
  await expect(page.getByTestId("bedrijf-naam")).toHaveValue(legacyNaam);
});

test("inloggen met een wachtwoord en met een inloglink; een onbekend adres krijgt dezelfde melding, zonder mail", async ({
  page,
}) => {
  // Elke test heeft een eigen browsercontext, zonder de sessie van de vorige. Eerst inloggen met
  // het wachtwoord, dan uitloggen.
  await meldAan(page, eigenaar.email, eigenaar.wachtwoord);
  await expect(page).toHaveURL(`${E2E_URL}/`);
  await expect(page.getByTestId("organisatie-keuze")).toContainText(eigenaar.bedrijf);
  await meldAf(page);

  // Een inloglink voor een onbekend adres: dezelfde, neutrale melding, en er komt geen mail.
  const melding = "Als dit adres bekend is, ontvang je een link.";
  const onbekend = uniekAdres("onbekend");
  spoor.emails.add(onbekend);
  const sindsOnbekend = new Date(Date.now() - 1000);
  await page.getByTestId("inloggen-email").fill(onbekend);
  await page.getByTestId("inloglink-knop").click();
  await expect(page.getByTestId("inloggen-melding")).toHaveText(melding);

  // Een inloglink voor het bekende adres: dezelfde melding, en nu komt er wel een mail. Omdat die
  // komt, is de wachttijd tot dan ook lang genoeg om "geen mail aan het onbekende adres" te geloven.
  const sinds = new Date(Date.now() - 1000);
  await page.getByTestId("inloggen-email").fill(eigenaar.email);
  await page.getByTestId("inloglink-knop").click();
  await expect(page.getByTestId("inloggen-melding")).toHaveText(melding);
  const link = linkUit(await laatsteMailAan(eigenaar.email, { na: sinds }));
  expect(await aantalMailsAan(onbekend, { na: sindsOnbekend })).toBe(0);

  // De link logt in, op de pagina waar de gebruiker heen wilde (de startpagina).
  await ga(page, link);
  await expect(page).toHaveURL(`${E2E_URL}/`);
  await expect(page.getByTestId("organisatie-keuze")).toContainText(eigenaar.bedrijf);

  // De link is eenmalig: na uitloggen geeft dezelfde link een melding op de inlogpagina.
  await meldAf(page);
  await page.goto(link);
  await expect(page).toHaveURL(/\/inloggen/);
  await expect(page.getByTestId("inloggen-melding")).toHaveText(
    "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.",
  );
});

test("een collega uitnodigen: registreren via de link zonder bedrijfsnaam, de projecten zien en bewerken, instellingen alleen lezen", async ({
  page,
  browser,
}) => {
  // De eigenaar nodigt uit.
  await meldAan(page, eigenaar.email, eigenaar.wachtwoord);
  await ga(page, "/organisatie");
  const sinds = new Date(Date.now() - 1000);
  await page.getByTestId("organisatie-uitnodigen-email").fill(collega.email);
  await page.getByTestId("organisatie-uitnodigen-knop").click();
  await expect(page.getByTestId(`organisatie-uitnodiging-${collega.email}`)).toBeVisible();

  const link = linkUit(await laatsteMailAan(collega.email, { na: sinds }));
  expect(new URL(link).pathname).toMatch(/^\/uitnodiging\/.+/);

  // De collega, in een eigen browser zonder sessie.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const pagina = await context.newPage();
    await ga(pagina, link);
    await expect(pagina.getByTestId("uitnodiging-organisatie")).toHaveText(eigenaar.bedrijf);
    await expect(pagina.getByTestId("uitnodiging-rol")).toBeVisible();
    await expect(pagina.getByTestId("uitnodiging-email")).toHaveValue(collega.email);
    // Geen bedrijfsnaam: de collega komt in de organisatie van de uitnodiging.
    await expect(pagina.getByTestId("registreren-bedrijfsnaam")).toHaveCount(0);
    await pagina.getByTestId("uitnodiging-naam").fill(collega.naam);
    await pagina.getByTestId("uitnodiging-wachtwoord").fill(collega.wachtwoord);
    await pagina.getByTestId("uitnodiging-registreren").click();
    await expect(pagina).toHaveURL(`${E2E_URL}/`);
    await expect(pagina.getByTestId("organisatie-keuze")).toContainText(eigenaar.bedrijf);

    // De projecten van de eigenaar staan in de lijst, ook de overgenomen.
    for (const naam of projectNamen) await expect(pagina.getByRole("row").filter({ hasText: naam })).toHaveCount(1);

    // Bewerken kan: een wijziging in de editor wordt op de server bewaard.
    const projecten = (await (await context.request.get("/api/projecten")).json()) as { id: string; naam: string }[];
    const project = projecten.find((p) => p.naam === projectNamen[0])!;
    await ga(pagina, `/projecten/${project.id}`);
    const canvas = pagina.getByTestId("schema-canvas");
    await expect(canvas.locator('[data-testid^="plus-rail-einde-"]')).toHaveCount(1);
    await pagina.getByRole("button", { name: "Passend maken" }).click();
    await canvas.locator('[data-testid^="plus-rail-einde-"]').click();
    await expect(pagina.getByTestId("opslagstatus")).toHaveText("Opgeslagen", { timeout: 15_000 });
    await expect
      .poll(async () => ((await (await context.request.get(`/api/projecten/${project.id}`)).json()) as { versie: number }).versie)
      .toBeGreaterThan(1);

    // De bedrijfsgegevens zijn alleen te lezen: een melding, een gesloten formulier, geen knop.
    await ga(pagina, "/instellingen");
    await expect(pagina.getByTestId("bedrijf-alleen-lezen")).toBeVisible();
    await expect(pagina.getByTestId("bedrijf-naam")).toBeDisabled();
    await expect(pagina.getByTestId("bedrijf-bewaar")).toHaveCount(0);
    expect((await context.request.put("/api/bedrijfsgegevens", { data: { naam: "Gekaapt" } })).status()).toBe(403);

    // De organisatiepagina toont het lid zonder beheer: geen uitnodigingsformulier.
    await ga(pagina, "/organisatie");
    await expect(pagina.getByTestId(`organisatie-lid-${collega.email}`)).toBeVisible();
    await expect(pagina.getByTestId("organisatie-uitnodigen-email")).toHaveCount(0);
  } finally {
    await context.close();
  }

  // De uitnodiging is gebruikt: de collega is lid en de uitnodiging staat niet meer open.
  await ga(page, "/organisatie");
  await expect(page.getByTestId(`organisatie-lid-${collega.email}`)).toBeVisible();
  await expect(page.getByTestId(`organisatie-uitnodiging-${collega.email}`)).toHaveCount(0);
});
