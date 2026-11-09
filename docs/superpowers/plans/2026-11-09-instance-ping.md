# Instance-ping: implementatieplan

> **Voor agents:** VERPLICHTE SUB-SKILL: gebruik superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans om dit plan taak per taak uit te voeren. De stappen gebruiken checkboxen (`- [ ]`).

**Doel:** een zelf gehoste productie-installatie van Elentrik meldt zich dagelijks, open en gedocumenteerd, bij elentrik.app. Superusers zien die meldingen in `/admin/installaties`.

**Architectuur:**

- **Verzender** (`server/instance/ping.ts`): pure functies voor "actief?" en "wat versturen", plus `verstuurPing`. Twee dingen roepen hem aan:
  - een Nitro-plugin, één keer 60 s na de start;
  - een dagelijkse Nitro-taak `instance:ping`.
- **Ontvanger** (`server/instance/ontvangst.ts`): validatie, een limiet per IP in het geheugen, een dagplafond in de database en een upsert. De publieke route `POST /api/instances` gebruikt hem, en alleen in productie.
- **Opruimen:** een dagelijkse taak `instance:opruimen` wist meldingen ouder dan 12 maanden.
- **Admin:** een leesfunctie, een route en een pagina volgens het bestaande admin-patroon.

**Tech stack:** Nuxt 4 / Nitro (tasks, plugins), h3, Drizzle + PostgreSQL (PGlite in Vitest), zod, Vitest, Playwright, Nuxt UI.

**Spec:** `docs/superpowers/specs/2026-11-09-instance-ping-design.md`. Lees de spec vóór elke taak.

## Globale randvoorwaarden

- **Naamgeving in code:** `instance`, nooit "installatie". In Elentrik betekent "installatie" de elektrische installatie. Alleen het UI-label van de admin-pagina is "Installaties" (spec).
- **Ping actief** alleen als alle voorwaarden kloppen:
  - `NODE_ENV === "production"`;
  - `leesOmgeving(env) === null` (`shared/omgeving.ts`);
  - `ELENTRIK_INSTANCE_PING` (getrimd, kleine letters) is niet `uit`;
  - `geplandeTakenAan(env)` (`server/taken/lock.ts`).
- **Eindpunt:** de constante `INSTANCE_PING_URL = "https://elentrik.app/api/instances"`. `ELENTRIK_INSTANCE_PING_URL` overschrijft hem, alleen voor tests.
- **Melding (JSON):** `{ instanceId, host, versie, abonnementenAan, aantalOrganisaties, aantalGebruikers }`.
  - `instanceId`: UUID.
  - `host`: hostnaam, 1–253 tekens, kleine letters, regex `^[a-z0-9.-]+$` of een IP-adres (`isIp`). IPv6 komt zonder blokhaken.
  - `versie`: 1–64 tekens.
  - `abonnementenAan`: boolean.
  - de aantallen: gehele getallen van 0 tot 10 000 000.
  - Onbekende velden worden geweigerd (`z.strictObject`).
- **Versie:** `ELENTRIK_REVISIE` (getrimd, 1–64 tekens), anders `"onbekend"`.
- **Verzenden:** POST met `content-type: application/json` en `user-agent: Elentrik-instance-ping`, met `AbortSignal.timeout(10_000)`. Een fout geeft hooguit één `console.warn` per proces en nooit een exception.
- **Ontvangen:**
  - Antwoord 404 als `leesOmgeving(process.env) !== "productie"`.
  - 429 boven 10 meldingen per limietsleutel per uur.
  - 413 als het lichaam groter is dan 2048 bytes.
  - 400 bij ongeldige invoer.
  - Anders 204, ook boven het dagplafond.
  - Dagplafond: 100 nieuwe `instance_id`'s per kalenderdag in UTC, geteld op `eerste_melding_op`.
