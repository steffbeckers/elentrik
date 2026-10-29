# Online op de NAS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elentrik draait in productie op de Synology NAS van de gebruiker, achter de Cloudflare Tunnel op `elentrik.app`, met een image uit GitHub Actions, mail via Microsoft Graph, nachtelijke back-ups en een handleiding.

**Architecture:**
- **Server:** de webapp wordt productierijp. Hij vertrouwt `CF-Connecting-IP` alleen vanuit het netwerk van de tunnel, heeft een health-route en een opstartcontrole, kan mailen via Graph, en haalt gemiste Stripe-meldingen elk uur in.
- **Image:** een multi-stage Dockerfile. Het image voert de migraties uit vóór de server start.
- **Compose:** `deploy/nas/compose.yaml` beschrijft `web`, `postgres`, `gotenberg` en `backup` op het netwerk `elentrik`, zonder gepubliceerde poorten.
- **CI:** GitHub Actions test, bouwt en pusht naar GHCR.

**Tech Stack:** Nuxt 4 / Nitro (Node 24), Drizzle met `postgres`, Better Auth 1.7.7, Stripe SDK 23, Docker en Docker Compose, GitHub Actions, en de Microsoft Graph REST API.

**Spec:** `docs/superpowers/specs/2026-10-29-elentrik-online-design.md` (goedgekeurd)

## Global Constraints

**Namen en vaste waarden**
- **Namen:** de dienst heet `web`, de container `elentrik-web` en het image `ghcr.io/steffbeckers/elentrik-web`, met tags `latest` en de korte SHA. Het Docker-netwerk heet `elentrik`, met subnet `172.30.70.0/24`. De map `apps/web` blijft.
- **Env (nieuw):** `ELENTRIK_VERTROUWD_PROXYNET`, `MAIL_VERZENDER` (`smtp` | `graph`, standaard `smtp`), `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_GEHEIM`, `MAIL_AFZENDER`.
- **Env (bestaand):** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NUXT_AUTH_BASIS_URL`, `ELENTRIK_BESTANDEN_DIR`, `ELENTRIK_GOTENBERG_URL`, `SMTP_*`, `STRIPE_*`, `BOEKHOUDING_INBOX`.
- **Health-route:** `GET /api/gezondheid` is publiek (`{ publiek: true }` en in `PUBLIEKE_ROUTES`). Hij geeft `200 { ok: true }` of `503 { ok: false }`.
- **Back-up:** elke nacht om 03:00 (Europe/Brussels) een `pg_dump -Fc`, die 30 dagen bewaard wordt.
- **Inhaaltaak:** elk uur. Hij synchroniseert `active`, `trialing` of `past_due` met een `periode_einde` van meer dan 1 dag geleden, of een rij die langer dan 24 uur niet werd bijgewerkt. Daarnaast stuurt hij betaalde facturen van de laatste 7 dagen alsnog door.
- **Versies:**
  - Gotenberg `gotenberg/gotenberg:8.37.0-chromium` met `--api-timeout=65s`;
  - PostgreSQL `postgres:16-alpine` (exacte minor-tag);
  - een Node-basis `node:24-slim` (exacte tag, minstens twee weken oud);
  - GitHub actions op vaste versies.

**Veiligheid en geheimen**
- **Geheimen** komen nooit in de repo, in het image, in logs of in foutmeldingen. Meldingen noemen de **naam** van een variabele, nooit de waarde.
- **Geen gepubliceerde poorten** in `deploy/nas/compose.yaml`. Alleen de rooktest publiceert tijdelijk op `127.0.0.1`.
- **Lokale ontwikkeling** (`127.0.0.1`, Mailpit, de e2e met `elentrik_e2e`) gedraagt zich ongewijzigd.

**Projectregels**
- **Tests:** de echte database `elentrik` en `apps/web/.data/bestanden` worden nooit geraakt. Vitest gebruikt PGlite, Playwright `elentrik_e2e`.
- **Expliciete imports** in servercode die Vitest importeert (ruling E1).
- **Commits:** ondertekend (1Password; nooit `--no-gpg-sign`), met de afsluiting exact `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Niet pushen.

## Review Focus

