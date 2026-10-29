# Elentrik: online op de NAS (ontwerp)

- **Datum:** 2026-10-29
- **Status:** goedgekeurd
- **Bouwt voort op:**
  - de MVP-spec §8 "Hosting";
  - de opvolgpunten van plan 6 (proxy en rate limiting);
  - de opvolgpunten van plan 7 (gemiste webhooks, opstartcontrole);
  - `docs/lokaal-en-online.md`.
- **Beslist met de gebruiker:**
  - **Hosting:** de app draait op de Synology DS918+ van de gebruiker (Intel x86_64), in Docker. Het compose-project start via Container Manager of de Docker-app.
  - **Bereikbaarheid:** via de bestaande Cloudflare Tunnel. `cloudflared` draait al als container op de NAS.
  - **Domeinen:** de app komt op `elentrik.app`. `elentrik.be` blijft voor een latere marketingsite, en valt buiten dit plan.
  - **Namen:** de dienst heet `web`, en de map `apps/web` blijft zoals ze is.
  - **Bestanden en back-ups:** ze staan in mappen op de NAS. Hyper Backup neemt ze mee naar een externe SSD en via Cloud Sync naar OneDrive.
  - **Mail:** via de eigen Microsoft 365-tenant (Exchange Online Plan 1). `elentrik.app` wordt een domein in die tenant.
- **Mijn keuzes:** alle andere keuzes in dit document.

## 1. Waarom

Elentrik is functioneel klaar voor de eerste klanten, maar draait nog alleen op `127.0.0.1`. Om echt te verkopen moet het veilig bereikbaar zijn op een eigen domein, zonder dure hosting.

De gebruiker heeft al een NAS met Docker en een Cloudflare Tunnel. Daarmee is Elentrik online te krijgen:
- zonder open poorten;
- met HTTPS en bescherming van Cloudflare;
- met back-ups in een systeem dat de gebruiker al vertrouwt.

Later kan dezelfde compose naar een VPS verhuizen.

## 2. Doelen, niet-doelen en anti-doelen

**Doelen**

1. **Een Docker-image van de webapp:** `ghcr.io/steffbeckers/elentrik-web`.
   - Gebouwd door GitHub Actions bij elke push naar `main`, met de tags `latest` en de korte commit-SHA.
   - Het image is publiek in GHCR, zodat de NAS het zonder login kan ophalen. Het bevat geen geheimen; de code is al publiek (mijn keuze).
   - Vóór het bouwen draaien de unittests en de typecheck. Het image wordt alleen gepusht als die slagen (mijn keuze).
2. **Een compose-project voor de NAS:** `deploy/nas/compose.yaml`, met `deploy/nas/.env.voorbeeld`. Diensten:
   - **`web`** (container `elentrik-web`): het image hierboven. Hij voert de databasemigraties zelf uit bij het opstarten, vóór hij verzoeken aanneemt. Een health-check bewaakt hem, en `restart: unless-stopped`.
   - **`postgres`:** PostgreSQL 16 (alpine), met de data in een map op de NAS.
   - **`gotenberg`:** dezelfde vastgepinde versie als lokaal (`8.37.0-chromium`, met `--api-timeout=65s`). Alleen intern bereikbaar.
   - **`backup`:** elke nacht om 03:00 (tijdzone Europe/Brussels) een `pg_dump -Fc` naar de back-upmap. Hij bewaart 30 dagen en ruimt oudere dumps op (mijn keuze).
   - **Geen gepubliceerde poorten.** Alles loopt via het Docker-netwerk `elentrik`, met een vast subnet (mijn keuze: `172.30.70.0/24`). De bestaande `cloudflared`-container wordt daar met één commando lid van.
   - **Mappen** (bind mounts) onder één basispad op de NAS, in te stellen via `.env`, bv. `/volume1/docker/elentrik/{postgres,bestanden,backups}`. Hyper Backup neemt `bestanden` en `backups` mee. De map `postgres` neemt hij **niet** mee: alleen de dump is consistent (mijn keuze, staat in de docs).
3. **Cloudflare:**
   - De public hostname `elentrik.app` → `http://elentrik-web:3000` op de bestaande tunnel.
   - Elentrik vertrouwt de header `CF-Connecting-IP` als bezoekersadres, maar **alleen** als het verzoek uit het subnet van het netwerk `elentrik` komt (`ELENTRIK_VERTROUWD_PROXYNET`). Anders geldt het socket-IP, zoals nu.
   - Daarmee werken de limieten op inlogpogingen en uitnodigingen per bezoeker in plaats van voor iedereen samen. Dit lost het opvolgpunt van plan 6 op.