- **Limietsleutel:** IPv4 en IPv4-in-IPv6 geven het IPv4-adres; IPv6 geeft de eerste 8 bytes als hex plus `/64`; geen of een ongeldig IP geeft `"onbekend"`.
- **Bewaren:** 365 dagen na `laatste_melding_op`. "Stil" betekent dat de laatste melding meer dan 7 dagen oud is.
- **Testen:** Vitest gebruikt PGlite (`test/db.ts`). Tests raken nooit de DB `elentrik` of `.data/bestanden`, en praten nooit met elentrik.app. Gebruik een nep-`fetch` of een lokale server.
- **Code:** expliciete imports in serverbestanden die Vitest rechtstreeks importeert (ruling E1).
- **Teksten:** UI-teksten komen in `apps/web/i18n/locales/{nl,fr,en}.json`.
- **Clean room:** geen code of teksten uit andere software.

## Review Focus

1. **Een kopie die naar zichzelf wijst** (`ELENTRIK_INSTANCE_PING_URL` naar de eigen host, zonder `ELENTRIK_OMGEVING`) krijgt 404 en slaat niets op. Test in taak 2.
2. **`BETTER_AUTH_URL` ontbreekt of is ongeldig:** de verzender stuurt niets, waarschuwt één keer en gooit niet. Test in taak 3.
3. **Het lichaam is geen JSON, of is een array of `null`:** het antwoord is 400, geen 500. Test in taak 2.
4. **Twee meldingen tegelijk met dezelfde nieuwe `instanceId`:** één rij, `aantal_meldingen` = 2, geen unieke-sleutelfout (`onConflictDoUpdate`). Test in taak 2.
5. **Een host met hoofdletters of een poort** in `BETTER_AUTH_URL` (`https://Kopie.Example:8443/app`) wordt `kopie.example`. Test in taak 3.

---

### Taak 1: Schema, migratie en validatie van een melding

**Bestanden:**
- Wijzig: `apps/web/server/db/schema.ts` (twee tabellen achteraan)
- Maak: `apps/web/server/db/migraties/0015_instance_ping.sql`, gegenereerd met `pnpm --filter @elentrik/web db:generate`, plus de `meta`-bestanden
- Maak: `apps/web/shared/instance.ts`
- Test: `apps/web/test/instance-melding.test.ts`

**Interfaces:**
- Levert:
  - `instance` (tabel `instance`, hoogstens één rij): `sleutel: text pk default 'deze'` met een check `sleutel = 'deze'`, `id: uuid not null`, `aangemaaktOp: timestamptz not null default now()`.
  - `instanceMeldingen` (tabel `instance_meldingen`):
    - `instanceId: uuid pk`, `host: text`, `versie: text`, `abonnementenAan: boolean`;
    - `aantalOrganisaties: integer`, `aantalGebruikers: integer`;
    - `eersteMeldingOp: timestamptz`, `laatsteMeldingOp: timestamptz`, `aantalMeldingen: integer default 1`;
    - `laatsteIp: text null`.
    - Alles behalve `laatsteIp` is not null. Er is een index op `eerste_melding_op` en een op `laatste_melding_op`.
  - In `shared/instance.ts`:
    - `export type InstanceMelding = { instanceId: string; host: string; versie: string; abonnementenAan: boolean; aantalOrganisaties: number; aantalGebruikers: number }`
    - `export const instanceMeldingSchema` (zod, strict, met de grenzen uit de randvoorwaarden)
    - `export function leesInstanceMelding(invoer: unknown): InstanceMelding | null`

- [ ] **Stap 1: Schrijf de falende test** `test/instance-melding.test.ts`:
  - `"accepteert een geldige melding"`: `leesInstanceMelding({ instanceId: randomUUID(), host: "kopie.example", versie: "abc1234", abonnementenAan: false, aantalOrganisaties: 3, aantalGebruikers: 7 })` geeft hetzelfde object terug.
  - `"weigert ongeldige meldingen"`: `it.each` over de volgende invoer, telkens `toBeNull()`:
    - `null`, `[]`, `"tekst"`;
    - een `instanceId` `"geen-uuid"`;
    - een `host` van 254 tekens;
    - een `host` `"Kopie.Example"` (hoofdletters);
    - een `host` `"a b"`;
    - een `versie` `""` en een `versie` van 65 tekens;
    - `aantalGebruikers` `-1`, `1.5` en `10_000_001`;
    - een extra veld `email`.
  - `"accepteert een IP als host"`: `"192.0.2.10"` en `"2001:db8::1"`.
  - `"migratie maakt beide tabellen"`: na `maakTestDb()` lukt een insert en een select op `instanceMeldingen` en `instance`.
