# Elentrik: staging-omgeving (ontwerp)

- **Datum:** 2026-10-29
- **Status:** goedgekeurd
- **Bouwt voort op:** plan 9 "Online op de NAS" (`docs/superpowers/specs/2026-10-29-elentrik-online-design.md`). PR #9 wordt eerst gemerged; dit plan komt daarbovenop.
- **Beslist met de gebruiker:**
  - **Domeinen:**
    - een staging-omgeving op `staging.elentrik.app`, gekoppeld aan de testomgeving van Stripe;
    - aanpassingen gaan eerst naar staging, dan naar productie op `elentrik.app`.
  - **Branches:**
    - `main` is productie en `staging` is staging;
    - `develop` is de branch voor de algemene ontwikkeling en wordt de standaardbranch.
  - **Gedeelde hosting:**
    - productie en staging delen dezelfde Gotenberg-container en dezelfde PostgreSQL-container, met twee databases;
    - staging verstuurt nooit echte mails; daarvoor komt er een extra Mailpit-container.
  - **Zichtbaarheid:**
    - Mailpit staat achter Cloudflare Access, op `mailpit-staging.elentrik.app`. Het adres `mailpit.staging.elentrik.app` valt buiten het gratis Universal SSL-certificaat, dat maar één niveau onder het domein dekt.
    - Staging is publiek, met een duidelijke indicatie in de app en een watermerk op de PDF's.
    - Zoekmachines mogen staging niet indexeren.
- **Mijn keuzes:** alle andere keuzes in dit document.

## 1. Waarom

Zodra Elentrik echte klanten heeft, mag een wijziging niet rechtstreeks in productie belanden. Staging is een kopie van productie met een eigen database, waar de gebruiker:
- een nieuwe versie eerst uitprobeert, ook de databasemigraties;
- de betaalstroom test met Stripe-testkaarten;
- de app zonder risico aan een testklant kan tonen.

Gedeelde containers houden het licht voor de NAS.

## 2. Doelen, niet-doelen en anti-doelen

**Doelen**

1. **Branches en images:**
   - `develop` is de standaardbranch; nieuwe werk-PR's gaan daarnaartoe.
   - Promoveren gebeurt met PR's: `develop` → `staging` → `main`.
   - **GitHub Actions** test elke push en elke PR naar deze drie branches (unit en typecheck, zoals nu).
   - Een push op `staging` bouwt en pusht `ghcr.io/steffbeckers/elentrik-web:staging` en `:sha-<7>`.
   - Een push op `main` doet hetzelfde met `:latest` en `:sha-<7>`, zoals nu.
   - `develop` bouwt geen image (mijn keuze).
2. **Eén compose-project op de NAS** (`deploy/nas/compose.yaml`), uitgebreid. De diensten:
   - **`web`:** productie, image `:latest`, database `elentrik`, met de bestanden in `${ELENTRIK_DATA}/bestanden`.
   - **`web-staging`:** container `elentrik-web-staging`, image `:staging`, database `elentrik_staging`, met de bestanden in `${ELENTRIK_DATA}/staging/bestanden`.
   - **`postgres`:** gedeeld. Twee databases, elk met een eigen gebruiker en wachtwoord: `elentrik`/`elentrik` en `elentrik_staging`/`elentrik_staging`. Geen van beide gebruikers kan aan de andere database (mijn keuze).
   - **`gotenberg`:** gedeeld.
   - **`mailpit`:** container `elentrik-mailpit`. Alleen staging stuurt ernaartoe (SMTP op `mailpit:1025`). De interface draait op poort 8025, binnen het netwerk.
   - **`backup`:** alleen de productiedatabase, zoals nu. Staging krijgt geen back-up (mijn keuze).
   - Nog altijd geen gepubliceerde poorten, en alles op het netwerk `elentrik`.
3. **Configuratie:** één `.env`. De waarden van staging krijgen het voorvoegsel `STAGING_`, bv. `STAGING_BETTER_AUTH_SECRET`, `STAGING_STRIPE_GEHEIME_SLEUTEL` en `STAGING_POSTGRES_WACHTWOORD`. Compose zet ze om naar de gewone namen voor `web-staging` (mijn keuze). Staging krijgt:
   - een eigen `BETTER_AUTH_SECRET`;
   - `BETTER_AUTH_URL=https://staging.elentrik.app`;
   - de Stripe-testsleutels, met een eigen webhookgeheim;
   - `MAIL_VERZENDER=smtp` met `SMTP_HOST=mailpit`;
   - een lege `BOEKHOUDING_INBOX`, of een adres dat ook in Mailpit eindigt.
