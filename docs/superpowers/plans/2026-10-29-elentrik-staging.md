# Staging-omgeving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een publieke staging-omgeving op `staging.elentrik.app`, naast productie op dezelfde NAS. Ze deelt PostgreSQL (een eigen database en gebruiker) en Gotenberg, mailt alleen naar Mailpit, gebruikt Stripe-testsleutels, is herkenbaar in de app en op de PDF's, en wordt niet geïndexeerd. Daarbij komt de branchstroom `develop` → `staging` → `main`.

**Architecture:**
- **App:** een variabele `ELENTRIK_OMGEVING` (`productie` | `staging`) stuurt de stagingbalk, het watermerk, de headers voor zoekmachines en de veiligheidsgrendels in de opstartcontrole.
- **Compose:** `web-staging` en `mailpit` komen erbij. Een init-script maakt de tweede database en gebruiker aan.
- **CI:** bouwt `:staging` vanaf de branch `staging`.
- **Bijwerken:** een script werkt één omgeving tegelijk bij.

**Tech Stack:** Nuxt 4 / Nitro, Vue en Nuxt UI, `@elentrik/render` (print-HTML), PostgreSQL 16, Docker Compose, Mailpit, en GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-29-elentrik-staging-design.md` (goedgekeurd)

## Global Constraints

**Omgevingen**
- **`ELENTRIK_OMGEVING`:** `productie` of `staging`. Leeg of ontbrekend gedraagt zich als vandaag: geen balk, geen watermerk, geen noindex. Lokaal blijft het leeg.
- **Staging-indicatie:**
  - een balk die je niet kunt wegklikken, met de tekst nl "Staging: testomgeving, geen echte gegevens" en een vertaling in fr en en;
  - de paginatitel begint met "[Staging] ".
- **Watermerk:** "STAGING", groot, diagonaal en halftransparant, op elke PDF-pagina. Daaronder "Geen geldig document" in de dossiertaal (fr "Document non valable", en "Not a valid document").
- **Niet indexeren** (alleen staging): op elk antwoord de header `X-Robots-Tag: noindex, nofollow`, en `/robots.txt` geeft `User-agent: *\nDisallow: /`.
- **Grendels in de opstartcontrole:**
  - bij `staging` weigert de server `MAIL_VERZENDER=graph` en een `STRIPE_GEHEIME_SLEUTEL` die met `sk_live_` begint;
  - bij `productie` weigert hij `SMTP_HOST=mailpit`.
  - De meldingen noemen alleen namen, nooit waarden.

**Compose en NAS**
- **Diensten en containers:**
  - `web-staging` heet `elentrik-web-staging` en draait image `ghcr.io/steffbeckers/elentrik-web:staging`;
  - `mailpit` heet `elentrik-mailpit` en draait `axllent/mailpit:v1.31.4`, zoals lokaal;
  - de staging-bestanden staan in `${ELENTRIK_DATA}/staging/bestanden`.
- **Databases:** `elentrik` met gebruiker `elentrik`, en `elentrik_staging` met gebruiker `elentrik_staging`. `REVOKE CONNECT ... FROM PUBLIC` op beide, zodat elke gebruiker alleen in zijn eigen database kan.
- **`STAGING_`-variabelen in `.env`:**
  - `STAGING_POSTGRES_WACHTWOORD`, `STAGING_BETTER_AUTH_SECRET` en `STAGING_BOEKHOUDING_INBOX`;
  - `STAGING_STRIPE_GEHEIME_SLEUTEL`, `STAGING_STRIPE_WEBHOOK_GEHEIM`, `STAGING_STRIPE_PRIJS_MAAND` en `STAGING_STRIPE_PRIJS_JAAR`.

  De rest staat vast in compose: `BETTER_AUTH_URL=https://staging.elentrik.app`, `MAIL_VERZENDER=smtp`, `SMTP_HOST=mailpit`, `SMTP_PORT=1025` en `ELENTRIK_OMGEVING=staging`.
- **Geen gepubliceerde poorten.** Alles loopt via het netwerk `elentrik`.

**CI**
- **Triggers:** push en pull_request op `main`, `staging` en `develop`.
- **Images:** alleen bij een push.
  - `main` → `:latest` en `:sha-<7>`;
  - `staging` → `:staging` en `:sha-<7>`;
  - `develop` bouwt geen image.