- [ ] **Stap 2:** draai `pnpm vitest run apps/web/test/instance-melding.test.ts`. Verwacht: FAIL (de module ontbreekt).
- [ ] **Stap 3:** voeg de tabellen toe aan het schema en draai `db:generate`. Hernoem de migratie naar `0015_instance_ping.sql` en werk de tag in `meta/_journal.json` bij, zoals bij 0014. Schrijf `shared/instance.ts` met `isIp` uit `server/net.ts`. Kan `shared/` daar niet uit importeren, verplaats de host-check dan naar `server/instance/melding.ts` en houd het type in `shared/`.
- [ ] **Stap 4:** draai de test opnieuw. Verwacht: PASS. Draai daarna `pnpm test:parallel`. Verwacht: PASS, ook `test/db.test.ts` en de migratietests.
- [ ] **Stap 5: Commit** `feat(web): instance-ping tables and report validation`

### Taak 2: Ontvangen, limiet, plafond en opruimen op elentrik.app

**Bestanden:**
- Wijzig: `apps/web/server/net.ts` (nieuwe export)
- Maak: `apps/web/server/instance/ontvangst.ts`
- Maak: `apps/web/server/api/instances.post.ts`
- Maak: `apps/web/server/tasks/instance/opruimen.ts`
- Wijzig: `apps/web/nuxt.config.ts` (`scheduledTasks`: `"15 4 * * *": ["instance:opruimen"]`)
- Wijzig: `apps/web/test/routes.ts` (`"instances.post.ts"` in `PUBLIEKE_ROUTES`)
- Test: `apps/web/test/instance-ontvangst.test.ts`, en uitbreiden: `apps/web/test/net.test.ts` (of het bestaande testbestand van `net.ts`)

**Interfaces:**
- Gebruikt: `instanceMeldingen` en `leesInstanceMelding` (taak 1), `verzoekIp` (`server/auth/ip.ts`), `leesOmgeving`, `geplandeTakenAan` en `maakPostgresLock`.
- Levert:
  - `net.ts`: `export function ipLimietSleutel(ip: string | undefined): string`
  - `ontvangst.ts`:
    - `export type Limiet = (sleutel: string, nu: number) => boolean`: true betekent toegelaten.
    - `export function maakLimiet(max = 10, vensterMs = 3_600_000): Limiet`: een `Map` van sleutel naar tijdstippen, oude tijdstippen worden bij elke aanroep gewist.
    - `export async function slaMeldingOp(db: Db, melding: InstanceMelding, ip: string | null, nu: Date): Promise<"nieuw" | "bijgewerkt" | "plafond">`
    - `export async function ruimInstanceMeldingenOp(db: Db, nu: Date): Promise<number>`: het aantal gewiste rijen.
    - `export const DAGPLAFOND = 100`, `export const BEWAARDAGEN = 365`