1. **Een verzoek van buiten de tunnel met een vervalste `CF-Connecting-IP`.** Elentrik negeert de header en gebruikt het socket-IP. Test: Task 1.
2. **Een update met een migratie die faalt.** De container stopt met een foutcode en de server neemt geen verzoeken aan. Er ontstaat geen half gestarte app. Test: Task 4 (rooktest met een kapotte migratie in een tijdelijke kopie).
3. **Een Graph-token dat verloopt tijdens een lange looptijd.** Het token wordt tijdig vernieuwd, en een 401 leidt tot één nieuwe poging met een vers token. Test: Task 2.
4. **Een productiestart met een ontbrekende of gedeeltelijke configuratie.** De server start niet en noemt de variabele bij naam. Test: Task 1.
5. **Een Stripe-melding die de NAS miste terwijl hij offline was.** Binnen het uur na de herstart staat het abonnement correct, en de factuur is precies één keer doorgestuurd. Test: Task 3.

---

### Task 1: IP-vertrouwen, health-route en opstartcontrole

**Files:**
- Modify:
  - `apps/web/server/auth/ip.ts`: `metSocketIp(verzoek, ip, vertrouwdNet?)`, of een nieuwe functie `clientIp(verzoek, socketIp, vertrouwdNet)` die `metSocketIp` gebruikt;
  - `apps/web/server/api/auth/[...all].ts`;
  - de eigen IP-limieten, als die op IP werken (zoek op het gebruik van het socket-IP in `server/`);
  - `apps/web/test/routes.ts` (`PUBLIEKE_ROUTES`);
  - `apps/web/test/toegang.test.ts` (een rij voor `GET /api/gezondheid`);
  - `apps/web/.env.example`.
- Create:
  - `apps/web/server/net.ts`: `inSubnet(ip, cidr)` en `isIp(x)`, voor IPv4 en IPv6;
  - `apps/web/server/api/gezondheid.get.ts`;
  - `apps/web/server/config/controle.ts`;
  - `apps/web/server/plugins/configuratie.ts`.
- Test: `apps/web/test/proxy-ip.test.ts`, `apps/web/test/gezondheid.test.ts`, `apps/web/test/configuratie.test.ts`.

**Interfaces:**
- Produces:
  - `clientIp(headers: Headers, socketIp: string | undefined, vertrouwdNet: string | undefined): string | undefined`. Valt `socketIp` in `vertrouwdNet` en is `cf-connecting-ip` een geldig IP, dan wordt dat het client-IP. Anders blijft het `socketIp`.
  - `controleerConfiguratie(env: Record<string, string | undefined>): string[]`: de lijst met problemen, met alleen namen. Hij controleert:
    - de verplichte variabelen: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ELENTRIK_BESTANDEN_DIR` en `ELENTRIK_GOTENBERG_URL`;
    - `MAIL_VERZENDER=graph` vraagt de vier `GRAPH_*`/`MAIL_AFZENDER`-variabelen;
    - een Stripe-sleutel vraagt beide prijzen en het webhookgeheim (hergebruik `leesAbonnementConfig`, waar mogelijk);
    - `ELENTRIK_VERTROUWD_PROXYNET` moet, als hij gezet is, een geldige CIDR zijn.
  - De plugin gooit in productie (`NODE_ENV=production`) bij problemen een `Error` met de namen; anders volgt een `console.warn`.

- [ ] **Step 1: Schrijf de falende tests**
  - **`clientIp`:**
    - socket `172.30.70.5`, net `172.30.70.0/24` en de header `203.0.113.7` → `203.0.113.7`;
    - socket `198.51.100.1` met dezelfde header → `198.51.100.1`;
    - socket in het net met de header `onzin` → het socket-IP;
    - geen net → het socket-IP;
    - een IPv6-header `2001:db8::1` met de socket in het net → die header.
  - **`inSubnet`:** de grenzen `/24` en `/32` en IPv6 `/64`; een ongeldige CIDR geeft false.
  - **Auth-route:** de bestaande `metSocketIp`-tests blijven groen. Een nieuwe test toont dat Better Auth `x-forwarded-for` gelijk aan de header ziet als de socket in het net zit, en anders gelijk aan het socket-IP.
  - **`/api/gezondheid`:** met PGlite 200 `{ ok: true }`; met een db die gooit 503 `{ ok: false }`, zonder foutdetails in de body.
  - **Routetabel:** de rij met publiek 200 voor elke actor.
  - **`controleerConfiguratie`:**
    - een volledige env → `[]`;
    - elke verplichte variabele die ontbreekt → haar naam;
    - `MAIL_VERZENDER=graph` zonder `GRAPH_CLIENT_GEHEIM` → die naam;
    - `STRIPE_GEHEIME_SLEUTEL` zonder `STRIPE_WEBHOOK_GEHEIM` → die naam;
    - een ongeldige CIDR → `ELENTRIK_VERTROUWD_PROXYNET`;
    - geen enkele melding bevat een waarde (test met een waarde als `geheim-xyz`).
  - **Plugin:** in productie een throw, anders een warn.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
  Run: `pnpm --filter @elentrik/web exec vitest run test/proxy-ip.test.ts test/gezondheid.test.ts test/configuratie.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implementeer `net.ts`, `clientIp`, de wiring in de auth-route en de IP-limieten, de health-route, de controle en de plugin, en documenteer de nieuwe variabelen zonder waarden in `.env.example`.**