4. **Een omgevingsvariabele `ELENTRIK_OMGEVING`** met de waarden `productie` en `staging`. Is ze niet gezet, dan geldt het huidige gedrag: geen indicatie (mijn keuze).
   - **Indicatie in de app:** bij `staging` toont elke pagina bovenaan een opvallende, niet-wegklikbare balk: "Staging: testomgeving, geen echte gegevens", in nl/fr/en. De paginatitel krijgt het voorvoegsel "[Staging]" (mijn keuze).
   - **Watermerk:** elke pagina van elke PDF krijgt een diagonaal, halftransparant watermerk "STAGING", met daaronder "Geen geldig document" in de dossiertaal (mijn keuze voor de tekst). Productie verandert niet.
   - **Niet indexeren:** bij `staging` krijgt elk antwoord de header `X-Robots-Tag: noindex, nofollow`, en `/robots.txt` geeft `Disallow: /`. Productie verandert niet.
5. **Veiligheidsgrendels in de opstartcontrole** (plan 9). Bij `ELENTRIK_OMGEVING=staging` weigert de server te starten als:
   - `MAIL_VERZENDER=graph`: staging mag geen echte mails versturen;
   - een Stripe-sleutel met `sk_live_` begint: staging gebruikt alleen testsleutels.

   Bij `ELENTRIK_OMGEVING=productie` weigert hij te starten met `SMTP_HOST=mailpit`: productie mag geen mails in Mailpit laten verdwijnen (mijn keuze).
6. **Cloudflare** (in de handleiding):
   - de public hostname `staging.elentrik.app` → `http://elentrik-web-staging:3000`;
   - de public hostname `mailpit-staging.elentrik.app` → `http://elentrik-mailpit:8025`, met een Access-applicatie die alleen het e-mailadres van de gebruiker toelaat (eenmalige code);
   - de Stripe-test-webhook → `https://staging.elentrik.app/api/stripe/webhook`.
7. **Bijwerken:** `deploy/nas/bijwerken.sh staging|productie` haalt het juiste image op en maakt alleen die dienst opnieuw aan (`pull` + `up -d --no-deps <dienst>`). Het script maakt eerst een dump als het om productie gaat (mijn keuze), en geeft daarna de gezondheid en de image-revisie weer.
8. **Rooktest uitgebreid:**
   - beide web-diensten starten tegen dezelfde Postgres, met elk hun eigen database;
   - staging kan niet in de database van productie (rechten);
   - een registratie op staging komt in Mailpit terecht;
   - een staging-PDF bevat het watermerk, en een productie-PDF niet;
   - `X-Robots-Tag` en `robots.txt` op staging;
   - staging met `MAIL_VERZENDER=graph` of een `sk_live_`-sleutel weigert te starten.

**Niet-doelen**
- De Mailpit-inhoud bewaren na een herstart. Mailpit houdt de berichten in het geheugen, met een maximum van 500 (mijn keuze).
- Productiegegevens automatisch naar staging kopiëren (anonimiseren is een apart onderwerp).
- Previews per PR, of een derde omgeving.
- Automatisch uitrollen naar de NAS.
- De marketingsite op `elentrik.be`.

**Anti-doelen**
- Staging die een echte klant mailt, of een echte factuur naar de boekhouding stuurt.
- Staging die met live Stripe-sleutels betalingen int.
- Staging die productiegegevens kan lezen of wijzigen, of omgekeerd.
- Een staging-PDF die voor een echt keuringsdossier kan doorgaan.
- Staging die in zoekresultaten verschijnt.
- Een update van staging die productie herstart, of omgekeerd.

## 3. Randvoorwaarden

- **Bestaande opbouw:** alles uit plan 9 blijft gelden: geen open poorten, geen geheimen in de repo, het image of de logs, en lokaal verandert er niets.
- **Postgres-initialisatie:** een init-script in `deploy/nas/postgres-init/` maakt bij de eerste start de tweede database en gebruiker aan, met het wachtwoord uit env. Voor een Postgres die al draait, geeft de handleiding de SQL voor hetzelfde.
- **Beperkte rechten:** elke web-dienst maakt verbinding met haar eigen gebruiker. Die is eigenaar van haar eigen database en heeft geen rechten op de andere. `migreer.mjs` werkt met die gebruiker.
- **Branches op GitHub:**
  - Het aanmaken van `develop` en `staging` vanaf `main`, en het instellen van `develop` als standaardbranch, zijn handelingen op de GitHub-repo.
  - De controller doet ze alleen na een expliciete bevestiging van de gebruiker, of de handleiding beschrijft ze.
  - Vanaf dan gaan werk-PR's naar `develop`.

## 4. Wat aan de bouwer overblijft

- de vorm van de stagingbalk binnen Nuxt UI, en de exacte watermerk-CSS (dekking, hoek, grootte) in de print-HTML;
- de ontsnapping van het wachtwoord in het Postgres-init-script;
- de opbouw van `bijwerken.sh`;
- of de omgeving via `runtimeConfig.public` of via `/api/mij` naar de client gaat;
- de nieuwe rooktest-stappen.
