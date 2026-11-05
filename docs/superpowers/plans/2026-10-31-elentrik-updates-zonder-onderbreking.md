# Updates zonder onderbreking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Geen Cloudflare-foutpagina meer tijdens een update, een open app die blijft werken (ook na de update), en een melding bij een nieuwe of verplichte versie.

**Architecture:**
- Een vaste Caddy-proxy (`elentrik-proxy`) tussen de tunnel en de web-diensten. Hij serveert een eigen onderhoudspagina als de app niet bereikbaar is.
- In de app:
  - een service worker (`@vite-pwa/nuxt`, `injectManifest`) die de code met hash cache-first bewaart, oude versies inbegrepen;
  - een eigen versiecontrole op `/_nuxt/builds/latest.json`;
  - een compatibiliteitsgetal dat client en server bij elk API-verzoek uitwisselen.

**Tech Stack:** Nuxt 4 / Nitro, Nuxt UI 4 (toast, modal), Pinia, `@vite-pwa/nuxt` met Workbox (`workbox-strategies`, `workbox-expiration`, `workbox-recipes`), Caddy 2, Docker Compose, Vitest en Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-elentrik-updates-zonder-onderbreking-design.md` (goedgekeurd)

## Global Constraints

- **Proxy:**
  - Caddy op een exacte image-versie die minstens twee weken oud is;
  - luistert op `:8080`, plain HTTP met `auto_https off`, zonder toegangslog;
  - geen `depends_on` op `web` of `web-staging`, geen gepubliceerde poorten, netwerk `elentrik`.
- **Doorsturen:** `elentrik.app` gaat naar `web:3000` en `staging.elentrik.app` naar `web-staging:3000` (dienstnamen, geen containernamen). Een andere host geeft 404.
- **Onderhoudsantwoord:** alleen als de app niet bereikbaar is, nooit bij een antwoord van de app zelf. Altijd status **503** met `Cache-Control: no-store` en `Retry-After: 10`.
  - Navigatie (`GET` en `Accept` bevat `text/html`): `onderhoud.html`.
  - `/api/…`: `{"ok":false}`.
  - Iets anders: een kort lichaam als tekst.
- **Onderhoudspagina:**
  - controleert elke **5 s** `/api/gezondheid`;
  - na **10 minuten** de tekst over langer dan verwacht;
  - talen nl/fr/en via `navigator.languages`, met nl als terugval;
  - de staging-balk als `location.hostname === "staging.elentrik.app"`;
  - `noindex`.
- **Service worker:**
  - cache-first voor `/_nuxt/**` en `/_i18n/**`, behalve `/_nuxt/builds/**`;
  - nooit voor navigaties, `/api/**`, `/pdfjs/**`, `/sw.js` of `/manifest.webmanifest`;
  - expiratie na **60 dagen**;
  - geen opruiming van oude bestanden bij het activeren;
  - `skipWaiting` en `clientsClaim`;
  - alleen in de productiebuild.
- **Versiecontrole:** elke **5 minuten**, bij `visibilitychange` (zichtbaar) en bij `online`. Een mislukte controle wordt stil genegeerd. Nuxt zelf herlaadt nooit meer bij een nieuwe build.
- **Compatibiliteit:**
  - `CLIENT_COMPATIBILITEIT = 1` in `shared/clientversie.ts`;
  - de headers `X-Elentrik-Client` (verzoek) en `X-Elentrik-Client-Minimum` (elk `/api`-antwoord);
  - een schrijfactie (niet `GET`, `HEAD` of `OPTIONS`) met een **verschillende** waarde geeft **426** met `data.code = "NIEUWE_VERSIE_VEREIST"`;
  - een verzoek zonder header (of met een ongeldige waarde) gaat altijd door.
- **Manifest:** naam "Elentrik" op productie en lokaal, "Elentrik (staging)" op staging. Het icoon is een eigen getekende bliksemschicht in de primaire kleur (Nuxt UI `blue`, `#3b82f6`), niet het pad van Lucide.
- **Teksten:** alle nieuwe UI-teksten in nl, fr en en (de pariteitstest), volgens `docs/vertalingen.md`. Een nieuwe foutcode krijgt `fouten.<CODE>`.
- **Projectregels:**
  - tests nooit tegen de echte database `elentrik` of `.data/bestanden`; de e2e gebruikt `elentrik_e2e`;
  - expliciete imports in code die Vitest importeert (ruling E1);
  - clean room: niets overnemen van andere software;
  - commits ondertekend, met exact `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - niet pushen.

## Review Focus

1. **Een upload van een plan groter dan 1 MB en een PDF-export die 30–55 s duurt, via de proxy.** Beide lukken zonder afkapping. Test: Task 1 (rooktest).
2. **Een open editor met onbewaarde wijzigingen, en een tweede tabblad dat naar de nieuwe versie herlaadt.** Het eerste tabblad blijft schermen openen en bewaren. De service worker heeft geen oude bestanden weggegooid. Test: Task 6 (een unit-test dat `activate` geen caches wist; handmatige controle op staging in Task 7).
3. **Een tabblad dat uren in de achtergrond stond, met de update er tussenin.** Bij het terug zichtbaar worden volgt één controle, en de toast (of het modale venster) verschijnt. Er is geen automatisch herladen en geen reeks verzoeken. Test: Task 5 (`versiecontrole.test.ts`, "zichtbaar worden geeft één controle, ook na een mislukte").
4. **Een eigen 503 van `/api/gezondheid` (de database is weg) terwijl de app draait.** De proxy geeft hem ongewijzigd door, zonder de onderhoudspagina. Test: Task 1 (rooktest).
5. **De Stripe-webhook en de Docker-healthcheck na de middleware.** Ze sturen geen header en blijven werken. Test: Task 3 (`clientversie-middleware.test.ts`, "POST zonder header gaat door").

---

### Task 1: Proxy met doorsturen en onderhoudsantwoord

**Files:**
- Create: `deploy/nas/proxy/Caddyfile`
- Create: `deploy/nas/proxy/onderhoud.html` (voorlopig een eenvoudige plaatshouder; Task 2 maakt de echte pagina)
- Modify: `deploy/nas/compose.yaml` (dienst `proxy`)
- Modify: `deploy/nas/rooktest.sh` (override en een nieuwe stap 16)
- Modify: `docs/online.md` (schets, sectie 1 stap 3, staging, sectie 7, sectie 8)
- Test: `apps/web/test/deploy-docs.test.ts`

**Interfaces:**
- Produces:
  - de dienst `proxy`, met `container_name: elentrik-proxy` en poort 8080 in het netwerk;
  - `onderhoud.html` wordt gemount op een vaste plek die de Caddyfile serveert;
  - de healthcheck-route `/__proxy/gezond` (antwoordt 200 zonder door te sturen, op elke host).

- [ ] **Step 1: Schrijf de falende test in `deploy-docs.test.ts`**
  - `test("compose.yaml heeft een proxy zonder poorten en zonder depends_on op de web-diensten")`: de dienst `proxy` bestaat, met `container_name` gelijk aan `elentrik-proxy`, zonder `ports`, zonder `depends_on`, en met een image met een exacte tag (geen `latest`, geen tag met alleen een hoofdversie).
  - `test("de Caddyfile stuurt door naar de dienstnamen web en web-staging")`: de Caddyfile bevat `web:3000` en `web-staging:3000`, en niet `elentrik-web`.
  - `test("de handleiding wijst de tunnel naar elentrik-proxy:8080")`: `docs/online.md` bevat `elentrik-proxy:8080`, en `elentrik-web:3000` alleen nog in de uitleg van de interne doorsturing.

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `pnpm vitest run apps/web/test/deploy-docs.test.ts`
Expected: FAIL op de drie nieuwe tests.

- [ ] **Step 3: Schrijf `Caddyfile`, de plaatshouder `onderhoud.html`, de dienst `proxy` en de documentatie**
  - **Hosts:** een site-blok per host (`http://elentrik.app:8080`, `http://staging.elentrik.app:8080`) met `reverse_proxy`, plus een terugval `:8080` die 404 geeft. Behalve voor `/__proxy/gezond`: die geeft op elke host 200.
  - **Onderhoudsantwoord:** `handle_errors` op status 502/503/504 die Caddy zelf maakte. In Caddy komt `handle_errors` alleen in actie bij fouten van de proxy zelf, niet bij antwoorden van de app. Daarin drie gevallen volgens Global Constraints.
  - **Headers:** `Host` en `CF-Connecting-IP` gaan ongewijzigd door; de standaard van Caddy doet dat. Geen `request_body max_size`, en geen `read_timeout` of `write_timeout` korter dan 120 s.
  - **Volumes:** `./proxy/Caddyfile` en `./proxy/onderhoud.html`, read-only.
  - **Healthcheck:** `wget -qO- http://127.0.0.1:8080/__proxy/gezond` (zit in het alpine-image van Caddy).
  - **`docs/online.md`:** de wijzigingen uit spec 3.5, met de uitrolvolgorde (eerst staging omzetten) en het commando om de proxy zelf bij te werken.

- [ ] **Step 4: Draai de test en controleer dat hij slaagt**

Run: `pnpm vitest run apps/web/test/deploy-docs.test.ts`
Expected: PASS

- [ ] **Step 5: Breid de rooktest uit**
  - **Override:** `proxy` met `container_name: ${ROOK_NAAM}-proxy`, gepubliceerd op `127.0.0.1:${POORT_PROXY}:8080` (een nieuwe vrije poort naast de bestaande).
  - **Nieuwe stap 16 "De proxy"**, met `curl -H "Host: …"` naar de proxypoort:
    1. `elentrik.app` en `staging.elentrik.app` komen bij de juiste dienst: de staging-header `X-Robots-Tag` is er alleen bij staging.
    2. Een andere host geeft 404.
    3. Een upload van een plan van ongeveer 2 MB via de proxy lukt (dezelfde route als in stap 4), net als een PDF-export.
    4. Na `compose stop web-staging` als de database niet bereikbaar is: `/api/gezondheid` via de proxy en rechtstreeks geven dezelfde 503 `{ ok: false }` van de app (zonder `Retry-After` van de proxy). Als de database wegnemen in de rooktest te ver gaat, dan volstaat een eigen 404 van de app (`/api/projecten/<onbekend-id>`) die ongewijzigd doorkomt.
    5. Met `web` gestopt: een navigatie (`Accept: text/html`) geeft 503 met de tekst van `onderhoud.html`, `Cache-Control: no-store` en `Retry-After: 10`; `/api/gezondheid` geeft 503 `{"ok":false}`. Daarna weer `compose start web`.
    6. Een verzoek met `CF-Connecting-IP: 203.0.113.7` komt aan bij de app: controleer dat via de rate limiter van het inloggen, zoals `proxy-ip.test.ts` dat doet, of via de log.
    7. `bijwerken.sh staging` laat de container van de proxy ongemoeid: dezelfde container-id voor en na.

- [ ] **Step 6: Draai de rooktest**

Run: `bash deploy/nas/rooktest.sh`
Expected: elke stap `goed`, en aan het eind "Klaar".

- [ ] **Step 7: Commit**

```bash
git add deploy/nas/proxy deploy/nas/compose.yaml deploy/nas/rooktest.sh docs/online.md apps/web/test/deploy-docs.test.ts
git commit -S -m "feat(deploy): proxy met onderhoudsantwoord voor productie en staging"
```

---

### Task 2: De onderhoudspagina

**Files:**
- Modify: `deploy/nas/proxy/onderhoud.html`
- Test: `apps/web/e2e/onderhoud.spec.ts`

**Interfaces:**
- Consumes: `onderhoud.html` uit Task 1 (zelfstandig, wordt rechtstreeks geserveerd).
- Produces:
  - `data-testid="onderhoud-titel"`;
  - `data-testid="onderhoud-tekst"`;
  - `data-testid="onderhoud-opnieuw"` (de knop);
  - `data-testid="staging-balk"` (alleen op staging).

- [ ] **Step 1: Schrijf de falende e2e-test**

Elke test vangt alle verzoeken op met `page.route("**/*", …)`: de navigatie krijgt de inhoud van `onderhoud.html`, en `/api/gezondheid` krijgt wat de test zegt. Er is geen app of proxy nodig. De klok loopt via `page.clock`.
- `test("nl als terugval, en de titel 'Elentrik wordt bijgewerkt'")`: `locale: "de-DE"`; de titel is "Elentrik wordt bijgewerkt".
- `test("fr en en volgens de browser")`: `locale: "fr-BE"` geeft de Franse titel, `locale: "en-GB"` de Engelse.
- `test("herlaadt zodra /api/gezondheid 200 { ok: true } geeft")`: eerst 503, dan 200; na `clock.runFor(5_000)` volgt een tweede navigatie (tel de navigatieverzoeken).
- `test("de knop controleert meteen")`: een klik op `onderhoud-opnieuw` geeft meteen een verzoek naar `/api/gezondheid`.
- `test("na 10 minuten de tekst over langer dan verwacht, en het controleren gaat door")`: `clock.runFor(600_000)` geeft de tekst "Dit duurt langer dan verwacht. Probeer het later opnieuw.", en er volgen nog altijd verzoeken.
- `test("op staging.elentrik.app de balk en [Staging] in de titel")`: URL `http://staging.elentrik.app/`; `staging-balk` is zichtbaar en de titel begint met "[Staging] ". Op `http://elentrik.app/` is er geen balk.
- `test("noindex")`: `meta[name=robots]` heeft `noindex`.

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `pnpm --filter @elentrik/web exec playwright test e2e/onderhoud.spec.ts`
Expected: FAIL (de plaatshouder heeft geen talen, controle of balk).