- [ ] **Step 4: Draai de tests, de volledige suite en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(web): bezoekers-IP achter de tunnel, gezondheidsroute en opstartcontrole"`

---

### Task 2: Mail via Microsoft Graph

**Files:**
- Create: `apps/web/server/mail/graph.ts`.
- Modify: `apps/web/server/mail/verzend.ts`: `gebruikVerzender()` kiest op basis van `MAIL_VERZENDER`; `apps/web/.env.example`.
- Test: `apps/web/test/mail-graph.test.ts`.

**Interfaces:**
- Consumes: `Mail` (incl. `bijlagen`) en `Verzender` uit `verzend.ts`.
- Produces:
  - `type GraphConfig = { tenantId: string; clientId: string; clientGeheim: string; afzender: string }`;
  - `maakGraphVerzender(config: GraphConfig, fetchFn: typeof fetch = fetch, nu: () => number = Date.now): Verzender`.

  Het gedrag van de Graph-verzender:
  - **Token:** `POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`, form met `client_id`, `client_secret`, `grant_type=client_credentials` en `scope=https://graph.microsoft.com/.default`.
  - **Hergebruik:** het token wordt hergebruikt tot 5 minuten vóór `expires_in` afloopt.
  - **Versturen:** `POST https://graph.microsoft.com/v1.0/users/{afzender}/sendMail` met `{ message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: aan } }], attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name, contentType, contentBytes: base64 }] }, saveToSentItems: false }`.
  - **Antwoord:** een 202 betekent succes.
  - **401:** het token wordt vergeten en de verzender probeert één keer opnieuw.
  - **Andere niet-2xx-antwoorden:** een `Error` met de status en de Graph-foutcode, maar **zonder** geheim of token.
- **`gebruikVerzender()`:** bij `MAIL_VERZENDER=graph` de Graph-verzender, met de config uit env; anders de bestaande SMTP-verzender. Lokaal gedraagt alles zich ongewijzigd.

- [ ] **Step 1: Schrijf de falende tests (met een nep-`fetch`)**
  - de vorm van de tokenaanvraag, met de URL, de form-velden en de scope;
  - het `sendMail`-pad en de body, met ontvanger, onderwerp en HTML;
  - een bijlage wordt base64 met het juiste `@odata.type`;
  - twee mails binnen de geldigheid → één tokenaanvraag; na de verlooptijd min 5 minuten → een nieuwe;
  - een 401 op `sendMail` → een nieuw token en een tweede poging. Lukt die, dan volgt geen fout; een tweede 401 geeft wel een fout;
  - een 500 gooit, en de fouttekst bevat noch het geheim noch het token;
  - `gebruikVerzender` met `MAIL_VERZENDER=graph` geeft de Graph-verzender, en zonder de variabele SMTP.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
  Run: `pnpm --filter @elentrik/web exec vitest run test/mail-graph.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implementeer `graph.ts` en de keuze in `verzend.ts`**
- [ ] **Step 4: Draai de tests, de volledige suite en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(web): mail versturen via Microsoft Graph"`

