# Elentrik: lokaal in gebruik nemen en online zetten

Praktische notities bij het inloggen en de organisaties (plan 6). Alles draait voorlopig op
`127.0.0.1`.

## De eerste echte registratie

De eerste gebruiker die zich registreert en zijn adres bevestigt, neemt alle bestaande gegevens
over: alle projecten zonder organisatie (met hun bestanden, snapshots en exports) en de bestaande
bedrijfsgegevens. Dat gebeurt één keer.

1. **Maak eerst een back-up.**
   - De database: `pg_dump` van de database `elentrik`, bijvoorbeeld
     `docker exec elentrik-postgres-1 pg_dump -U elentrik elentrik > elentrik-voor-registratie.sql`.
   - De bestanden: een kopie van de map `apps/web/.data/bestanden`.
2. **Registreer eerst je eigen account**, op `http://127.0.0.1:3000/registreren`, met de naam van
   je eigen bedrijf. Laat niemand anders zich eerder registreren: wie eerst bevestigt, krijgt de
   gegevens.
3. **De overname gebeurt bij de eerste bevestigde aanmelding**, dus wanneer je op de link in de
   bevestigingsmail klikt (in Mailpit op `http://127.0.0.1:8025`). Daarna staan je projecten en
   bedrijfsgegevens in je nieuwe organisatie.
4. **Draai Playwright niet tussen het registreren en het klikken op de link.** De e2e-tests maken
   de Mailpit-inbox leeg, en dan is je bevestigingsmail weg.
5. **Is de mail toch weg of verlopen** (de link is 24 uur geldig)? Probeer in te loggen en kies
   "Bevestigingsmail opnieuw sturen".

## Voor Elentrik online gaat

- **Adressen:** zet `BETTER_AUTH_URL` op de publieke URL (bijvoorbeeld `https://app.elentrik.be`).
  Zet ook `NUXT_AUTH_BASIS_URL` op dezelfde waarde: de basis-URL van de auth-client tijdens SSR
  wordt bij het bouwen vastgelegd, en die variabele overschrijft ze bij het starten.
- **Cookies:** `Secure` gaat vanzelf aan zodra `BETTER_AUTH_URL` met `https://` begint. Lokaal
  (http) staat het uit. Cookies blijven `HttpOnly` en `SameSite=Lax`.
- **Rate limiting achter een proxy:** de auth-route vervangt `x-forwarded-for` door het IP van de
  socket, zodat een client zijn IP niet kan kiezen. Achter een reverse proxy is dat IP altijd dat
  van de proxy: dan delen alle gebruikers één teller. Vóór het online gaan is een ontwerp nodig
  dat de proxy vertrouwt (alleen haar `x-forwarded-for`, en alleen van haar adres).
- **CSRF en de Origin-controle:** de eigen API-routes weigeren een wijzigend verzoek (POST, PUT,
  PATCH, DELETE) van een andere site met 403: op `Sec-Fetch-Site: cross-site`, en op elke
  `Origin` die niet de basis-URL is (ook als de browser het verzoek `same-site` noemt, zoals een
  andere lokale app op een andere poort). Better Auth controleert de `Origin` van zijn
  eigen routes tegen `trustedOrigins`. Beide volgen `BETTER_AUTH_URL`; wijst die naar `127.0.0.1`,
  dan geldt ook `localhost` op dezelfde poort. Een ander domein (bijvoorbeeld `www.` naast het
  hoofddomein) moet je dus expliciet toevoegen of vermijden.
- **Mail:** lokaal gaat alles naar Mailpit. Voor een echte mailserver:
  - `SMTP_HOST` en `SMTP_PORT`: de server en de poort;
  - `SMTP_GEBRUIKER` en `SMTP_WACHTWOORD`: de aanmelding (allebei nodig, anders geen aanmelding);
  - `SMTP_BEVEILIGD=true`: TLS vanaf het begin van de verbinding (meestal poort 465);
  - `SMTP_VAN`: de afzender.

  Die waarden staan alleen in `.env` en worden nooit gelogd.
- **Geheim:** `BETTER_AUTH_SECRET` is een eigen, lange willekeurige waarde (minstens 32 tekens),
  alleen in `.env` en nooit in de repo.

## Talen

Elentrik is er in het Nederlands (standaard), het Frans (Belgisch) en het Engels. De woordenlijst
met de afgesproken termen staat in `docs/vertalingen.md`.