- [ ] **Step 3: Schrijf `onderhoud.html`**
  - **Bron:** één bestand met inline CSS en JS en geen externe bronnen. Licht en donker via `prefers-color-scheme`.
  - **Teksten** per taal: nl uit de spec. fr en en volgen `docs/vertalingen.md`; de staging-balk neemt de bestaande tekst van `omgeving.staging` uit de drie vertaalbestanden over.
  - **Controle:** `fetch("/api/gezondheid", { cache: "no-store" })`, met een nieuwe controle pas als de vorige klaar is.

- [ ] **Step 4: Draai de test en controleer dat hij slaagt**

Run: `pnpm --filter @elentrik/web exec playwright test e2e/onderhoud.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add deploy/nas/proxy/onderhoud.html apps/web/e2e/onderhoud.spec.ts
git commit -S -m "feat(deploy): onderhoudspagina die vanzelf herlaadt"
```

---

### Task 3: Compatibiliteitsgetal, middleware en `$fetch`

**Files:**
- Create: `apps/web/shared/clientversie.ts`
- Create: `apps/web/server/middleware/clientversie.ts`
- Create: `apps/web/app/stores/versie.ts`
- Create: `apps/web/app/versie/regels.ts`
- Create: `apps/web/app/plugins/clientversie.client.ts`
- Modify: `apps/web/shared/foutcodes.ts` (`NIEUWE_VERSIE_VEREIST`)
- Modify: `apps/web/i18n/locales/{nl,fr,en}.json` (`fouten.NIEUWE_VERSIE_VEREIST`)
- Test: `apps/web/test/clientversie.test.ts`
- Test: `apps/web/test/clientversie-middleware.test.ts`
- Test: `apps/web/test/versie-store.test.ts`

