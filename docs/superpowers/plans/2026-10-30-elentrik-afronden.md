# Afronden na plan 11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De opvolgpunten uit plan 11 sluiten en de technische schuld uit de plannen 3 tot en met 10 wegwerken. Het gaat om planverwijzingen, een opslaglimiet per bedrijf, de foutpaden van de inloglinks, de randgevallen van de opruimtaak, een grens op de body, gedeelde types, opgeruimde e2e-tests, sterkere tests en gepinde CI.

**Architecture:**
- Kleine, gerichte wijzigingen in de bestaande routes, de composables en de tests.
- Twee nieuwe servermodules:
  - de controle van de planverwijzingen;
  - de opslagtelling per bedrijf.
- Eén e2e-opruimhulp die alle specs gebruiken.

**Tech Stack:** Nuxt 4 / Nitro, Drizzle met PostgreSQL 16 (tests op PGlite), Better Auth 1.7.7, Vitest, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-30-elentrik-afronden-design.md` (goedgekeurd)

## Global Constraints

- **Nieuwe foutcodes:**
  - `PLANBESTAND_ONBEKEND` (422);
  - `OPSLAG_VOL` (413).
  - Ze komen in `shared/foutcodes.ts`, met `fouten.<CODE>` in nl, fr en en.
- **Opslaglimiet:**
  - standaard **5 GB** per bedrijf (5120 MB), in te stellen met `ELENTRIK_OPSLAG_PER_BEDRIJF_MB`;
  - het telt de levende projecten plus de logo's van het bedrijf; de prullenbak telt niet mee;
  - exports worden nooit geweigerd.
- **JSON-body:**
  - zonder geldige `Content-Length`: `411 LENGTE_VEREIST`;
  - boven **50 MB**: `413`.
- **Gotenberg:** `--api-timeout=55s`; de client blijft op 60 s.
- **Redirect na een mislukte link:**
  - `/inloggen?fout=INLOGLINK_MISLUKT`, met optioneel `&terug=<pad>`;
  - `terug` is alleen een relatief pad dat met precies één `/` begint (dus niet `//`, en geen schema).
- **Alle nieuwe UI-teksten** komen in de drie talen (de pariteitstest) en volgen `docs/vertalingen.md`.
- **Projectregels:**
  - tests nooit tegen de echte database `elentrik` of `apps/web/.data`; e2e alleen tegen `elentrik_e2e` en de e2e-opslagmap;
  - de lokale infra-containers niet aanraken;
  - expliciete imports in servercode die Vitest importeert;
  - commits ondertekend, met exact `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - niet pushen;
  - `docs/online.md` niet wijzigen.

## Review Focus

1. **Een bestaand project, gekopieerd vóór plan 11, wordt automatisch bewaard.** Zijn document verwijst nog naar plannen van het origineel. Het moet gewoon bewaard worden, zonder 422. Test: Task 1.
2. **Een bedrijf dat precies op de limiet zit, uploadt een plan.** Is het nieuwe bestand groter dan de resterende ruimte, dan volgt 413 `OPSLAG_VOL` en wordt er niets geschreven, ook geen half bestand. Test: Task 2.
3. **`terug` met een ander domein.** `//evil.example`, `https://evil.example`, `/\evil.example` en `%2F%2Fevil.example` vallen allemaal weg. Test: Task 3.
4. **Het NAS-volume is om 04:00 niet aangekoppeld.** De run doet niets, er wordt geen project ontgrendeld en niets gewist. Test: Task 5.
5. **Een groot project met veel situatiepagina's.** Het blijft onder de grens van 50 MB, en het bewaren lukt. Test: Task 5 (meting in het rapport, plus een test met een body net onder en net boven de grens).

---

### Task 1: Planverwijzingen bij het bewaren