4. **Productieconfiguratie:**
   - `BETTER_AUTH_URL` en de oorsprong voor de CSRF-controle zijn `https://elentrik.app`, en cookies zijn `Secure`.
   - Better Auth-aanroepen tijdens de server-rendering (SSR) blijven binnen de container (`http://127.0.0.1:3000`). Ze maken geen omweg via Cloudflare, en de oorsprongs- en cookiecontrole blijft werken (mijn keuze; de bouwer bewijst het met een test).
5. **Mail via Microsoft Graph:**
   - Een nieuwe verzender in `server/mail` die verstuurt via `POST https://graph.microsoft.com/v1.0/users/{afzender}/sendMail`.
   - Een token via client credentials (`https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`, scope `https://graph.microsoft.com/.default`). Het token wordt hergebruikt tot kort voor het verloopt.
   - Bijlagen (de factuur-PDF voor de boekhouding) gaan mee als `fileAttachment`.
   - **Keuze via env:** `MAIL_VERZENDER=graph`, met `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_GEHEIM` en `MAIL_AFZENDER` (bv. `noreply@elentrik.app`). Zonder `MAIL_VERZENDER` blijft SMTP de standaard, met Mailpit lokaal.
   - **Fouten:** een fout van Graph komt boven, zoals nu bij SMTP. De bestaande herhaal- en logica blijft werken (de webhook geeft 500 terug, waarna Stripe opnieuw probeert).
6. **Gemiste Stripe-meldingen inhalen** (opvolgpunt van plan 7). Een geplande taak in Nitro draait elk uur (mijn keuze):
   - **Abonnementen:** ze synchroniseert elke klant met status `active`, `trialing` of `past_due` waarvan `periode_einde` meer dan een dag voorbij is, of waarvan de rij langer dan 24 uur niet werd bijgewerkt.
   - **Facturen:** ze vraagt bij Stripe de betaalde facturen van de laatste 7 dagen op. Elke factuur van een bekende Elentrik-klant die nog niet doorgestuurd is, gaat alsnog naar de boekhouding, via dezelfde idempotente `stuurFactuurDoor`.
   - **Zonder Stripe:** de taak doet niets als abonnementen uit staan.