**Interfaces:**
- Produces (`shared/clientversie.ts`):
  - `CLIENT_COMPATIBILITEIT: number` (= 1). Het commentaar zegt wanneer je het verhoogt, en dat een wijziging van het documentmodel altijd met een migratie in `MIGRATIES` komt.
  - `CLIENT_HEADER = "x-elentrik-client"`
  - `CLIENT_MINIMUM_HEADER = "x-elentrik-client-minimum"`
  - `leesClientversie(waarde: string | null | undefined): number | null`: een geheel getal ≥ 1, anders `null`.
  - `moetWeigeren(methode: string, client: number | null, server: number): boolean`
- Produces (`app/versie/regels.ts`):
  - `verschiltVanClient(serverWaarde: string | null | undefined, eigen: number): boolean`: `false` als de waarde niet te lezen is.
  - `isNieuweVersieFout(fout: unknown): boolean`: status 426 en code `NIEUWE_VERSIE_VEREIST` (via `foutStatus` en `foutCode` uit `app/sessie/fouten.ts`).
- Produces (`useVersieStore`, Pinia):
  - state:
    - `nieuweBuildId: string | null`
    - `gemeldeBuildId: string | null`
    - `vereist: boolean`
    - `zonderWaarschuwing: boolean`
  - getter: `toonMelding: boolean`, waar is als `nieuweBuildId` gezet is, verschilt van `gemeldeBuildId` en `!vereist`.
  - actions:
    - `meldBuild(id: string): void`
    - `markeerGemeld(): void`
    - `meldServerversie(waarde: string | null | undefined): void`: zet `vereist` als `verschiltVanClient`; zet het nooit terug.
    - `meldVereist(): void`
    - `zetVoorHerladen(fn: (() => Promise<boolean>) | null): void`
    - `herlaad(): Promise<void>`: roept `voorHerladen` aan als die er is. Bij `true` (of zonder `voorHerladen`) zet het `zonderWaarschuwing = true`. Daarna `location.reload()`, injecteerbaar voor de test.