**Projectregels**
- Alle eisen uit plan 9 blijven gelden: geen geheimen in de repo, het image of de logs, en lokaal en de e2e veranderen niet.
- Tests raken de echte database `elentrik` nooit.
- Expliciete imports in servercode die Vitest importeert.
- **Commits:** ondertekend, met exact `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Niet pushen.

## Review Focus

1. **Staging met een kopie van de productie-`.env` (live Stripe-sleutel, Graph).** De server start niet, en de melding noemt de variabelen. Test: Task 1.
2. **Een gebruiker van staging probeert de productiedatabase te openen.** De verbinding wordt geweigerd. Test: Task 3 (rooktest).
3. **Een PDF uit staging.** Elke pagina draagt het watermerk. Een productie-PDF is byte-voor-byte gelijk aan vroeger (de snapshots zijn ongewijzigd). Test: Task 2.
4. **`bijwerken.sh staging`.** Productie wordt niet herstart; de container-ID van `web` blijft gelijk. Test: Task 3.
5. **Een registratie op staging.** De mail komt in Mailpit en nergens anders. Test: Task 3.

---

### Task 1: Omgeving in de app: balk, titel, niet indexeren en grendels

**Files:**
- Create:
  - `apps/web/shared/omgeving.ts`;
  - `apps/web/server/middleware/robots.ts` (of een Nitro-routeregel);
  - `apps/web/server/routes/robots.txt.ts`;
  - `apps/web/app/components/StagingBalk.vue`.
- Modify:
  - `apps/web/nuxt.config.ts`: `runtimeConfig.public.omgeving` (in te stellen met `NUXT_PUBLIC_OMGEVING`), of de omgeving via `/api/mij`, naar keuze;
  - `apps/web/app/app.vue` en `error.vue`: de balk en het titelvoorvoegsel;
  - `apps/web/server/config/controle.ts`: de grendels;
  - `apps/web/i18n/locales/{nl,fr,en}.json`;
  - `apps/web/.env.example`.
- Test: `apps/web/test/omgeving.test.ts`, en een uitbreiding van `test/configuratie.test.ts`.

**Interfaces:**
- Produces:
  - `type Omgeving = "productie" | "staging" | null`;
  - `leesOmgeving(env): Omgeving`, die een onbekende waarde als `null` leest;
  - `isStaging(o): boolean`.
- De server leest `ELENTRIK_OMGEVING`. De client krijgt de waarde langs één weg, die de bouwer kiest.

- [ ] **Step 1: Schrijf de falende tests**
  - **`leesOmgeving`:** `"staging"`, `"productie"`, `""` → null, `"onzin"` → null.
  - **Niet indexeren:**
    - bij `staging` heeft elk antwoord (een pagina, `/api/gezondheid`, een asset-route) `X-Robots-Tag: noindex, nofollow`, en `/robots.txt` geeft `Disallow: /`;
    - bij `productie` en leeg ontbreekt de header en geeft `/robots.txt` 404, zoals vandaag.
  - **Grendels in `controleerConfiguratie`:**
    - staging met `graph` → `MAIL_VERZENDER`;
    - staging met `sk_live_…` → `STRIPE_GEHEIME_SLEUTEL`, zonder de waarde;
    - productie met `SMTP_HOST=mailpit` → `SMTP_HOST`;
    - staging met smtp/mailpit en `sk_test_` → geen probleem.
  - **Balk** (pure helper of componenttest volgens het repo-patroon): staging toont de tekst, de andere omgevingen niet. Het titelvoorvoegsel staat er alleen bij staging.
  - **Vertalingen:** de pariteitstest blijft groen, met de nieuwe sleutels in de drie talen.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
  Run: `pnpm --filter @elentrik/web exec vitest run test/omgeving.test.ts test/configuratie.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implementeer**
- [ ] **Step 4: Draai de tests, de volledige suite en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(web): staging herkenbaar, niet indexeerbaar en afgeschermd van echte mail en live betalingen"`

---

### Task 2: Watermerk op de PDF's van staging