---

### Task 3: Gemiste Stripe-meldingen elk uur inhalen

**Files:**
- Create:
  - `apps/web/server/abonnementen/inhalen.ts`;
  - `apps/web/server/tasks/abonnementen/inhalen.ts` (de Nitro-taak).
- Modify:
  - `apps/web/server/abonnementen/stripe.ts`: `betaaldeFacturen(sinds)` op de poort;
  - `apps/web/test/nep-stripe.ts`;
  - `apps/web/e2e/hulp/nep-stripe.ts`: `GET /v1/invoices` met een lege lijst;
  - `apps/web/nuxt.config.ts`: `nitro.experimental.tasks: true` en `nitro.scheduledTasks: { "0 * * * *": ["abonnementen:inhalen"] }`.
- Test: `apps/web/test/abonnement-inhalen.test.ts`.

**Interfaces:**
- Consumes:
  - `synchroniseerKlant(db, stripe, prijzen, klantId, nu?)`;
  - `stuurFactuurDoor(db, stripe, inbox, factuurId)` (idempotent, en alleen voor bekende klanten via de webhooklogica). Controleer of `stuurFactuurDoor` zelf op een bekende klant controleert; doet hij dat niet, dan filtert de inhaaltaak vooraf op klanten met een rij in `abonnementen`;
  - `gebruikAbonnementen()`.
- Produces:
  - `StripePoort.betaaldeFacturen(sinds: Date): Promise<StripeFactuur[]>`: `invoices.list({ status: "paid", created: { gte } })`, met paginering;
  - `haalGemisteMeldingenIn(db: Db, stripe: StripePoort, config: AbonnementConfig, nu?: Date): Promise<{ gesynchroniseerd: number; doorgestuurd: number }>`:
    - onder `pg_try_advisory_lock(hashtext('abonnementen:inhalen'))`; is het lock bezet, dan `{0,0}` zonder werk;
    - met abonnementen uit `{0,0}`.

- [ ] **Step 1: Schrijf de falende tests (PGlite en de nep-poort)**
  - **Selectie:**
    - een rij `active` met `periode_einde = nu − 1 d − 1 ms` → gesynchroniseerd;
    - met `nu − 1 d + 1 ms` en `bijgewerkt` recent → niet;
    - `bijgewerkt = nu − 24 u − 1 ms` → wel;
    - `canceled` → nooit.
  - **Facturen:**
    - de nep-poort geeft 3 betaalde facturen: één van een bekende klant die nog niet doorgestuurd is (→ 1 mail), één die al in `doorgestuurde_facturen` staat (→ geen), en één van een onbekende klant (→ geen);
    - `betaaldeFacturen` krijgt `sinds = nu − 7 d`.
  - **Uitgeschakeld:** abonnementen uit → `{0,0}` en geen poortaanroepen.
  - **Lock:** een tweede gelijktijdige run (het lock vooraf vasthouden in de test) → `{0,0}`.
  - **SDK-draadformaat** (de bestaande lokale SDK-server-test): `betaaldeFacturen` vraagt `status=paid` en `created[gte]`, en volgt `has_more`.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
  Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-inhalen.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implementeer de poortmethode, `haalGemisteMeldingenIn`, de Nitro-taak en de config, en vul de e2e-nep aan**
- [ ] **Step 4: Draai de tests, de volledige suite en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(web): gemiste Stripe-meldingen en facturen elk uur inhalen"`

---

### Task 4: Docker-image, migraties bij het opstarten, compose voor de NAS en rooktest

**Files:**
- Create:
  - `apps/web/Dockerfile`;
  - `.dockerignore` (repo-root);
  - `apps/web/docker/migreer.mjs`;
  - `apps/web/docker/start.sh`;
  - `deploy/nas/compose.yaml`;
  - `deploy/nas/.env.voorbeeld`;
  - `deploy/nas/backup.sh`;
  - `deploy/nas/rooktest.sh`;
  - `deploy/nas/.env.rooktest`, met alleen niet-geheime testwaarden.