- [ ] **Step 1: Schrijf de falende tests**
  - **`clientversie.test.ts`:**
    - `leesClientversie`: `"1"` geeft 1; `"0"`, `"-1"`, `"1.5"`, `"abc"`, `""`, `null` en `undefined` geven `null`.
    - `moetWeigeren`:
      - `("POST", 1, 2)` geeft true;
      - `("PUT", 3, 2)` geeft true (terugrol);
      - `("DELETE", 2, 2)` geeft false;
      - `("GET", 1, 2)`, `("HEAD", 1, 2)` en `("OPTIONS", 1, 2)` geven false;
      - `("POST", null, 2)` geeft false;
      - de methode is hoofdletterongevoelig: `("post", 1, 2)` geeft true.
    - `verschiltVanClient`: `("2", 1)` geeft true, `("1", 1)` false, `(null, 1)` false, `("x", 1)` false.
    - `isNieuweVersieFout`:
      - true voor `{ status: 426, data: { data: { code: "NIEUWE_VERSIE_VEREIST" } } }`;
      - false voor een 426 met een andere code;
      - false voor een 401.
  - **`clientversie-middleware.test.ts`:** h3-app zoals in `gezondheid.test.ts`, met de middleware en een eenvoudige `POST /api/x` en `GET /api/x`.
    - `test("elk /api-antwoord heeft X-Elentrik-Client-Minimum")`, ook een 426.
    - `test("POST met een lager getal: 426 NIEUWE_VERSIE_VEREIST")`
    - `test("POST met een hoger getal: 426")`
    - `test("POST met hetzelfde getal gaat door")`
    - `test("GET met een ander getal gaat door")`
    - `test("POST zonder header gaat door")` (webhook, Docker)
    - `test("buiten /api geen header en geen controle")`
  - **`versie-store.test.ts`** (Pinia met `createPinia`):
    - `meldBuild("b")` geeft `toonMelding`; na `markeerGemeld()` is het false; `meldBuild("c")` geeft weer true.
    - `meldServerversie("2")` met eigen 1 geeft `vereist`, en `toonMelding` is false.
    - `herlaad()` met `voorHerladen` naar true zet `zonderWaarschuwing` en herlaadt.
    - Met `voorHerladen` naar false blijft `zonderWaarschuwing` false en herlaadt het toch.

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `pnpm vitest run apps/web/test/clientversie.test.ts apps/web/test/clientversie-middleware.test.ts apps/web/test/versie-store.test.ts`
Expected: FAIL (modules ontbreken).

- [ ] **Step 3: Implementeer**
  - **De shared-module en de regels** volgens de Interfaces.
  - **De middleware**, naar het patroon van `server/middleware/robots.ts`:
    - alleen voor paden die met `/api/` beginnen;
    - eerst `setResponseHeader` met de minimumwaarde;
    - daarna `createError({ statusCode: 426, statusMessage: "Nieuwe versie van de app vereist", data: { code: "NIEUWE_VERSIE_VEREIST" } })`.
  - **De code `NIEUWE_VERSIE_VEREIST`** in `SERVER_FOUTCODES` (`foutcodes.test.ts` eist het gebruik). Tekst nl: "Elentrik is bijgewerkt. Herlaad de app om verder te werken."
  - **De plugin `clientversie.client.ts`:**
    - `enforce: "pre"`;
    - vervangt `globalThis.$fetch` door `$fetch.create({ onRequest, onResponse })`;
    - `onRequest` zet `X-Elentrik-Client` alleen voor een URL die met `/api/` begint;
    - `onResponse` (draait ook bij fouten) geeft de minimumheader aan `meldServerversie`, en bij `isNieuweVersieFout` volgt `meldVereist()`.
    - De store is de enige plek met de toestand.