- [ ] **Stap 1: Schrijf de falende tests.**
  - In de test van `net.ts`: `ipLimietSleutel("192.0.2.1")` geeft `"192.0.2.1"`. `ipLimietSleutel("::ffff:192.0.2.1")` geeft `"192.0.2.1"`. `ipLimietSleutel("2001:db8:1:2:aaaa::1")` en `ipLimietSleutel("2001:db8:1:2:bbbb::9")` zijn gelijk en eindigen op `"/64"`. `ipLimietSleutel(undefined)` en `ipLimietSleutel("x")` geven `"onbekend"`.
  - In `instance-ontvangst.test.ts`, op PGlite:
    - `"eerste melding maakt een rij, tweede werkt bij"`: eerst `"nieuw"`, dan `"bijgewerkt"`. Daarna is `aantalMeldingen` 2. `eersteMeldingOp` blijft het eerste tijdstip, `laatsteMeldingOp`, `host`, `versie`, de aantallen en `laatsteIp` zijn die van de tweede melding.
    - `"gelijktijdige meldingen met dezelfde nieuwe id geven één rij"`: `Promise.all` van twee `slaMeldingOp` geeft één rij met `aantalMeldingen` 2. (Review Focus 4)
    - `"plafond: de 101ste nieuwe id op dezelfde UTC-dag wordt niet opgeslagen, een bestaande id wel bijgewerkt"`: zet 100 rijen met `eersteMeldingOp` op vandaag. Een nieuwe id geeft dan `"plafond"` en het aantal rijen blijft 100. Een bestaande id geeft `"bijgewerkt"`. Een nieuwe id de volgende UTC-dag geeft `"nieuw"`.
    - `"limiet: 10 per uur per sleutel"`: met `maakLimiet()` geven 10 aanroepen op `t` true en de 11de false. Een andere sleutel geeft true. Op `t + 3_600_001` weer true.
    - `"opruimen wist alleen meldingen ouder dan 365 dagen"`: een rij van 366 dagen oud wordt gewist, een van 364 dagen niet, en de functie geeft 1.
  - Voor de route: volg het patroon van een bestaande routetest (bv. `test/abonnement-api.test.ts`, die handlers met een nagemaakte H3Event aanroept). Maak `test/instance-api.test.ts`:
    - zonder `ELENTRIK_OMGEVING` (`vi.stubEnv`) geeft het 404 en staat er niets in de tabel (Review Focus 1);
    - met `productie`: een geldige melding geeft 204 en een rij;
    - het lichaam `"geen json"`, `[]` en `null` geven 400 (Review Focus 3);
    - een lichaam van 2049 bytes geeft 413;
    - de 11de melding van hetzelfde IP binnen het uur geeft 429.
- [ ] **Stap 2:** draai de drie testbestanden. Verwacht: FAIL.
- [ ] **Stap 3: Implementeer.**
  - `ipLimietSleutel` gebruikt de interne `parseAdres`.
  - `slaMeldingOp` werkt in één transactie:
    - Bestaat de id al, dan een update.
    - Anders telt hij de rijen met `eerste_melding_op >= begin van de UTC-dag van nu`. Bij 100 of meer geeft hij `"plafond"` en logt hij één `console.warn` per UTC-dag (een datum op moduleniveau).
    - Anders een insert met `onConflictDoUpdate` op `instanceId`, die `aantalMeldingen + 1` zet en de velden bijwerkt.
    - Of het `"nieuw"` of `"bijgewerkt"` was, haal je uit `aantalMeldingen === 1` via `returning`.
  - Route `instances.post.ts`:
    - `defineBeveiligdeHandler(..., { publiek: true })`.
    - De volgorde: omgeving (404, `maakFout`), limiet (429) met de module-singleton `maakLimiet()` en de sleutel `ipLimietSleutel(verzoekIp(event))`.
    - Dan `readRawBody(event, false)`: meer dan 2048 bytes geeft 413, `JSON.parse` in try/catch en `leesInstanceMelding` geven 400.
    - Dan `slaMeldingOp(gebruikDb(), melding, verzoekIp(event) ?? null, new Date())`, `setResponseStatus(event, 204)`, en `null` teruggeven.
    - Foutcodes in `maakFout`: voeg `INSTANCE_ONBEKEND`, `INSTANCE_TE_VEEL`, `INSTANCE_TE_GROOT` en `INSTANCE_ONGELDIG` toe aan het type `Foutcode`.
  - Taak `instance:opruimen`: als `!geplandeTakenAan() || leesOmgeving(process.env) !== "productie"`, `{ result: { gewist: 0 } }`. Anders `ruimInstanceMeldingenOp` onder `maakPostgresLock(gebruikPostgres(), "instance:opruimen")`.
- [ ] **Stap 4:** draai de drie testbestanden en daarna `pnpm test:parallel`. Verwacht: PASS, ook `test/routes-beveiligd.test.ts`.
- [ ] **Stap 5: Commit** `feat(web): receive instance pings on elentrik.app`

### Taak 3: Versturen vanaf een zelf gehoste kopie