- Modify: `apps/web/nuxt.config.ts`, alleen als dat nodig is voor de productie-build, zonder lokaal gedrag te veranderen.

**Interfaces:**
- **Image:**
  - Het image bouwt vanuit de repo-root: `docker build -f apps/web/Dockerfile -t elentrik-web .`.
  - Het draait als een niet-root-gebruiker.
  - De `EXPOSE 3000`-poort.
  - `HEALTHCHECK` op `http://127.0.0.1:3000/api/gezondheid`.
  - Entrypoint `start.sh`: `node migreer.mjs` (Drizzle-migraties uit `server/db/migraties` met de `postgres`-driver). Bij een fout stopt hij met exit 1; anders `exec node .output/server/index.mjs`.
- **SSR-auth binnen de container:**
  - `NUXT_AUTH_BASIS_URL=http://127.0.0.1:3000` in `.env.voorbeeld`;
  - `BETTER_AUTH_URL=https://elentrik.app`.
  - De rooktest bewijst dat een SSR-pagina met een sessie werkt: inloggen via de API en daarna `GET /` met een cookie geeft de aangemelde pagina. Vraagt dat een codewijziging (bv. dat de server de `Origin` of `Host` voor interne aanroepen goed zet), dan maakt die wijziging deel uit van deze taak, met een unittest.
- **`deploy/nas/compose.yaml`:**
  - **Diensten:** `web`, `postgres`, `gotenberg` en `backup`.
  - **Netwerk:** `networks.elentrik` met `name: elentrik` en `ipam.config[0].subnet: 172.30.70.0/24`.
  - **Mappen:** bind mounts onder `${ELENTRIK_DATA}` (`postgres`, `bestanden`, `backups`).
  - **Opstartvolgorde:** `depends_on` met `condition: service_healthy` voor `postgres`.
  - **Overige instellingen:** `restart: unless-stopped`, `TZ=Europe/Brussels`. `ELENTRIK_VERTROUWD_PROXYNET=172.30.70.0/24` voor `web`. **Geen** `ports:`.
- **`deploy/nas/.env.voorbeeld`:** elke variabele met uitleg en zonder geheime waarden, plus `ELENTRIK_DATA`, `ELENTRIK_UID` en `ELENTRIK_GID`.
- **`backup.sh`:** een lus die wacht tot de volgende 03:00 (Europe/Brussels), `pg_dump -Fc` schrijft naar `/backups/elentrik-YYYYMMDD-HHMM.dump` (eerst als `.tmp`, dan hernoemd), en dumps ouder dan 30 dagen verwijdert.
- **`rooktest.sh`:** zie Step 1.

- [ ] **Step 1: Schrijf de rooktest eerst** (`deploy/nas/rooktest.sh`, bash; draait op de ontwikkelmachine met Docker Desktop)
  - Hij bouwt het image en maakt een tijdelijke `ELENTRIK_DATA`-map.
  - Hij start compose met `.env.rooktest` en een override-bestand dat alleen `web` op `127.0.0.1:3399` publiceert. Mailpit (lokaal) is de SMTP-host.
  - Hij wacht op `/api/gezondheid` 200 en controleert:
    1. de migraties staan in de database (`__drizzle_migrations` telt alle migraties);
    2. `/inloggen` geeft 200 en HTML;
    3. registreren en bevestigen via de API en Mailpit, dan inloggen, en `GET /` met de cookie toont de aangemelde pagina (SSR-auth);
    4. een project aanmaken en een export maken (Gotenberg) geeft een PDF;
    5. `backup.sh` eenmalig draaien (een `--nu`-vlag) maakt een `.dump` die met `pg_restore --list` leesbaar is;
    6. een kopie van het image met een opzettelijk kapotte extra migratie start niet: exitcode ≠ 0, en de health wordt nooit 200.
  - Daarna ruimt hij alles op: containers, netwerk en de tijdelijke map.
- [ ] **Step 2: Draai de rooktest en controleer dat hij faalt** (er is nog geen Dockerfile)
  Run: `bash deploy/nas/rooktest.sh`
  Expected: FAIL.