- **De taal van de interface** kiest een gebruiker in het gebruikersmenu ("Taal") of, voor het
  inloggen, met de taalkiezer onder de aanmeld- en registratiepagina's. Vóór het inloggen geldt de
  cookie `elentrik_taal` (een jaar geldig), en zonder cookie de taal van de browser
  (`Accept-Language`), anders Nederlands. Na het inloggen wint de taal van het account (`user.taal`,
  bewaard door `PUT /api/mij/taal`): ze volgt de gebruiker naar een ander toestel en de cookie wordt
  erbij gezet. De mails (bevestiging, inloglink, wachtwoordherstel, uitnodiging) komen in de taal van het account; een
  uitnodiging in de taal van wie uitnodigt.
- **De dossiertaal** is de taal van het dossier: de PDF (paginatitels, cartouche, kolommen, bijlage).
  Ze staat per project in de projectgegevens ("Dossiertaal") en kan los van de interfacetaal
  verschillen: een Franstalige installateur kan een Nederlandstalig dossier maken. Een nieuw
  project krijgt de taal van de maker; oudere projecten zonder dossiertaal zijn Nederlands. De
  bevindingen in de editor staan in de taal van de interface, niet van het dossier. Wat de
  gebruiker zelf typt (namen, adressen, motivaties) wordt nooit vertaald.
- **Nieuwe teksten** komen altijd in alle drie de bestanden: `apps/web/i18n/locales/nl.json`,
  `fr.json` en `en.json`, met dezelfde sleutels, plaatshouders (`{naam}`) en meervoudsvormen. De
  pariteitstest `apps/web/test/vertalingen.test.ts` faalt anders. Berichten van de AREI-regels
  (`packages/arei`) en de PDF-teksten (`packages/render`) hebben hun eigen drie bestanden per
  pakket, met een eigen pariteitstest. Nieuwe termen komen eerst in `docs/vertalingen.md`.
- **De e2e-tests** draaien in het Nederlands (`locale: "nl-BE"` in `playwright.config.ts`);
  `e2e/talen.spec.ts` test de drie talen. Een spec die een andere taal nodig heeft, maakt een eigen
  browsercontext met die `locale` (en een lege `storageState`, anders erft hij de sessie).

**Opvolgpunt vóór de lancering:** laat het Frans (en het Engels) nalezen door iemand met die taal
als moedertaal. De vertalingen zijn eigen werk, niet nagelezen door een moedertaalspreker.

## Abonnementen en Stripe

Elentrik rekent af via Stripe Checkout, met een gratis proefperiode van 30 dagen voor het eerste
bedrijf dat iemand zelf aanmaakt. Zonder Stripe-configuratie staan abonnementen **uit**: geen
proefperiode, geen alleen-lezen, en de pagina Abonnement zegt "Betalen is nog niet ingesteld".
Lokaal gebruik zonder Stripe raakt dus nooit geblokkeerd.

### Instellen

Zet de waarden in `apps/web/.env`, nooit in de repo en nooit in een commit, een issue of een
chatbericht. Ze staan zonder waarde in `apps/web/.env.example`.

| Variabele | Wat |
| --- | --- |
| `STRIPE_GEHEIME_SLEUTEL` | De geheime sleutel. In testmodus begint ze met `sk_test_`. Zonder deze sleutel staan abonnementen uit. |
| `STRIPE_WEBHOOK_GEHEIM` | Het geheim van het webhook-eindpunt (`whsec_...`). |
| `STRIPE_PRIJS_MAAND` | Het id van de maandprijs (`price_...`). |
| `STRIPE_PRIJS_JAAR` | Het id van de jaarprijs (`price_...`). |
| `BOEKHOUDING_INBOX` | Het e-mailadres van de boekhouding. Optioneel: leeg betekent geen kopie. |
| `STRIPE_API_BASIS` | Alleen voor de e2e-tests, voor een nep-Stripe. Zet dit nooit in je eigen `.env`. |

- Staat de sleutel er wel maar ontbreekt een prijs, dan geeft de server bij het eerste gebruik van
  abonnementen een fout met de naam van de variabele (nooit met de waarde).
- **Het adres in `BOEKHOUDING_INBOX` en alle sleutels horen alleen in `apps/web/.env`.** Ze worden
  nooit gelogd, nooit naar de browser gestuurd en nooit gecommit.