**Bestanden:**
- Maak: `apps/web/server/instance/ping.ts`
- Maak: `apps/web/server/tasks/instance/ping.ts`
- Maak: `apps/web/server/plugins/instance-ping.ts`
- Wijzig: `apps/web/nuxt.config.ts` (`scheduledTasks`: `"30 3 * * *": ["instance:ping"]`)
- Wijzig: `apps/web/playwright.config.ts` (env `ELENTRIK_INSTANCE_PING: "uit"`), `playwright.sw.config.ts` als die een eigen server start
- Wijzig: `deploy/nas/rooktest.sh`: `-e "ELENTRIK_INSTANCE_PING=uit"` in `WEB_ENV` en in de `docker run` van `-zonder`, plus elke andere `docker run` van `$IMAGE`/`$IMAGE_KAPOT` die de app start
- Wijzig: `deploy/nas/.env.rooktest` (`ELENTRIK_INSTANCE_PING=uit`)
- Wijzig: `apps/web/Dockerfile`: in de runtime-stage `ARG ELENTRIK_REVISIE=` en `ENV ELENTRIK_REVISIE=${ELENTRIK_REVISIE}`
- Wijzig: `.github/workflows/web-image.yml`: `build-args: ELENTRIK_REVISIE=${{ github.sha }}`
- Test: `apps/web/test/instance-ping.test.ts`

**Interfaces:**
- Gebruikt: `instance`, `InstanceMelding` (taak 1), `leesOmgeving`, `geplandeTakenAan`, `organization` en `user` uit het schema.
- Levert:
  - `export const INSTANCE_PING_URL = "https://elentrik.app/api/instances"`
  - `export function pingActief(env: Record<string, string | undefined>): boolean`
  - `export function hostUit(basisUrl: string | undefined): string | null`: de hostnaam in kleine letters, zonder blokhaken, of null.
  - `export async function zorgVoorInstanceId(db: Db): Promise<string>`: insert `{ id: randomUUID() }` met `onConflictDoNothing` op `sleutel`, en lees daarna de enige rij. Twee processen tegelijk krijgen zo hetzelfde id.
  - `export async function bouwMelding(db: Db, env): Promise<InstanceMelding | null>`: null als `hostUit` null geeft.
  - `export async function verstuurPing(opties: { db: Db; env: Record<string, string | undefined>; fetch?: typeof fetch }): Promise<"verstuurd" | "uit" | "mislukt">`: geeft `"uit"` zonder netwerk als `!pingActief(env)`.

- [ ] **Stap 1: Schrijf de falende tests** `test/instance-ping.test.ts`:
  - `"pingActief"` (`it.each`):
    - `{ NODE_ENV: "production" }` geeft true;
    - zonder `NODE_ENV` false;
    - met `ELENTRIK_OMGEVING: "productie"` false, met `"staging"` false;
    - met `ELENTRIK_INSTANCE_PING: " UIT "` false;
    - met `ELENTRIK_GEPLANDE_TAKEN: "uit"` false;
    - met `ELENTRIK_OMGEVING: "iets-anders"` true (onbekend telt als leeg).
  - `"hostUit"`:
    - `"https://Kopie.Example:8443/app"` geeft `"kopie.example"` (Review Focus 5);
    - `"http://[2001:db8::1]:3000"` geeft `"2001:db8::1"`;
    - `undefined`, `""` en `"geen url"` geven null.
  - `"zorgVoorInstanceId geeft altijd hetzelfde id"`: twee aanroepen, ook gelijktijdig, geven dezelfde UUID, en de tabel `instance` heeft één rij.
  - `"bouwMelding telt organisaties en gebruikers en leest de versie"`: maak 2 organisaties (`maakTestOrganisatie`) en 1 gebruiker. Met `{ BETTER_AUTH_URL: "https://kopie.example", ELENTRIK_REVISIE: "abc1234", STRIPE_GEHEIME_SLEUTEL: "sk_test_x" }` geeft het `aantalOrganisaties: 2`, `aantalGebruikers: 1`, `versie: "abc1234"` en `abonnementenAan: true`. Zonder `ELENTRIK_REVISIE` is `versie` `"onbekend"`. Het resultaat slaagt voor `leesInstanceMelding`.
  - `"verstuurPing post naar het eindpunt"`: een nep-`fetch` ontvangt `INSTANCE_PING_URL` (of `ELENTRIK_INSTANCE_PING_URL` als die gezet is), methode POST, de header `user-agent: Elentrik-instance-ping` en een JSON-lichaam gelijk aan `bouwMelding`. Het resultaat is `"verstuurd"`.
  - `"verstuurPing doet niets als hij uit staat"`: de nep-`fetch` wordt niet aangeroepen en het resultaat is `"uit"`.
  - `"verstuurPing slikt fouten"`:
    - een `fetch` die rejectet, of een antwoord met status 500, geeft `"mislukt"` zonder exception;
    - `console.warn` (spy) wordt over twee mislukte aanroepen samen één keer aangeroepen;
    - zonder `BETTER_AUTH_URL` geeft het `"mislukt"`, zonder fetch-aanroep (Review Focus 2).