**Files:**
- Create: `apps/web/server/projecten/planverwijzingen.ts`
- Modify: de bewaarroute `apps/web/server/api/projecten/[id].put.ts` (of hoe die heet) en `server/projecten/repo.ts` (`bewaarProject`)
- Modify: `apps/web/shared/foutcodes.ts`, `i18n/locales/*.json`
- Test: `apps/web/test/projecten-planverwijzingen.test.ts` en de bestaande API-test van het bewaren

**Interfaces:**
- Produces: `nieuwePlanIds(bewaard: ProjectDocument, nieuw: ProjectDocument): string[]` (de ids in `nieuw` die niet in `bewaard` stonden, ontdubbeld) en `controleerPlanverwijzingen(db, projectId: string, ids: string[]): Promise<void>` (gooit 422 `PLANBESTAND_ONBEKEND` als een id geen `plan-origineel`/`plan-raster` van dit project is).

- [ ] **Step 1: Schrijf de falende tests**
  - `nieuwePlanIds` geeft alleen de nieuwe id's, zowel `origineelBestandId` als `rasterBestandId`, over alle situatiepagina's.
  - **422:** een PUT met een nieuwe id van een plan van een ander project, van een ander bedrijf, een onbekende uuid of een logo-id geeft 422 `PLANBESTAND_ONBEKEND`. Het document in de database is dan onveranderd.
  - **Bewaard:** een PUT met een nieuw plan van dit project lukt.
  - **Bewaard:** een PUT waarin een id al in het bewaarde document stond en naar een ander project of naar niets wijst, lukt (Review Focus 1).
  - **Bewaard:** na `uit-document` en na `dupliceer` lukt de eerste PUT van het nieuwe project.
  - De editor toont bij 422 `PLANBESTAND_ONBEKEND` de vertaalde melding via de bestaande foutvertaling.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer.** Lees het bewaarde document in dezelfde transactie als de update, met de bestaande versiecontrole, zodat er geen race is tussen de controle en het schrijven.