- Alleen facturen van **bekende Elentrik-klanten** gaan naar `BOEKHOUDING_INBOX`: een factuur van
  een klant die Elentrik niet kent (een ander product op hetzelfde Stripe-account, of een klant die
  je met de hand aanmaakte) wordt niet doorgestuurd. Ook een factuur van 0 euro, en een factuur
  die al eerder doorgestuurd werd, geven geen mail.
- Lokaal komt die kopie in Mailpit (`http://127.0.0.1:8025`), tenzij je SMTP anders instelt.

### Het Stripe-dashboard (eenmalig, met de hand)

De code legt deze instellingen niet vast. Doe ze in testmodus en later nog eens in live-modus.

- **Stripe Tax:** aan, met het Belgische vestigingsadres en de btw-registratie.
- **Prijzen:** twee terugkerende prijzen, een per maand en een per jaar, in EUR en **exclusief**
  btw (tax behavior "exclusive"). Hun id's gaan in `STRIPE_PRIJS_MAAND` en `STRIPE_PRIJS_JAAR`.
- **Factuurnummering:** een eigen voorvoegsel, bijvoorbeeld `ELK-`, doorlopend over het hele account.
- **Klantmails:** Stripe stuurt de klant **geen** facturen, want de officiële factuur komt uit de
  boekhouding. Betalingsbewijzen naar eigen keuze.
- **Mislukte betalingen:** Smart Retries aan. Na de laatste mislukte poging wordt het abonnement
  **opgezegd**.
- **Klantenportaal:**
  - wisselen tussen de twee prijzen toegelaten, met de standaardverrekening (prorating) van Stripe;
  - opzeggen op het **einde van de periode**;
  - betaalmethode bijwerken toegelaten;
  - de factuurgeschiedenis **uit**, omdat de officiële facturen uit de boekhouding komen;
  - sla de standaardconfiguratie van het portaal op, ook in testmodus (anders faalt het portaal).
- **Webhook-eindpunt** (zodra Elentrik online staat, op `https://<jouw-domein>/api/stripe/webhook`),
  met deze events:
  - `checkout.session.completed` en `checkout.session.async_payment_failed`;
  - `customer.subscription.created`, `customer.subscription.updated` en `customer.subscription.deleted`;
  - `invoice.paid` en `invoice.payment_failed`.

  **Gebruik voor het eindpunt dezelfde API-versie als de Stripe-library in Elentrik:
  `2026-09-30.endive`.** Bij een andere versie hebben facturen andere velden (bijvoorbeeld voor het
  abonnement van een factuur), en dan herkent Elentrik de factuur niet meer. Stel de versie in bij
  het aanmaken van het eindpunt. Het geheim van dat eindpunt wordt `STRIPE_WEBHOOK_GEHEIM`.

Elentrik vangt de belangrijkste misconfiguraties zelf op: schrijfrecht eindigt 14 dagen na de
eerste mislukte betaling (`past_due`), het levendigste abonnement van een klant wordt gevolgd, en
een tweede Checkout bij een bestaand abonnement geeft een 409 met een doorverwijzing naar het portaal.

### Lokaal testen met `stripe listen`

1. Installeer de Stripe CLI en log in met `stripe login` (testmodus).
2. Start de webhook-doorstuurder:

   ```
   stripe listen --forward-to http://127.0.0.1:3000/api/stripe/webhook
   ```

   De CLI toont een `whsec_...`-geheim: zet dat in `STRIPE_WEBHOOK_GEHEIM` en herstart de
   ontwikkelserver. De doorgestuurde events worden gerenderd met de standaard-API-versie van je
   Stripe-account (of met de nieuwste versie als je `stripe listen --latest` gebruikt). Die versie
   moet `2026-09-30.endive` zijn, de versie van de library in Elentrik: bij een andere versie
   verschillen de velden waarmee een factuur naar zijn abonnement wijst. Controleer en wijzig de
   standaardversie van het account in het Stripe-dashboard (Ontwikkelaars, API-versie) voor je test.
3. Na de terugkeer uit Checkout synchroniseert Elentrik ook zelf (via `/abonnement?terug=...`), dus
   de pagina toont de nieuwe status meteen, ook als de webhook later aankomt.

### Handmatige test (Stripe-testmodus)

Doe dit op een testaccount, met `stripe listen` aan en de testsleutels in `.env`.

1. **Een abonnement nemen:**
   - open `/abonnement` als eigenaar, kies Maandelijks of Jaarlijks en betaal met de testkaart
     `4242 4242 4242 4242` (willekeurige toekomstige vervaldatum en cvc);
   - je komt terug op `/abonnement` met de status "Je hebt een ... abonnement";
   - controleer dat de factuur met de PDF als bijlage in Mailpit aankomt (of bij de boekhouding,
     als `BOEKHOUDING_INBOX` daarheen wijst) en dat dat precies één mail is.