- [ ] **Step 4: Draai de tests en controleer dat ze slagen, samen met de bestaande foutcode- en vertaaltests**

Run: `pnpm vitest run apps/web/test/clientversie.test.ts apps/web/test/clientversie-middleware.test.ts apps/web/test/versie-store.test.ts apps/web/test/foutcodes.test.ts apps/web/test/vertalingen.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/shared apps/web/server/middleware/clientversie.ts apps/web/app/stores/versie.ts apps/web/app/versie apps/web/app/plugins/clientversie.client.ts apps/web/i18n apps/web/test
git commit -S -m "feat(web): compatibiliteitsgetal tussen client en server"
```

---

### Task 4: Autosave bij een 426 en een gemigreerd concept

**Files:**
- Modify: `apps/web/app/composables/useAutosave.ts` (vlag `versieVerouderd`, tak in de catch rond regel 389)
- Modify: `apps/web/app/pages/projecten/[id].vue` (`laadConcept` rond regel 181; `voorHerladen` registreren; `bijVerlaten` slaat over bij `zonderWaarschuwing`)
- Modify: `apps/web/i18n/locales/{nl,fr,en}.json` (`editor.concept.herstelMislukt`)
- Test: `apps/web/test/autosave.test.ts`
- Test: `apps/web/test/concept-herstel.test.ts` (of de bestaande test van de editorpagina, als die `laadConcept` al dekt)

**Interfaces:**
- Consumes:
  - `isNieuweVersieFout` (Task 3);
  - `useVersieStore().zetVoorHerladen` en `.zonderWaarschuwing` (Task 3);
  - `migreer(invoer: unknown): InstallatieDocument` uit `@elentrik/model`.
- Produces: `Autosave.versieVerouderd: Ref<boolean>`.

- [ ] **Step 1: Schrijf de falende tests**
  - **`autosave.test.ts`**, naar het patroon van de 401-tests (regel 964):
    - `test("een 426 NIEUWE_VERSIE_VEREIST: lokaal en versieVerouderd, zonder nieuwe poging; het concept blijft")`: `bewaar` faalt met `{ status: 426, data: { data: { code: "NIEUWE_VERSIE_VEREIST" } } }`. Daarna is `status` `lokaal`, `versieVerouderd` true, er volgt geen tweede `bewaar` na `herprobeerMs`, en het concept staat er.
    - `test("een 426 met een andere code volgt het pad van fout")`.
    - `test("een geslaagd nuOpslaan na een 426 zet versieVerouderd terug op false")`.
  - **Concept-herstel:**
    - een concept met een document dat `migreer` omzet (een test-migratie in de test, of een document met een oudere `schemaVersie` als `MIGRATIES` leeg is: dan geldt het als "ongewijzigd en geldig") wordt gemigreerd geladen;
    - een concept dat `migreer` laat gooien, toont de toast `editor.concept.herstelMislukt` en wist het aangeboden concept niet.

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `pnpm vitest run apps/web/test/autosave.test.ts`
Expected: FAIL op de drie nieuwe tests.

- [ ] **Step 3: Implementeer**
  - **De autosave:** een tak `isNieuweVersieFout(e)` vóór de algemene 4xx-tak, zoals `AFGEMELD`, met `versieVerouderd`. Dezelfde vlag komt in de voorwaarden zonder nieuwe poging (regel 308, regel 421) en wordt teruggezet waar `afgemeld` teruggezet wordt na een geslaagd bewaar. Werk de doc-comment van `AutosaveStatus` bij.
  - **`laadConcept`:** `migreer(c.document)` in een `try`. Bij een fout volgt de toast (nl: "Het lokaal bewaarde werk kon niet geladen worden. Het blijft bewaard."), zonder `store.laad` en zonder wissen.
  - **De editorpagina:**
    - registreert bij het mounten `zetVoorHerladen(() => autosave.wachtOpConcept())` en zet het bij het unmounten op `null`;
    - `bijVerlaten` vraagt niets als `useVersieStore().zonderWaarschuwing` waar is.

  Kleine afwijking van de spec: het herstel toont bij een mislukte migratie een nieuwe, passende tekst in plaats van `fouten.ONGELDIG_DOCUMENT`, omdat die tekst over opslaan gaat.

- [ ] **Step 4: Draai de tests en controleer dat ze slagen, ook de bestaande autosave-tests**

Run: `pnpm vitest run apps/web/test/autosave.test.ts apps/web/test/concepten.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/composables/useAutosave.ts "apps/web/app/pages/projecten/[id].vue" apps/web/i18n apps/web/test
git commit -S -m "feat(web): autosave bij een verplichte update, en een gemigreerd concept"
```

---

### Task 5: Versiecontrole, geen automatisch herladen, de toast en het modale venster

**Files:**
- Create: `apps/web/app/versie/controle.ts`
- Create: `apps/web/app/plugins/versiecontrole.client.ts`
- Create: `apps/web/app/plugins/chunkfout.client.ts`
- Create: `apps/web/app/components/NieuweVersie.vue`
- Modify: `apps/web/nuxt.config.ts` (`experimental`)
- Modify: `apps/web/app/app.vue` (`<NieuweVersie />` naast `<StagingBalk />`)
- Modify: `apps/web/i18n/locales/{nl,fr,en}.json` (`versie.*`)
- Test: `apps/web/test/versiecontrole.test.ts`
- Test: `apps/web/e2e/nieuwe-versie.spec.ts`