7. **Configuratie controleren bij het opstarten** (opvolgpunt van plan 7). In productie (`NODE_ENV=production`) weigert de server te starten als iets onvolledig of ongeldig is. De foutmelding noemt alleen de **naam** van de variabele, nooit de waarde. De controle omvat:
   - de verplichte variabelen (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ELENTRIK_BESTANDEN_DIR`, `ELENTRIK_GOTENBERG_URL`);
   - de mailconfiguratie;
   - een gedeeltelijke Stripe-configuratie: een sleutel zonder prijzen, of zonder webhookgeheim.
8. **Gezondheid:** `GET /api/gezondheid` is publiek.
   - Hij geeft `200 { ok: true }` als de database antwoordt, anders `503 { ok: false }`, zonder details.
   - De Docker-health-check gebruikt hem.
   - De route staat met naam in `PUBLIEKE_ROUTES`.
9. **Handleiding** `docs/online.md` (Nederlands, stap voor stap; zie §4.4). `docs/lokaal-en-online.md` verwijst ernaar.

**Niet-doelen**
- De marketingsite op `elentrik.be`.
- Een VPS, Kubernetes, of meerdere instanties naast elkaar.
- Automatische updates op de NAS (Watchtower en dergelijke). De gebruiker beslist zelf wanneer hij een nieuwe versie ophaalt (mijn keuze).
- Monitoring of alarmering buiten de health-check en Cloudflare.
- Bestanden in R2. Ze blijven op de NAS; R2 kan later.
- E2E-tests in GitHub Actions (die vragen Postgres, Gotenberg en Mailpit). Ze blijven lokaal.
- Gegevens van de lokale database `elentrik` naar de NAS verhuizen. De NAS start leeg. Wil de gebruiker zijn lokale testprojecten meenemen, dan beschrijft de handleiding een `pg_dump`/`pg_restore`, inclusief de bestandenmap (mijn keuze: optioneel, als handleidingstap).

**Anti-doelen**
- Een geheim (wachtwoorden, sleutels, het Graph-geheim, `BOEKHOUDING_INBOX`) in de repo, in het image, in de logs of in een foutmelding.
- Een poort van Postgres, Gotenberg of de app die openstaat op de NAS of het internet.
- Een verkeerd bezoekersadres: een `CF-Connecting-IP` die iemand van buiten de tunnel zelf meestuurt, en die toch geloofd wordt.
- Een back-up die bij het terugzetten niet blijkt te werken, of een back-up van een half geschreven databasemap.
- Een update die de database in een kapotte toestand achterlaat: een migratie die faalt, mag de app niet half laten starten.
- Lokale ontwikkeling die verandert of moeilijker wordt. `127.0.0.1`, Mailpit en de e2e-opzet blijven zoals ze zijn.

## 3. Randvoorwaarden

- **Node 24**, zoals `engines` in `apps/web/package.json`. De image-basis is `node:24-slim`, met pnpm via corepack en de versie uit `packageManager` in de root-`package.json`.
- **Het image draait niet als root.** De bestandenmap moet beschrijfbaar zijn voor die gebruiker; de handleiding legt uit hoe je dat op Synology instelt (UID/GID in `.env`).
- **De runtime-config van Nuxt wordt bij het opstarten gezet** via `NUXT_*`-variabelen, niet bij het bouwen. Het image is dus overal hetzelfde.
- **De GitHub Actions-workflow** gebruikt `GITHUB_TOKEN` met `packages: write`. Er zijn geen extra geheimen nodig.
- **Alle versies vastgepind:**
  - de image-tags in compose;
  - de actions op een vaste versie;
  - de basisimages met een vaste versietag van minstens twee weken oud.
- **De echte database `elentrik` op de ontwikkelmachine** wordt door niets in dit plan aangeraakt, behalve het migrate-commando dat de gebruiker er zelf op loslaat. Tests blijven op PGlite en `elentrik_e2e`.

## 4. Ontwerp

### 4.1 Image en opstart

- **`apps/web/Dockerfile`** (multi-stage):
  - **build:** installeren met `--frozen-lockfile` en `pnpm --filter @elentrik/web build`;
  - **runtime:** `.output`, de migratiemap en een klein migratiescript.
- **Entrypoint:**
  1. migraties uitvoeren met de bestaande Drizzle-migraties en de `postgres`-driver; bij een fout stopt de container met exitcode ≠ 0;
  2. dan `node .output/server/index.mjs`.
- **`HEALTHCHECK`** op `/api/gezondheid`.
- **Lokale controle:** `docker build` van het image en een `docker compose`-rooktest met `deploy/nas/compose.yaml`. Die rooktest draait tegen een tijdelijke map en een eigen `.env.test`, zonder tunnel, met de poort alleen voor de test op `127.0.0.1` gepubliceerd. Hij controleert:
  - de migraties zijn uitgevoerd;
  - de gezondheid geeft 200;
  - de aanmeldpagina laadt;
  - een export werkt via Gotenberg.
  
  Dit script `deploy/nas/rooktest.sh` gebruikt de bouwer zelf, en de gebruiker kan het herhalen.

### 4.2 Proxy, tunnel en netwerk

- `server/auth/ip.ts` breidt `metSocketIp` uit. Als `ELENTRIK_VERTROUWD_PROXYNET` gezet is en het socket-IP in dat subnet valt, geldt `CF-Connecting-IP` als client-IP (gevalideerd als IPv4 of IPv6). Anders blijft het gedrag van vandaag.
- Hetzelfde client-IP wordt gebruikt voor de eigen limieten (bv. uitnodigingen) waar die op IP werken.
- Compose maakt het netwerk `elentrik` met het vaste subnet, en zet `ELENTRIK_VERTROUWD_PROXYNET` op dat subnet.

### 4.3 Mail, Stripe-inhaaltaak en opstartcontrole

- **Graph-verzender:** `maakGraphVerzender(config, fetchFn)` naast `maakVerzender` (SMTP). `gebruikVerzender()` kiest op basis van de configuratie. Tests gebruiken een nep-fetch.
- **`StripePoort`** krijgt `betaaldeFacturen(sinds: Date): Promise<StripeFactuur[]>`. De nep-poort in de tests en de nep-Stripe in de e2e worden mee uitgebreid.
- **Inhaaltaak:**
  - een Nitro-taak (`experimental.tasks` met `scheduledTasks`, elk uur) roept `haalGemisteMeldingenIn(db, stripe, config, nu)` aan;
  - die functie is puur testbaar met de nep-poort;
  - een advisory lock voorkomt dat twee runs tegelijk lopen.
- **Opstartcontrole:**
  - een Nitro-plugin roept `controleerConfiguratie(env)` aan;
  - die functie geeft een lijst van problemen terug;
  - in productie gooit de plugin bij problemen een fout, zodat de server niet start;
  - buiten productie logt hij alleen een waarschuwing.

### 4.4 Handleiding `docs/online.md`

1. **Cloudflare:**
   - `elentrik.app` in Cloudflare;
   - SSL op "Full";
   - een public hostname op de bestaande tunnel naar `http://elentrik-web:3000`;
   - `docker network connect elentrik <cloudflared-container>`.
2. **Microsoft 365:**
   - het domein toevoegen;
   - de DNS-records in Cloudflare (MX als ontvangen gewenst is, SPF, DKIM-CNAME's en DMARC);
   - de gedeelde mailbox `noreply@elentrik.app`;
   - de app-registratie in Entra ID met de toepassingsmachtiging `Mail.Send` en admin-consent;
   - de beperking tot die ene mailbox (RBAC for Applications of een application access policy in Exchange Online);
   - waar tenant-ID, client-ID en geheim te vinden zijn, en de vervaldatum van het geheim noteren.
3. **NAS:**
   - mappen aanmaken met de juiste rechten;
   - `compose.yaml` en `.env` neerzetten (`.env` van `.env.voorbeeld`, met een nieuw `BETTER_AUTH_SECRET`);
   - het project starten in Container Manager;
   - de eerste opstart controleren (`/api/gezondheid`).
4. **Eerste account:** registreren op `https://elentrik.app`, en daarna het eigen bedrijf `vrijgesteld` zetten (de SQL staat erin).
5. **Stripe:**
   - eerst in testmodus het live endpoint `https://elentrik.app/api/stripe/webhook` met de events;
   - de dashboard-checklist uit plan 7;
   - later de overstap naar live.
6. **Hyper Backup en Cloud Sync:**
   - `bestanden` en `backups` meenemen, `postgres` niet;
   - versleuteling aan;
   - een hersteltest: een dump terugzetten in een tijdelijke database.
7. **Updaten:**
   - een nieuw image ophalen en het project opnieuw aanmaken;
   - controleren;
   - terugrollen naar de vorige tag: kan alleen als er geen migratie was, of met de dump van vóór de update.
8. **Problemen oplossen:**
   - de logs van de containers bekijken;
   - de app start niet (de opstartcontrole meldt welke variabele);
   - geen mails (Graph-fouten);
   - Stripe-meldingen komen niet aan.

## 5. Kwaliteit en tests

- **IP-vertrouwen:**
  - het socket-IP binnen het subnet met `CF-Connecting-IP` geeft dat IP;
  - het socket-IP buiten het subnet met dezelfde header geeft het socket-IP;
  - een ongeldige header geeft het socket-IP;
  - zonder configuratie geldt het gedrag van vandaag;
  - IPv6.
- **Graph-verzender:**
  - de token-aanvraag (form-body, scope);
  - het hergebruik van het token tot kort voor het verloopt;
  - de vorm van `sendMail` (onderwerp, HTML, ontvangers, afzender, bijlage base64);
  - een 4xx of 5xx gooit, zonder geheim in de foutmelding;
  - een 401 op `sendMail` vernieuwt het token één keer.
- **Inhaaltaak:**
  - de selectie van de klanten om te synchroniseren (de grenzen van één dag en 24 uur);
  - een factuur die nog niet doorgestuurd is, gaat alsnog door;
  - een factuur die al doorgestuurd is niet;
  - onbekende klanten worden genegeerd;
  - met abonnementen uit gebeurt niets;
  - het lock werkt.
- **Opstartcontrole:**
  - elke verplichte variabele die ontbreekt, wordt bij naam gemeld;
  - een gedeeltelijke Stripe-configuratie wordt gemeld;
  - `MAIL_VERZENDER=graph` zonder de Graph-variabelen wordt gemeld;
  - de waarden staan nooit in de melding;
  - buiten productie volgt alleen een waarschuwing.
- **Gezondheid:**
  - 200 met een database, en 503 als de database niet antwoordt;
  - de route staat in `PUBLIEKE_ROUTES` en in de routetabel.
- **Image en compose:** de rooktest (§4.1) draait groen op de ontwikkelmachine (Docker Desktop).
- **CI:** de workflow draait `pnpm test` en `pnpm typecheck`, bouwt het image en pusht het alleen op `main`. Hij wordt gevalideerd met `actionlint` of een droge run, en de bouwer controleert hem na de eerste push.
- **Bestaande suites:** unit, typecheck en Playwright blijven groen; lokaal verandert niets.

## 6. Wat aan de bouwer overblijft

- de exacte Dockerfile-stappen en het pruning van de monorepo-afhankelijkheden;
- het mechanisme van de back-upcontainer (een eenvoudige lus met `sleep` tot 03:00, of `crond` in alpine);
- hoe de SSR-auth-aanroep intern blijft, zolang een test aantoont dat de cookies en de oorsprongscontrole werken;
- de vorm van `deploy/nas/rooktest.sh`;
- de namen van de nieuwe interne modules.