**Files:**
- Modify:
  - `packages/render/src/print/print-html.ts`: de print-opties krijgen `watermerk?: { titel: string; ondertitel: string }`; elke pagina krijgt dan een watermerk-element;
  - `packages/render/src/teksten/{nl,fr,en}.ts`: `watermerk: { titel, ondertitel }`, met de teksten uit de Global Constraints;
  - `apps/web/server/exports/repo.ts`: bij staging geeft de export `TEKSTEN[taal].watermerk` mee.
- Test: `packages/render/test/print-html.test.ts` (uitbreiden) en `apps/web/test/exports-repo.test.ts` (uitbreiden).

**Interfaces:**
- Consumes: `leesOmgeving` (Task 1).
- Produces: de print-optie `watermerk`. Zonder die optie is de HTML **identiek** aan vandaag.

- [ ] **Step 1: Schrijf de falende tests**
  - met `watermerk` bevat elke `.pagina` precies één watermerk-element met de titel en de ondertitel;
  - zonder `watermerk` zijn de bestaande snapshots byte-voor-byte gelijk;
  - de export bij `ELENTRIK_OMGEVING=staging` bevat het watermerk in de dossiertaal (fr-project → "Document non valable"), en bij `productie` niet;
  - de pariteit van `Teksten` blijft groen.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer.** De CSS moet afdrukbaar zijn in Gotenberg/Chromium (`position: absolute` binnen de pagina, `pointer-events: none`, een lage dekking), en mag de opmaak niet verschuiven.
- [ ] **Step 4: Draai de tests, de volledige suite en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat: watermerk op de PDF's van staging"`

---

### Task 3: Compose met staging, gedeelde Postgres en Gotenberg, Mailpit, bijwerken.sh en de rooktest

**Files:**
- Create:
  - `deploy/nas/postgres-init/10-staging.sh`;
  - `deploy/nas/bijwerken.sh`.
- Modify:
  - `deploy/nas/compose.yaml`;
  - `deploy/nas/.env.voorbeeld`;
  - `deploy/nas/.env.rooktest`;
  - `deploy/nas/rooktest.sh`;
  - `.gitattributes`, alleen als dat nodig is voor de LF-regels van de nieuwe scripts.

**Interfaces:**
- **Init-script** (draait alleen bij de eerste initialisatie van een lege datamap):
  - maakt de rol `elentrik_staging` aan met het wachtwoord uit `STAGING_POSTGRES_WACHTWOORD`, en de database `elentrik_staging` met die rol als eigenaar;
  - doet `REVOKE CONNECT ON DATABASE elentrik FROM PUBLIC` en hetzelfde voor `elentrik_staging`;
  - geeft `GRANT CONNECT` alleen aan de eigen gebruiker.
- **`web-staging`:**
  - `DATABASE_URL=postgres://elentrik_staging@postgres:5432/elentrik_staging`, met `PGPASSWORD=${STAGING_POSTGRES_WACHTWOORD}`;
  - de overige waarden volgens de Global Constraints;
  - `depends_on` op postgres (healthy), gotenberg (healthy) en mailpit (started);
  - dezelfde healthcheck en restart-policy als `web`.
- **`mailpit`:**
  - geen poorten;
  - `MP_MAX_MESSAGES=500`;
  - geen authenticatie op SMTP (alleen intern).
- **`bijwerken.sh <staging|productie>`:**
  - `docker compose pull <dienst>`;
  - bij productie eerst `backup.sh --nu` via de back-updienst;
  - `docker compose up -d --no-deps <dienst>`;
  - wachten op healthy, en de image-revisie tonen (het OCI-label);
  - bij een ongeldig argument een foutcode met de gebruiksregel.

- [ ] **Step 1: Breid de rooktest eerst uit** (nieuwe stappen; de bestaande blijven):
  1. beide web-diensten worden healthy tegen één Postgres en één Gotenberg;
  2. `elentrik_staging` kan geen verbinding maken met de database `elentrik` (`psql` als `elentrik_staging` naar `elentrik` → "permission denied for database"), en omgekeerd;
  3. een registratie op staging komt in de Mailpit van de stack (via de API van die Mailpit binnen het netwerk, of tijdelijk via de override gepubliceerd op `127.0.0.1:38025`);
  4. een export op staging bevat "STAGING" in de PDF-tekst, en een export op productie niet;
  5. staging geeft `X-Robots-Tag` en `robots.txt` `Disallow: /`;
  6. `web-staging` met `MAIL_VERZENDER=graph`, of met een `sk_live_`-sleutel, wordt nooit healthy, en de log noemt de variabele;
  7. `bijwerken.sh staging` herstart alleen `web-staging`: de container-ID van `web` is vóór en na gelijk.