- [ ] **Stap 2:** draai `pnpm vitest run apps/web/test/instance-ping.test.ts`. Verwacht: FAIL.
- [ ] **Stap 3: Implementeer** `ping.ts`.
  - De waarschuwing komt één keer per proces, met een vlag op moduleniveau. Exporteer `__resetWaarschuwing()` alleen voor tests, of geef de vlag mee via de opties.
  - De taak `instance:ping` roept `verstuurPing({ db: gebruikDb(), env: process.env })` aan en geeft `{ result: { status } }`.
  - De plugin doet `if (pingActief(process.env)) setTimeout(() => void verstuurPing(...), 60_000).unref()`.
- [ ] **Stap 4:** draai de test (PASS) en `pnpm test:parallel` (PASS, ook `test/ci-workflow.test.ts` en `test/deploy-docs.test.ts` als die de workflow of de rooktest controleren). Draai ook `pnpm --filter @elentrik/web build`. Verwacht: build zonder fouten.
- [ ] **Stap 5: Commit** `feat(web): send a daily instance ping from self-hosted copies`

### Taak 4: Admin-pagina "Installaties"

**Bestanden:**
- Maak: `apps/web/shared/admin/instances.ts`
- Maak: `apps/web/server/admin/instances.ts`
- Maak: `apps/web/server/api/admin/instances.get.ts`
- Wijzig: `apps/web/app/composables/useAdminApi.ts`: methode `instances(query)`
- Maak: `apps/web/app/pages/admin/installaties.vue`
- Wijzig: `apps/web/app/layouts/admin.vue`: link `/admin/installaties` met het label `admin.installaties`, na `projecten`
- Wijzig: `apps/web/i18n/locales/{nl,fr,en}.json`, onder `admin`
- Test: `apps/web/test/admin-instances.test.ts`, `apps/web/e2e/admin-instances.spec.ts`

**Interfaces:**
- Gebruikt: `instanceMeldingen` (taak 1), `vereisSuperuser`, `AdminPagina`.
- Levert:
  - `export type AdminInstance = { instanceId: string; host: string; versie: string; abonnementenAan: boolean; aantalOrganisaties: number; aantalGebruikers: number; eersteMeldingOp: string; laatsteMeldingOp: string; aantalMeldingen: number; laatsteIp: string | null; stil: boolean }` (datums als ISO-string)
  - `export async function lijstInstances(db: Db, nu: Date, invoer: Record<string, unknown> = {}): Promise<AdminPagina<AdminInstance>>`: gesorteerd op `laatsteMeldingOp` aflopend, 50 per pagina, `pagina` uit de invoer zoals in `lijstOpvolging`. `stil` is `nu - laatsteMeldingOp > 7 dagen`.

- [ ] **Stap 1: Schrijf de falende tests.**
  - `admin-instances.test.ts`:
    - drie rijen geven de volgorde nieuwste eerst;
    - `stil` is true voor 8 dagen oud en false voor 6 dagen;
    - `totaal` is 3;
    - 51 rijen geven op pagina 2 één item.
  - De bestaande toegangstest voor admin-routes (bv. `test/admin-toegang.test.ts`, of de lijst die alle `/api/admin`-routes controleert): de nieuwe route geeft 403 aan een niet-superuser.