- [ ] **Step 4: Draai de tests, de volledige suite en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "fix(web): een document kan geen nieuwe verwijzing naar een vreemd plan krijgen"`

---

### Task 2: Opslaglimiet per bedrijf

**Files:**
- Create: `apps/web/server/bestanden/opslagruimte.ts`
- Modify:
  - de plan- en logo-uploadroutes, met `controleerUploadGrootte` in `server/utils/bestanden.ts` als gemeenschappelijk punt;
  - `server/api/projecten/[id]/dupliceer.post.ts`;
  - `server/api/projecten/uit-document.post.ts`;
  - `server/projecten/repo.ts` (de grootte van de te kopiëren bestanden);
  - `server/config/controle.ts` en `deploy/nas/.env.voorbeeld` (de variabele documenteren, als commentaar);
  - `shared/foutcodes.ts` en `i18n/locales/*.json`;
  - de clientmelding bij upload, dupliceren en "Bewaar als nieuw project".
- Test: `apps/web/test/bestanden-opslagruimte.test.ts`, plus de bestaande API-tests van upload, dupliceer en uit-document.

**Interfaces:**
- Produces:
  - `opslagLimietBytes(env = process.env): number`: standaard `5120 * 1024 * 1024`; `ELENTRIK_OPSLAG_PER_BEDRIJF_MB` moet een positief geheel getal zijn, anders faalt de opstartcontrole;
  - `gebruikteOpslag(db, organisatieId: string): Promise<number>`;
  - `controleerOpslagruimte(db, organisatieId: string, extraBytes: number, limiet = opslagLimietBytes()): Promise<void>`: gooit 413 `OPSLAG_VOL` als `gebruikt + extraBytes > limiet`.

- [ ] **Step 1: Schrijf de falende tests**
  - **Telling:**
    - `gebruikteOpslag` telt de plannen en exports van de levende projecten plus de logo's van het bedrijf;
    - projecten in de prullenbak en andere bedrijven tellen niet mee.
  - **Upload:**
    - precies tot de limiet lukt; één byte erover geeft 413 `OPSLAG_VOL`;
    - na een geweigerde upload staat er geen nieuwe rij en geen nieuw bestand in de opslagmap (Review Focus 2).
  - **Dupliceer en uit-document:** boven de limiet volgt 413 `OPSLAG_VOL` en wordt er niets aangemaakt.
  - **Export:** een export boven de limiet lukt.
  - **Configuratie:** de opstartcontrole weigert `ELENTRIK_OPSLAG_PER_BEDRIJF_MB=0`, `-1` en `abc`, en aanvaardt `100` en een lege waarde.
  - **Client:** een 413 `OPSLAG_VOL` toont bij de upload, het dupliceren en "Bewaar als nieuw project" de vertaalde melding.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer.**
  - Doe de controle vóór er een byte geschreven wordt. Gebruik de `Content-Length` als `extraBytes` voor een upload, en de som van `grootte` van de te kopiëren rijen voor dupliceer en uit-document.
  - Een kleine overschrijding door twee gelijktijdige uploads is aanvaard; geen lock.
- [ ] **Step 4: Draai de tests, de suite, de typecheck en de Playwright-specs die uploaden**
  Run: `pnpm test && pnpm typecheck` en `cd apps/web && npx playwright test e2e/situatie.spec.ts e2e/bedrijf.spec.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(web): opslaglimiet per bedrijf"`

---

### Task 3: Inloglinks: bevestiging, terugkeer en woordkeuze

**Files:**
- Modify: `apps/web/server/auth/inloglink.ts`, `server/api/auth/[...all].ts`, `app/pages/inloggen.vue`, en `i18n/locales/fr.json` en `en.json` (`inloggen.nieuweLink`)
- Test: `apps/web/test/auth-inloglink.test.ts` en `e2e/inloglink-fout.spec.ts`

**Interfaces:**
- Produces: `veiligTerugpad(waarde: unknown): string | null`, in een module die zowel de server als de client kan importeren (bv. `shared/terugpad.ts`).

- [ ] **Step 1: Schrijf de falende tests**
  - **Bevestigingslink:** een gesimuleerde fout in de sessiehook na `GET /api/auth/verify-email` met een geldige token geeft 302 naar `/inloggen?fout=INLOGLINK_MISLUKT`, geen 500. Een 4xx van Better Auth zelf gaat ongewijzigd door.
  - **Inloglink met bestemming:** een fout na `GET /api/auth/magic-link/verify?...&callbackURL=/uitnodiging/abc` geeft 302 naar `/inloggen?fout=INLOGLINK_MISLUKT&terug=%2Fuitnodiging%2Fabc`.
  - **`veiligTerugpad`:**
    - aanvaardt `/projecten` en `/uitnodiging/abc?x=1`;
    - weigert (geeft `null`) `//evil.example`, `https://evil.example`, `/\evil.example`, `%2F%2Fevil.example` na decodering, `javascript:alert(1)`, een lege string en een niet-string (Review Focus 3).
  - **Nieuwe link:** "Stuur een nieuwe link" op `/inloggen?fout=INLOGLINK_MISLUKT&terug=/uitnodiging/abc` vraagt de link aan met `callbackURL: "/uitnodiging/abc"`. Zonder geldig `terug` gebeurt dat met de standaardbestemming.
  - **Woordkeuze:** `inloggen.nieuweLink` is in fr "Envoyer un nouveau lien de connexion" en in en "Send a new sign-in link".
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer.** Breid de bestaande onderschepping van `INLOGLINK_PAD` uit tot een kleine lijst paden. Lees `callbackURL` uit de query van het oorspronkelijke verzoek.
- [ ] **Step 4: Draai de tests, de suite, de typecheck en de Playwright-specs**
  Run: `pnpm test && pnpm typecheck` en `cd apps/web && npx playwright test e2e/inloglink-fout.spec.ts e2e/aanmelden.spec.ts e2e/organisaties.spec.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "fix(web): bevestigingslink zonder kale fout en terug naar de bestemming na een mislukte link"`

---

### Task 4: Editor: upload in een verwijderd project, kopie met plan-id's

**Files:**
- Modify: `apps/web/app/components/situatie/PlanToevoegenDialoog.vue` (en `app/situatie/plan-opladen.ts`), `app/composables/useAutosave.ts` en `app/pages/projecten/[id].vue`
- Test: `apps/web/test/autosave.test.ts`, de test van `plan-opladen`, en `e2e/project-verwijderd.spec.ts`

**Interfaces:**
- Consumes: de toestand `verwijderd` van `useAutosave` (plan 11), en `planBestandIds` en `metNieuweBestandIds` uit `app/editor/kopie.ts`.
- Produces: `useAutosave` krijgt `meldVerwijderd(): void`. Die zet dezelfde toestand als een 404 bij het bewaren.

- [ ] **Step 1: Schrijf de falende tests**
  - **Upload in een verwijderd project:**
    - een 404 bij het uploaden van een plan roept `meldVerwijderd()` aan;
    - de editor toont de bestaande verwijderd-melding met haar twee keuzes, en er verschijnt geen algemene fouttoast;
    - het concept wordt lokaal bewaard.
    - Playwright: verwijder het project via de API en upload daarna een plan; de melding verschijnt.
  - **Kopie met plan-id's:**
    - `bewaarAlsKopie` zonder lokale wijzigingen roept `dupliceer(id, planBestandIds(document))` aan;
    - bij een wijziging tijdens het dupliceren bevat het bewaarde document alleen nieuwe plan-id's uit de mapping.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer**
- [ ] **Step 4: Draai de tests, de suite, de typecheck en de Playwright-specs**
  Run: `pnpm test && pnpm typecheck` en `cd apps/web && npx playwright test e2e/project-verwijderd.spec.ts e2e/export.spec.ts e2e/situatie.spec.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "fix(web): upload in een verwijderd project en kopie altijd met eigen plannen"`

---

### Task 5: Opruimtaak bij een onbereikbare opslagmap, lege mappen, grens op de body

**Files:**
- Modify:
  - `apps/web/server/bestanden/opruimen.ts`;
  - `server/bestanden/opslag.ts` (`BestandOpslag`: lege mappen wissen, en melden of de wortel bestaat);
  - `server/utils/projecten.ts` (`leesBody`).
- Test: `apps/web/test/bestanden-opruimen.test.ts`, `test/bestanden-opslag.test.ts`, en een test voor `leesBody` (nieuw of in de bestaande test van de projectroutes).

**Interfaces:**
- Produces:
  - `BestandOpslag.bestaatWortel(): Promise<boolean>`;
  - `BestandOpslag.wisLegeMap(map: string): Promise<void>`: wist alleen een lege map, en nooit de wortel;
  - `MAX_JSON_BODY = 50 * 1024 * 1024`.

- [ ] **Step 1: Schrijf de falende tests**
  - **Onbereikbare opslagmap (Review Focus 4):**
    - de wortel bestaat niet, of `lijst()` is leeg terwijl `bestanden` rijen heeft;
    - de hele run wist niets en ontgrendelt geen project dat een kopie nog gebruikt;
    - de run logt één waarschuwing met alleen aantallen;
    - het resultaat heeft een vlag, bv. `overgeslagen: "opslag-onbereikbaar"`.
  - **Lege projectmap:** nadat het laatste bestand van een project gewist is, bestaat de map `<projectId>/` niet meer. Een map met nog een bestand blijft staan.
  - **`leesBody`:**
    - zonder `content-length` volgt 411 `LENGTE_VEREIST`;
    - met `content-length` boven 50 MB volgt 413;
    - net onder 50 MB wordt de body gelezen.
  - **Meting (Review Focus 5):** bouw een groot testdocument (bv. 40 situatiepagina's, 2.000 knopen) en noteer de JSON-grootte in het rapport. De test controleert dat het onder `MAX_JSON_BODY` blijft.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer.** Controleer de lengte vóór `readBody`. Controleer dat de client (`$fetch` met een JSON-body) altijd een lengte meestuurt; de bestaande Playwright-specs die bewaren, bewijzen dat.
- [ ] **Step 4: Draai de tests, de suite, de typecheck en de Playwright-specs die bewaren**
  Run: `pnpm test && pnpm typecheck` en `cd apps/web && npx playwright test e2e/editor.spec.ts e2e/projecten.spec.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "fix(web): opruimen wacht op de opslagmap, wist lege mappen, en een grens op de JSON-body"`

---

### Task 6: Gedeelde types, foutcodes en adresvelden

**Files:**
- Create: `apps/web/shared/mij.ts` (of een bestaand gedeeld bestand)
- Modify:
  - `server/organisaties/leden.ts` en de bron van `Mij` aan de serverkant;
  - `app/stores/sessie.ts` en `app/plugins/sessie.ts`;
  - `server/abonnementen/beheer.ts` (`fout`, dat `maakFout` wordt);
  - de plekken die een `APIError` van Better Auth doorgeven;
  - `shared/foutcodes.ts` en `i18n/locales/*.json`;
  - `app/components/editor/AdresVelden.vue` en `app/pages/instellingen.vue`.
- Test: de bestaande tests van `leden`, `beheer`, `sessie-store` en `bedrijf-formulier`, plus een test voor de vertaling van de Better Auth-fouten.

**Interfaces:**
- Consumes: `maakFout` uit `server/fouten.ts`.
- Produces:
  - `type Mij` op één plek;
  - een functie die een `APIError` van Better Auth vertaalt naar een `H3Error` met een code uit `FOUTCODES`, bv. `vertaalAuthFout(fout: unknown): H3Error | null`.

- [ ] **Step 1: Schrijf de falende tests**
  - **Better Auth-fouten:** elke `APIError` die een gebruiker kan tegenkomen bij organisaties, uitnodigingen en leden, wordt een eigen foutcode met een vertaling. De bouwer somt ze op in het rapport. Een onbekende `APIError` blijft de algemene fout.
  - **Geen lokale `fout()`:** in `beheer.ts` en `leden.ts` staat geen lokale `fout()`-functie meer (statische test of grep-test, zoals de bestaande foutcodetest).
  - **`Mij`:** de server en de client importeren hetzelfde type `Mij`; typecheck volstaat.
  - **Instellingen:** `instellingen.vue` gebruikt `AdresVelden`. Een gedeeltelijk ingevuld adres geeft dezelfde validatiefouten als nu (`bedrijf-formulier`-test). `AdresVelden` heeft geen prop `verplicht` meer.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer**
- [ ] **Step 4: Draai de tests, de suite, de typecheck en de Playwright-specs**
  Run: `pnpm test && pnpm typecheck` en `cd apps/web && npx playwright test e2e/bedrijf.spec.ts e2e/organisaties.spec.ts e2e/projectgegevens.spec.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "refactor(web): gedeeld Mij-type, maakFout overal, vertaalde Better Auth-fouten en AdresVelden in de instellingen"`

---

### Task 7: Tests, Gotenberg, configuratie en CI

**Files:**
- Modify:
  - de statische routetest;
  - de bron en de test van `VERTAALDE_PARAMETERS` (in `packages/arei`);
  - de taalscan-test;
  - de export-API-test;
  - `deploy/nas/compose.yaml` (`--api-timeout=55s`), en de lokale compose als die Gotenberg ook start;
  - `server/config/controle.ts` (plaatshouders);
  - `.github/workflows/web-image.yml` (SHA-pins);
  - de root-`package.json` (`packageManager`).
- Test: in die bestaande testbestanden; `deploy/nas/rooktest.sh` alleen als de Gotenberg-controle erin de time-out leest.

- [ ] **Step 1: Schrijf de falende tests**
  - **Routetest:** een route-aanroep die alleen in commentaar staat (`// defineBeveiligdeHandler`) telt niet als beveiligd. Een fixture in de test bewijst dat.
  - **`VERTAALDE_PARAMETERS`:** een test faalt als een parameter met een vertaalde waarde in de AREI-regels niet in de lijst staat, of als de lijst een parameter bevat die niet bestaat. Leid de lijst af als dat eenvoudiger is.
  - **Taalscan:** `MB` staat niet meer op de uitzonderingslijst, en elke hardgecodeerde Intl-locale (`"nl-BE"`, `"fr-BE"`, `"en-GB"`, of een andere string als eerste argument van `Intl.*`/`toLocale*String`) wordt gevonden. Bestaande treffers worden opgelost, niet weggefilterd.
  - **Export:** `POST /api/projecten/:id/exports` zonder `If-Match` geeft 428.
  - **Plaatshouders:** een wachtwoord als `<geheim>wachtwoord123` wordt aanvaard. De exacte plaatshouders uit `deploy/nas/.env.voorbeeld` en `apps/web/.env.example` worden geweigerd.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer.**
  - **Gotenberg:** zet `--api-timeout=55s`.
  - **SHA-pins:** pin elke `uses:` in de workflow op de commit-SHA van de huidige tag, met de tag als commentaar (bv. `actions/checkout@<sha> # v7.0.1`). Haal de SHA op met `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`, en volg een geannoteerde tag naar zijn commit.
  - **`packageManager`:** zet `"packageManager": "pnpm@12.15.0"` in de root-`package.json`, gelijk met de Dockerfile en de workflow.
- [ ] **Step 4: Draai de suite, de typecheck en de rooktest als die geraakt is**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS. Controleer de YAML met een parser.
- [ ] **Step 5: Commit**
  `git commit -m "test: strengere route-, taal- en exporttests; Gotenberg 55 s; plaatshouders, SHA-pins en packageManager"`

---

### Task 8: E2E-opruiming

**Files:**
- Create: `apps/web/e2e/hulp/opruimen.ts`
- Modify:
  - alle specs die projecten, organisaties, gebruikers of bestanden aanmaken;
  - `e2e/talen.spec.ts`;
  - `e2e/abonnement.spec.ts` (geen `$pinia._s`);
  - eventueel `playwright.config.ts` (een globalTeardown).
- Test: de Playwright-suite zelf, plus een Vitest-test voor de veiligheidsgrendel van de hulp.

**Interfaces:**
- Produces: `ruimOp(spoor: E2eSpoor): Promise<void>` en `nieuwSpoor(): E2eSpoor`. Een spec registreert wat hij aanmaakt (project-id's, organisatie-id's, e-mailadressen). De hulp wist dat echt: rijen in de juiste volgorde, plus de bestanden in de e2e-opslagmap.

- [ ] **Step 1: Schrijf de falende tests**
  - **Grendel (Vitest):** `ruimOp` weigert te draaien als de databasenaam niet `elentrik_e2e` is, of als de opslagmap niet de e2e-map is.
  - **Na een volledige run:** `npx playwright test` laat in `elentrik_e2e` geen projecten, organisaties of bestanden van de specs achter, behalve de vaste testgebruikers en hun eerste organisatie. Controleer dat met een telling vóór en na, in het rapport.
  - **Bij een falende test:** ook een spec waarvan een test faalt, ruimt op (`afterAll`, of `test.afterEach` met het spoor).
  - **Talen:** `talen.spec.ts` slaagt per test afzonderlijk (`--grep`), in elke volgorde.
  - **Abonnement:** `abonnement.spec.ts` zet de toestand via de API of via `metE2eDatabase`, niet via `$pinia._s`.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer**
- [ ] **Step 4: Draai de volledige Playwright-suite twee keer na elkaar, plus de suite en de typecheck**
  Run: `pnpm test && pnpm typecheck && (cd apps/web && npx playwright test && npx playwright test)`
  Expected: PASS, twee keer; en de telling na de tweede run is gelijk aan die na de eerste.
- [ ] **Step 5: Commit**
  `git commit -m "test(e2e): specs ruimen op wat ze aanmaken"`