- [ ] **Step 2: Draai de rooktest en controleer dat hij faalt**
  Run: `bash deploy/nas/rooktest.sh`
  Expected: FAIL op de nieuwe stappen.
- [ ] **Step 3: Implementeer de compose, het init-script, `.env.voorbeeld`, `.env.rooktest` en `bijwerken.sh`**
- [ ] **Step 4: Draai de rooktest, de volledige suite, de typecheck en Playwright**
  Run: `bash deploy/nas/rooktest.sh && pnpm test && pnpm typecheck && (cd apps/web && npx playwright test)`
  Expected: alles PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(deploy): staging naast productie met gedeelde Postgres en Gotenberg en eigen Mailpit"`

---

### Task 4: CI voor de drie branches

**Files:**
- Modify: `.github/workflows/web-image.yml`.

**Interfaces:**
- **Triggers:** `push` en `pull_request` op `[main, staging, develop]`.
- **Job `image`:** draait bij een push op `main` (tags `latest` en `sha-<7>`) en bij een push op `staging` (tags `staging` en `sha-<7>`). Kies de tags met een stapuitvoer op basis van `github.ref_name`, zonder onbetrouwbare invoer in `run:`.
- Bij een push op `develop` draait alleen de testjob.

- [ ] **Step 1: Pas de workflow aan en valideer met actionlint** (dezelfde vastgepinde versie als in plan 9).
- [ ] **Step 2: Controleer de tagkeuze.** Lees een tabel van ref → tags in een kleine shelltest na, of zet `ref_name` en de tags expliciet in de workflow met een `if` per branch. Leg de controle vast in het rapport.
- [ ] **Step 3: Commit**
  `git commit -m "ci: images voor staging en productie, tests voor develop"`

---

### Task 5: Handleiding en branchstroom

**Files:**
- Modify:
  - `docs/online.md`: een **beknopte** sectie "Staging" (de gebruiker wil de handleiding niet uitgebreid);
  - `apps/web/test/deploy-docs.test.ts`, alleen als de kruiscontrole de nieuwe variabelen moet kennen;
  - `docs/lokaal-en-online.md`: één regel over de branchstroom.

**Inhoud van de sectie Staging:**
1. **Cloudflare:**
   - de public hostnames `staging.elentrik.app` → `http://elentrik-web-staging:3000` en `mailpit-staging.elentrik.app` → `http://elentrik-mailpit:8025`;
   - een Access-applicatie op `mailpit-staging.elentrik.app`, met een policy "Allow" voor het e-mailadres van de gebruiker en de eenmalige pincode.
2. **Postgres:** SQL voor een Postgres die al draait: de rol en de database aanmaken, en `REVOKE` en `GRANT`.
3. **`.env`:** de `STAGING_`-variabelen.
4. **Stripe:** de test-webhook naar `https://staging.elentrik.app/api/stripe/webhook` met API-versie `2026-09-30.endive`, en de testprijzen.
5. **Bijwerken:** eerst `./bijwerken.sh staging` en controleren, dan `./bijwerken.sh productie`.
6. **Branchstroom:** werk op `develop`; een PR `develop` → `staging` rolt staging uit (na `bijwerken.sh staging`); een PR `staging` → `main` doet hetzelfde voor productie.

- [ ] **Step 1: Schrijf de sectie.** Controleer elke naam, elk pad en elke variabele tegen `compose.yaml`, `.env.voorbeeld` en `bijwerken.sh`.
- [ ] **Step 2: Draai `pnpm test`** (inclusief de kruiscontrole). Expected: PASS.
- [ ] **Step 3: Commit**
  `git commit -m "docs: staging-omgeving en branchstroom"`

---

### Na de uitvoering (controller, met toestemming van de gebruiker)

Na de merge van PR #9:
1. Maak de branches `develop` en `staging` aan vanaf `main` en push ze.
2. Stel `develop` in als standaardbranch (`gh repo edit --default-branch develop`).
3. Zet deze branch op `develop` en open de PR naar `develop`.