**Interfaces:**
- Consumes: `useVersieStore` (Task 3), en de editorpagina met `zetVoorHerladen` (Task 4).
- Produces: `maakVersiecontrole(opties): Versiecontrole` in `app/versie/controle.ts`:
  - opties:
    - `eigenBuildId: string`
    - `haalLaatsteBuildId: () => Promise<string>`
    - `haalGezondheid: () => Promise<unknown>`
    - `bijNieuweBuild: (id: string) => void`
    - `intervalMs: number`
  - `Versiecontrole`:
    - `start(): void` (interval)
    - `stop(): void`
    - `controleer(): Promise<void>`
  - `controleer` doet:
    1. vraagt beide op, elk met eigen foutafhandeling;
    2. roept `bijNieuweBuild` aan als de id verschilt van `eigenBuildId`;
    3. gooit nooit;
    4. slaat over als er al een controle bezig is.

- [ ] **Step 1: Schrijf de falende tests**
  - **`versiecontrole.test.ts`** (Vitest, nep-timers):
    - `test("dezelfde build: geen melding")`
    - `test("een andere build: bijNieuweBuild met de id, en de controle blijft lopen")`: na nog een interval volgt een nieuwe controle.
    - `test("een mislukte controle wordt genegeerd en de volgende loopt gewoon")`: eerst gooit `haalLaatsteBuildId`, daarna geeft hij een nieuwe id.
    - `test("haalGezondheid draait ook als latest.json faalt")`
    - `test("geen twee controles tegelijk")`
    - `test("zichtbaar worden geeft één controle, ook na een mislukte")`: dat zit in de plugin; test het via een kleine `koppelVensters(controle, venster)` die de bouwer in `controle.ts` mee exporteert, met een nep-`venster` (`addEventListener` en `document.visibilityState`).
  - **`nieuwe-versie.spec.ts`** (Playwright, tegen `nuxt dev`, aangemelde testgebruiker zoals in `verlaten.spec.ts`):
    - `test("een nieuwe build geeft de toast, en navigeren herlaadt niet")`:
      1. `page.route("**/_nuxt/builds/latest.json")` geeft een andere `id`;
      2. de controle wordt uitgelokt via `visibilitychange` (`page.evaluate`, `document.dispatchEvent`);
      3. de toast "Er is een nieuwe versie van Elentrik" verschijnt;
      4. een klik naar een ander scherm geeft geen volledige herlading: een `window`-markering blijft staan.
    - `test("gesloten: dezelfde build meldt niet opnieuw, een volgende wel")`
    - `test("een API-antwoord met een andere minimumversie geeft het modale venster, dat niet weg te klikken is")`: `page.route("**/api/**")` zet `x-elentrik-client-minimum: 999` op het antwoord. Escape en een klik naast het venster laten het staan.
    - `test("Herladen in het modale venster herlaadt de editor zonder vraag, en het concept wordt aangeboden")`:
      1. open een project en maak een wijziging;
      2. laat `PUT /api/projecten/*` met 426 `NIEUWE_VERSIE_VEREIST` antwoorden;
      3. het modale venster verschijnt;
      4. klik op Herladen: er komt geen `beforeunload`-dialoog (`page.on("dialog")` faalt de test);
      5. na het laden staat de dialoog van het concept-herstel er.

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `pnpm vitest run apps/web/test/versiecontrole.test.ts` en `pnpm --filter @elentrik/web exec playwright test e2e/nieuwe-versie.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implementeer**
  - **`nuxt.config.ts`:** `experimental: { checkOutdatedBuildInterval: false, emitRouteChunkError: "manual" }`. `appManifest` blijft aan.
  - **`versiecontrole.client.ts`:**
    - `eigenBuildId` = `useRuntimeConfig().app.buildId`;
    - `haalLaatsteBuildId` = `fetch(\`${app.baseURL}${app.buildAssetsDir}builds/latest.json\`.replace(/\/+/g, "/"), { cache: "no-store" })`, waaruit `.id` (een niet-ok antwoord gooit);
    - `haalGezondheid` = `$fetch("/api/gezondheid")` (de omhulling van Task 3 leest de header);
    - `bijNieuweBuild` = `store.meldBuild(id)` plus `navigator.serviceWorker?.getRegistration().then((r) => r?.update())` (fouten genegeerd);
    - `intervalMs` = `300_000`;
    - koppelt `visibilitychange` (alleen bij `visible`) en `online`.
  - **`chunkfout.client.ts`:** het gedrag van de plugin `chunk-reload` van Nuxt, maar **zonder** de hook op `app:manifest:update`. De plugin onthoudt de fouten uit `app:chunkError`; als de router daarna faalt met zo'n fout, volgt `reloadNuxtApp({ path: to.fullPath, persistState: true })`. Kijk naar het gedrag, neem geen code over.
  - **`NieuweVersie.vue`:**
    - **Toast** (`useToast`) bij `toonMelding`:
      - vaste `id: "nieuwe-versie"`;
      - geen automatisch verdwijnen (controleer welke waarde van `duration` dat in Nuxt UI 4 doet);
      - titel `versie.nieuw`;
      - actie `versie.herladen`, die `store.herlaad()` aanroept;
      - sluiten roept `store.markeerGemeld()` aan.
    - **`UModal`** bij `vereist`:
      - `:dismissible="false"`, zonder sluitknop;
      - tekst `versie.vereist`;
      - knop `versie.herladen`;
      - de toast verdwijnt (`toast.remove("nieuwe-versie")`).
  - **Teksten nl:**
    - `versie.nieuw`: "Er is een nieuwe versie van Elentrik"
    - `versie.herladen`: "Herladen"
    - `versie.vereist`: "Elentrik is bijgewerkt. Herlaad de app om verder te werken. Je werk in de editor blijft bewaard."

- [ ] **Step 4: Draai de tests en controleer dat ze slagen**

Run: `pnpm vitest run apps/web/test/versiecontrole.test.ts apps/web/test/geen-hardgecodeerde-tekst.test.ts` en `pnpm --filter @elentrik/web exec playwright test e2e/nieuwe-versie.spec.ts e2e/verlaten.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app apps/web/nuxt.config.ts apps/web/i18n apps/web/test/versiecontrole.test.ts apps/web/e2e/nieuwe-versie.spec.ts
git commit -S -m "feat(web): melding bij een nieuwe of verplichte versie, zonder automatisch herladen"
```

---

### Task 6: Service worker, manifest en icoon

**Files:**
- Create: `apps/web/app/service-worker/regels.ts`
- Create: `apps/web/app/service-worker/sw.ts`
- Create: `apps/web/app/plugins/service-worker.client.ts`
- Create: `apps/web/server/routes/manifest.webmanifest.ts`
- Create: `apps/web/public/icoon.svg`
- Create: `apps/web/public/icoon-192.png`
- Create: `apps/web/public/icoon-512.png`
- Create: `apps/web/public/icoon-maskable-512.png`
- Create: `apps/web/public/apple-touch-icon.png`
- Create: `apps/web/scripts/maak-iconen.mjs` (maakt de PNG's met Playwright uit de SVG)
- Modify: `apps/web/package.json` (`@vite-pwa/nuxt`, `workbox-strategies`, `workbox-expiration`, `workbox-recipes`, `workbox-precaching` voor het type van `__WB_MANIFEST`; een script `e2e:sw`)
- Modify: `apps/web/nuxt.config.ts` (module `@vite-pwa/nuxt`, `routeRules` voor `/sw.js`, `ELENTRIK_OUTPUT_DIR`)
- Modify: `apps/web/app/app.vue` (`useHead`: `link rel=manifest`, `icon`, `apple-touch-icon`, `meta theme-color`)
- Test: `apps/web/test/service-worker-regels.test.ts`
- Test: `apps/web/test/manifest.test.ts`
- Test: `apps/web/e2e-sw/service-worker.spec.ts`
- Test: `apps/web/playwright.sw.config.ts`

**Interfaces:**
- Consumes: het `getRegistration().update()` van Task 5 werkt pas met een geregistreerde service worker.
- Produces:
  - `isAppBestand(pad: string): boolean`
  - `APP_CACHE = "elentrik-code"`
  - `MAX_LEEFTIJD_S = 60 * 24 * 60 * 60`

- [ ] **Step 1: Schrijf de falende tests**
  - **`service-worker-regels.test.ts`:**
    - `isAppBestand` is true voor `/_nuxt/entry.Ab12Cd.js`, `/_nuxt/x.css` en `/_i18n/9f8e/nl/messages.json`;
    - false voor `/_nuxt/builds/latest.json`, `/_nuxt/builds/meta/abc.json`, `/api/mij`, `/pdfjs/wasm/x.wasm`, `/`, `/projecten/1`, `/sw.js` en `/manifest.webmanifest`;
    - `MAX_LEEFTIJD_S === 5_184_000`.
  - **`manifest.test.ts`:** h3-app zoals in `gezondheid.test.ts`.
    - Zonder `ELENTRIK_OMGEVING` en met `productie`: `name === "Elentrik"`.
    - Met `staging`: `name === "Elentrik (staging)"`.
    - Altijd: `content-type` begint met `application/manifest+json`, `cache-control` is `no-cache`, `start_url === "/"`, `display === "standalone"`, `theme_color === "#3b82f6"`, en er zijn iconen voor 192 en 512, plus één met `purpose: "maskable"`.
  - **`e2e-sw/service-worker.spec.ts`**, met een eigen config `playwright.sw.config.ts`:
    - bouwt met `ELENTRIK_BUILD_DIR=.nuxt-sw` en `ELENTRIK_OUTPUT_DIR=.output-sw`;
    - start `node .output-sw/server/index.mjs` op een eigen poort, zonder `NODE_ENV=production`, tegen `elentrik_e2e`;
    - gebruikt alleen de publieke pagina's.

    De tests:
    - `test("na het eerste bezoek staan de app-bestanden in de cache")`: op `/inloggen` wachten op `navigator.serviceWorker.ready` en `controller`; `caches.open("elentrik-code")` bevat het entry-script van de pagina.
    - `test("offline opent een scherm waarvan de code nog niet geladen was")`: `context.setOffline(true)`, dan een klik op `inloggen-naar-registreren`; het registratieformulier verschijnt.
    - `test("offline wordt een navigatie niet uit de cache beantwoord")`: `context.setOffline(true)`, dan geeft `page.reload()` een netwerkfout (de cache van de service worker beantwoordt geen HTML).
  - **`service-worker-regels.test.ts`** krijgt ook: `test("activeren wist geen caches")`. `sw.ts` exporteert zijn `activate`-handler niet; daarom zit de logica voor activeren in `regels.ts` als `bijActiveren(clients: { claim(): Promise<void> }): Promise<void>`. De test geeft een nep-`caches` mee en controleert dat `delete` nooit aangeroepen wordt.

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Run: `pnpm vitest run apps/web/test/service-worker-regels.test.ts apps/web/test/manifest.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementeer**
  - **De module in `nuxt.config.ts`:**
    - `@vite-pwa/nuxt` met `strategies: "injectManifest"`, `srcDir: "service-worker"`, `filename: "sw.ts"`;
    - `injectRegister: false`, `manifest: false`, `registerType: "prompt"`, `devOptions: { enabled: false }`;
    - `injectManifest.globPatterns: ["_nuxt/**/*.{js,css,woff2,svg,png,webp}"]` met `globIgnores: ["_nuxt/builds/**"]`. Controleer in de build dat `srcDir` ten opzichte van `app/` gelezen wordt.
  - **`routeRules`:** `"/sw.js": { headers: { "cache-control": "no-cache" } }`.
  - **`nitro.output.dir`:** `process.env.ELENTRIK_OUTPUT_DIR || undefined`.
  - **`sw.ts`:**
    - `CacheFirst` op `APP_CACHE` met `ExpirationPlugin({ maxAgeSeconds: MAX_LEEFTIJD_S, maxEntries: 2000 })`, voor verzoeken met `isAppBestand(url.pathname)` op de eigen origin;
    - `warmStrategyCache` met de URL's uit `self.__WB_MANIFEST` (met een `/` ervoor);
    - `self.skipWaiting()` bij het installeren;
    - `activate` roept `bijActiveren(self.clients)` aan;
    - **geen** `precacheAndRoute` en **geen** `cleanupOutdatedCaches`;
    - voor `sw.ts` de `WebWorker`-lib (een eigen `tsconfig` of een triple-slash, zodat `nuxt typecheck` slaagt).
  - **`service-worker.client.ts`:** registreert `/sw.js` met `scope: "/"` alleen als `!import.meta.dev` en `"serviceWorker" in navigator`. Fouten worden stil genegeerd.
  - **De manifest-route:** volgt `leesOmgeving(process.env)`.
  - **`app.vue`:** de links en `theme-color`.
  - **Het icoon:** een eigen bliksemschicht als eenvoudige veelhoek in `#3b82f6`, met de maskable variant op een volle achtergrond met veilige marge. `maak-iconen.mjs` rendert de PNG's één keer; de PNG's worden gecommit.

- [ ] **Step 4: Draai de unit-tests, typecheck en de SW-e2e**

Run: `pnpm vitest run apps/web/test/service-worker-regels.test.ts apps/web/test/manifest.test.ts`, daarna `pnpm --filter @elentrik/web typecheck`, daarna `pnpm --filter @elentrik/web e2e:sw`
Expected: alles PASS. Zet `apps/web/.nuxt-sw` en `apps/web/.output-sw` in `.gitignore`, naast `apps/web/.nuxt-e2e`.

- [ ] **Step 5: Draai de volledige unit-suite en de bestaande e2e**

Run: `pnpm test` en `pnpm --filter @elentrik/web exec playwright test`
Expected: PASS. In `nuxt dev` draait geen service worker, dus de bestaande e2e verandert niet.

- [ ] **Step 6: Commit**

```bash
git add apps/web .gitignore pnpm-lock.yaml
git commit -S -m "feat(web): service worker die de code van een open app bewaart, manifest en icoon"
```

---

### Task 7: Eindcontrole en handmatige stappen

**Files:**
- Modify: geen code. Eventuele kleine correcties in eigen commits.

- [ ] **Step 1: Volledige verificatie**

Run: `pnpm typecheck`, `pnpm test`, `pnpm --filter @elentrik/web exec playwright test`, `pnpm --filter @elentrik/web e2e:sw` en `bash deploy/nas/rooktest.sh`
Expected: alles PASS.

- [ ] **Step 2: Schrijf in de beschrijving van de PR de handmatige controle op staging na het mergen**
  1. compose met de proxy uitrollen, en de tunnelroute van `staging.elentrik.app` naar `http://elentrik-proxy:8080` zetten;
  2. tijdens `bijwerken.sh staging` toont `https://staging.elentrik.app` de onderhoudspagina (niet die van Cloudflare), en die herlaadt vanzelf;
  3. `curl -sI https://staging.elentrik.app/sw.js` toont dat Cloudflare `/sw.js` niet uit zijn cache geeft (`cf-cache-status` is niet `HIT`, of de inhoud volgt de nieuwe build);
  4. een tabblad open laten tijdens een update: de toast verschijnt, een scherm dat nog niet geopend was opent nog, en een tweede tabblad dat herlaadt breekt het eerste niet;
  5. pas daarna productie omzetten.

  De PR herinnert eraan te mergen met "Create a merge commit".