- [ ] **Stap 2:** draai ze. Verwacht: FAIL.
- [ ] **Stap 3: Implementeer** de functie, de route (zoals `opvolging.get.ts`), de API-methode en de pagina volgens `pages/admin/opvolging.vue`:
  - `AdminStatus`;
  - een tabel (`UTable` of de bestaande `AdminLijst` als die past) met de kolommen host, versie, Stripe (aan/uit), organisaties, gebruikers, eerste melding, laatste melding en IP, met datums via `useAdminDatums`;
  - een `UBadge` "Stil" bij `stil`;
  - de lege staat `admin.geenInstances`;
  - paginering.
  - i18n nl:
    - `installaties`: "Installaties"
    - `geenInstances`: "Nog geen zelf gehoste installatie gemeld."
    - `stil`: "Stil"
    - kolommen: "Host", "Versie", "Stripe", "Organisaties", "Gebruikers", "Eerste melding", "Laatste melding", "IP"
    - "Aan"/"Uit"
  - fr en en vertaal je vrij.
- [ ] **Stap 4: Schrijf de e2e-test** `e2e/admin-instances.spec.ts`, naar het voorbeeld van `admin-dashboard.spec.ts`:
  - maak een superuser;
  - voeg via `metE2eDatabase` een rij in met host `e2e-kopie.example`;
  - open `/admin/installaties` en controleer dat de host en "Stil" (rij van 8 dagen oud) zichtbaar zijn;
  - verwijder de rij in `finally`.
- [ ] **Stap 5:** draai `pnpm test:parallel` (PASS) en `pnpm --filter @elentrik/web exec playwright test e2e/admin-instances.spec.ts e2e/admin-dashboard.spec.ts` (PASS). E2e gebruikt `elentrik_e2e`.
- [ ] **Stap 6: Commit** `feat(web): show reported instances in the admin dashboard`

### Taak 5: Documentatie

**Bestanden:**
- Wijzig: `README.md` (nieuwe sectie "Instance-ping")
- Wijzig: `apps/web/.env.example`
- Wijzig: `LICENSE` (één alinea, vóór de garantie-alinea)
- Maak: `docs/privacy-instance-ping.md`

- [ ] **Stap 1: README.** Beschrijf:
  - wanneer de ping verstuurt: de vier voorwaarden, 60 s na de start en dagelijks om 03:30 in de tijdzone van de container;
  - de zes velden, elk met uitleg;
  - dat elentrik.app het IP van de laatste melding bewaart, 12 maanden na de laatste melding;
  - het doel (licentiehandhaving);
  - hoe je de ping uitzet (`ELENTRIK_INSTANCE_PING=uit`), en dat `ELENTRIK_GEPLANDE_TAKEN=uit` hem ook uitzet;
  - dat `pnpm dev` zich nooit meldt.
- [ ] **Stap 2: `.env.example`.** Voeg uitgecommentarieerd toe:
  - `# ELENTRIK_INSTANCE_PING=uit`, met een regel uitleg en een verwijzing naar de README;
  - `ELENTRIK_REVISIE`, als "zet de Dockerfile zelf".
- [ ] **Stap 3: LICENSE.** Voeg letterlijk deze alinea toe:

  ```text
  Een uitgerolde kopie van de Software (een productiebuild buiten elentrik.app) meldt zich één keer
  per dag bij https://elentrik.app met een willekeurige instance-ID, de hostnaam, de versie, of
  abonnementen aan staan en het aantal organisaties en gebruikers. Wat er precies verstuurd wordt en
  hoe u dat uitschakelt, staat in de README onder "Instance-ping". Het uitschakelen van de melding
  geeft geen rechten bovenop wat deze licentie toestaat.
  ```

- [ ] **Stap 4: `docs/privacy-instance-ping.md`.** Neem op:
  - verwerkingsverantwoordelijke: Steff Beckers, contact `steff@steffbeckers.com` (staat al in de LICENSE);
  - doel: licentiehandhaving;
  - grondslag: gerechtvaardigd belang (art. 6.1.f AVG);
  - de gegevens: de zes velden plus het IP;
  - bewaartermijn: 12 maanden na de laatste melding;
  - ontvangers: geen;
  - rechten en bezwaar: uitschakelen of mailen;
  - een regel dat de tekst bedoeld is om in een privacyverklaring op te nemen en nog juridisch nagekeken moet worden.
- [ ] **Stap 5:** draai `pnpm test:parallel`. Verwacht: PASS, ook `test/deploy-docs.test.ts` en `test/configuratie.test.ts` als die `.env.example` controleren.
- [ ] **Stap 6: Commit** `docs: document the instance ping in README, LICENSE and a privacy note`