- [ ] **Step 3: Implementeer de Dockerfile, `.dockerignore`, `migreer.mjs`, `start.sh`, `compose.yaml`, `.env.voorbeeld` en `backup.sh` (en een eventuele SSR-auth-fix met unittest)**
- [ ] **Step 4: Draai de rooktest, de volledige suite, de typecheck en Playwright**
  Run: `bash deploy/nas/rooktest.sh && pnpm test && pnpm typecheck && (cd apps/web && npx playwright test)`
  Expected: alles PASS. Lokaal is niets veranderd.
- [ ] **Step 5: Commit**
  `git commit -m "feat: Docker-image en compose voor de NAS met back-ups en rooktest"`

---

### Task 5: GitHub Actions: testen, bouwen en pushen naar GHCR

**Files:**
- Create: `.github/workflows/web-image.yml`.

**Interfaces:**
- **Triggers:** `push` op `main` en `pull_request` naar `main`.
- **Job `test`:** checkout, Node 24, pnpm met cache, `pnpm install --frozen-lockfile`, `pnpm test` en `pnpm typecheck`.
- **Job `image`:**
  - `needs: test`;
  - loopt alleen bij een push op `main`;
  - `permissions: { contents: read, packages: write }`;
  - login op `ghcr.io` met `GITHUB_TOKEN`;
  - buildx-build met `apps/web/Dockerfile` en context `.`;
  - tags `ghcr.io/steffbeckers/elentrik-web:latest` en `:sha-<korte sha>`;
  - labels `org.opencontainers.image.source` (voor publieke koppeling aan de repo) en `revision`.
- Elke action staat op een vaste versie (major.minor.patch of commit-SHA).

- [ ] **Step 1: Valideer de workflow lokaal** met `actionlint` (via `npx`/`docker run rhysd/actionlint:<versie>`, vastgepind). Schrijf de workflow, draai actionlint en controleer dat hij eerst faalt op een ontbrekend bestand en daarna slaagt.
- [ ] **Step 2: Controleer de jobs droog.** `pnpm test` en `pnpm typecheck` slagen lokaal, en het image bouwt lokaal met dezelfde context (`docker build -f apps/web/Dockerfile .`).
- [ ] **Step 3: Commit**
  `git commit -m "ci: web-image testen, bouwen en naar GHCR pushen"`
- [ ] **Step 4: Na de merge** (de controller of de gebruiker): controleer de eerste run op GitHub, en zet het package `elentrik-web` in GHCR op publiek. Dat staat in `docs/online.md` (Task 6).

---

### Task 6: Handleiding `docs/online.md`

**Files:**
- Create: `docs/online.md`.
- Modify: `docs/lokaal-en-online.md`: een verwijzing naar `docs/online.md` bij "online gaan", en verouderde online-notities bijwerken (bv. de proxy- en rate-limitopmerking is nu opgelost).

**Inhoud:** in het Nederlands, stap voor stap, volgens spec §4.4 (8 secties). Met concrete commando's:
- `docker network connect elentrik <naam>`;
- de SQL voor `vrijgesteld`;
- `pg_restore` naar een tijdelijke database voor de hersteltest;
- `docker compose pull && docker compose up -d` (of de Container Manager-stappen).

Daarnaast bevat de handleiding:
- een checklist van alle env-variabelen met waar je ze vindt;
- een sectie "Gegevens meenemen van je ontwikkelmachine" (optioneel: `pg_dump` lokaal, `pg_restore` op de NAS, en de map `bestanden` kopiëren);
- de vervaldatum van het Graph-geheim in de agenda zetten;
- het GHCR-package publiek zetten na de eerste build.

- [ ] **Step 1: Schrijf de handleiding.** Controleer elk commando, elke variabelenaam, elk pad en elke poort tegen `deploy/nas/*` en `apps/web/.env.example`.
- [ ] **Step 2: Kruiscontrole.** Elke variabele in `deploy/nas/.env.voorbeeld` komt in de handleiding voor en omgekeerd (een kort script of een test `test/deploy-docs.test.ts` die beide vergelijkt).
- [ ] **Step 3: Commit**
  `git commit -m "docs: handleiding online op de NAS"`