2. **Een mislukte betaling (verlenging):** deze moet gebeuren terwijl het bedrijf nog meer dan
   48 uur proefperiode heeft.
   - Kies een abonnement en betaal met de testkaart `4000 0000 0000 0341`. Die kaart kan aan een
     klant gekoppeld worden, maar elke echte afschrijving faalt. Met meer dan 48 uur proef start het
     abonnement met een proefperiode: de factuur van EUR 0 slaagt en de kaart wordt enkel gekoppeld.
   - Zonder proefperiode (of met minder dan 48 uur proef) zou de kaart al in Checkout zelf
     geweigerd worden, omdat daar meteen afgeschreven wordt: dan start het abonnement nooit en kun
     je de mislukte verlenging niet nabootsen.
   - Beëindig daarna de proefperiode van dat abonnement in het Stripe-dashboard met "End trial
     now" (of gebruik een test clock). De eerste echte afschrijving faalt: het abonnement wordt
     `past_due` en Elentrik toont de banner "Je laatste betaling is mislukt" met de datum waarvoor
     de betaling geregeld moet zijn.
3. **Wisselen en opzeggen via het portaal:** kies "Abonnement beheren", wissel tussen maand en jaar,
   en zeg op. Het abonnement blijft actief tot het einde van de periode; de pagina zegt dat het is opgezegd.
4. **Een geweigerde kaart gevolgd door een goede:** betaal in Checkout eerst met de testkaart
   `4000 0000 0000 0002` (wordt geweigerd) en daarna, in dezelfde Checkout-sessie, met
   `4242 4242 4242 4242`. Het abonnement moet actief worden en mag niet geannuleerd zijn.
5. **Een mislukte eerste SEPA-betaling:** betaal een eerste keer met de testrekening van Stripe die
   de eerste betaling laat mislukken (zie de lijst met SEPA-testrekeningen in de Stripe-documentatie).
   Het abonnement moet geannuleerd worden en er mag daarna geen factuur meer geïnd worden.
6. **Een verlopen proefperiode:** zet `proef_einde` in het verleden en controleer dat het bedrijf
   alleen-lezen wordt (zie hieronder).

### Een proefperiode of vrijstelling met SQL zetten

Altijd op de juiste database, en maak eerst een back-up (zie "De eerste echte registratie").

```sql
-- Een proefperiode laten verlopen (test) of opnieuw laten lopen.
update organization set proef_einde = now() - interval '1 day' where id = '<organisatie-id>';
update organization set proef_einde = now() + interval '30 days' where id = '<organisatie-id>';

-- Het eigen bedrijf vrijstellen: altijd schrijfrecht, zonder abonnement.
update organization set vrijgesteld = true where id = '<organisatie-id>';
```

`vrijgesteld` is alleen met SQL te zetten. Zoek het id op met
`select id, name, proef_einde, vrijgesteld from organization;`.

**Let op wanneer je Stripe voor het eerst aanzet.** Organisaties die al bestonden, kunnen dan al
voorbij hun proefperiode zijn: de proef telde vanaf het aanmaken, en een tweede eigen bedrijf van
dezelfde gebruiker heeft er nooit een gehad. Zo'n bedrijf is meteen alleen-lezen. Zet dus voor je
eigen bedrijf (en voor bedrijven die je bewust gratis laat werken) `vrijgesteld` op `true`, of
geef een bedrijf met een `proef_einde`-update opnieuw 30 dagen, bij voorkeur vóór je de sleutel in
`.env` zet.

### Wat de e2e-tests doen

Playwright draait met Stripe aan, tegen een nep-Stripe op `http://127.0.0.1:3199` (gestart door
`e2e/global-setup.ts`) en testwaarden die vast in `e2e/omgeving.ts` staan. Daar gaat geen verkeer
naar de echte Stripe en komen geen echte sleutels aan te pas. `STRIPE_API_BASIS` werkt alleen met
een `sk_test_`-sleutel en een lokale host (127.0.0.1 of localhost); elke andere combinatie wordt
geweigerd. Omdat Stripe daar aan staat, krijgt elke nieuwe organisatie een proef: een tweede eigen
bedrijf van een testgebruiker is meteen alleen-lezen, tenzij de test `zetVrijgesteld` gebruikt.
