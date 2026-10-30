# Verstevigen na de livegang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De bestanden en de beveiliging sluiten (geen uploads zonder lengte, geen bestanden van verwijderde projecten, dagelijks opruimen, sessietokens beoordeeld) en de gekende gebruikersfouten oplossen.

**Architecture:**
- Kleine, gerichte wijzigingen in de bestaande routes, de composables en de componenten.
- Eén nieuwe dagelijkse Nitro-taak, met hetzelfde patroon als de inhaaltaak uit plan 9: een advisory lock, `ELENTRIK_GEPLANDE_TAKEN`, injecteerbare afhankelijkheden en een log met alleen aantallen.

**Tech Stack:** Nuxt 4 / Nitro, Drizzle met PostgreSQL 16 (tests op PGlite), Better Auth 1.7.7, Stripe SDK 23, Vitest en Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-elentrik-verstevigen-design.md` (goedgekeurd)

## Global Constraints

- **Uploads:**
  - zonder geldige `Content-Length`: `411`, met `data.code = "LENGTE_VEREIST"`;
  - te groot: `413` `BESTAND_TE_GROOT`, zoals nu.
- **Isolatie:** een bestand van een verwijderd project geeft `nietGevondenFout()` (404 `NIET_GEVONDEN`), identiek aan een onbekend bestand.
- **Opruimtaak:**
  - dagelijks om 04:00 Europe/Brussels (cron `0 4 * * *`, met de TZ van de container);
  - een advisory lock;
  - `ELENTRIK_GEPLANDE_TAKEN` (standaard aan in productie, `uit` zet ze altijd uit, `aan` zet ze aan buiten productie);
  - een verwijderd project wordt na **30 dagen** definitief gewist;
  - verweesde planbestanden worden na **30 dagen** gewist (een plan in een lokaal concept in de browser mag een maand wachten); oude logo's en bestanden op schijf zonder rij na **7 dagen**;
  - eerst de rij, dan het bestand;
  - het log bevat alleen aantallen.
- **Nieuwe foutcodes** komen in `shared/foutcodes.ts`, met `fouten.<CODE>` in nl, fr en en.
- **Alle nieuwe UI-teksten** komen in de drie talen (de pariteitstest) en volgen `docs/vertalingen.md`.
- **Projectregels:**
  - tests nooit tegen de echte database `elentrik`;
  - expliciete imports in servercode die Vitest importeert;
  - commits ondertekend, met exact `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - niet pushen.

## Review Focus

1. **De opruimtaak wist een plan dat alleen nog in een snapshot staat.** Dat mag nooit: het plan blijft staan. Test: Task 2.
2. **Productie en staging ruimen elk alleen hun eigen database en opslagmap op.** Een bestand op schijf zonder rij wordt alleen gewist in de eigen `ELENTRIK_BESTANDEN_DIR`. Test: Task 2.
3. **Een gewone upload vanuit de browser na de lengte-eis.** Die blijft werken. Test: Task 1 (Playwright, de bestaande plan-upload-specs).
4. **Twee snelle klikken op "Bewaren" na een bedrijfswissel.** Er is één verzoek, voor het juiste bedrijf. Test: Task 4.
5. **Het project wordt in een ander venster verwijderd tijdens het tekenen.** De gebruiker krijgt een duidelijke keuze, en zijn wijzigingen gaan niet verloren. Test: Task 5 (Playwright).

---

### Task 1: Uploads met lengte, bestanden van verwijderde projecten, index

**Files:**
- `apps/web/server/utils/bestanden.ts` (`controleerUploadGrootte`);
- `apps/web/server/api/bestanden/[id].get.ts`;
- `apps/web/server/bestanden/repo.ts` (bestand met de status van zijn project);
- `apps/web/server/db/schema.ts` en migratie `0009_*.sql`;
- `apps/web/shared/foutcodes.ts`;
- `i18n/locales/*.json`;
- tests `test/bestanden-api.test.ts` en `test/bestanden-utils.test.ts`.

- [ ] **Step 1: Schrijf de falende tests**
  - **Upload:** een upload zonder `content-length`, of met een ongeldige waarde, geeft 411 `LENGTE_VEREIST`, zowel voor het plan als voor het logo. Met een geldige lengte gaat ze door, en boven de limiet volgt 413.
  - **Download:** een bestand (plan of export) van een soft-deleted project geeft dezelfde body en status als een onbekend id, ook voor een lid van dat bedrijf. Een logo blijft werken.
  - **Migratie:** de migratie maakt een index op `bestanden.project_id` (controleer `pg_indexes`).
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer.** Controleer dat de client voor uploads altijd een lengte meestuurt (`FormData` via `$fetch` of `fetch`).
- [ ] **Step 4: Draai de suite, de typecheck en de Playwright-specs die uploaden**
  Run: `pnpm test && pnpm typecheck` en `cd apps/web && npx playwright test e2e/situatie.spec.ts e2e/bedrijf.spec.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "fix(web): uploads alleen met lengte, geen bestanden van verwijderde projecten, index op project"`

---

### Task 2: Dagelijkse opruimtaak

**Files:**
- `apps/web/server/bestanden/opruimen.ts`: de pure kern, met injecteerbare database, opslag, klok en lock;
- `apps/web/server/tasks/bestanden/opruimen.ts`: de Nitro-taak;
- `apps/web/nuxt.config.ts`: `scheduledTasks` `"0 4 * * *"`;
- `apps/web/server/bestanden/opslag.ts`: sleutels oplijsten met hun leeftijd, en wissen, als die functies nog ontbreken;
- test `test/bestanden-opruimen.test.ts`.

**Interfaces:**
- `ruimOp(deps: { db; opslag; nu: Date; metLock }): Promise<{ projecten: number; planbestanden: number; logos: number; losseBestanden: number }>`.
- Hergebruik de lock en de controle van `ELENTRIK_GEPLANDE_TAKEN` uit de inhaaltaak (`server/abonnementen/inhalen.ts`: `geplandeTakenAan` en `postgresLock`). Verplaats ze zo nodig naar een gedeelde module.

- [ ] **Step 1: Schrijf de falende tests (PGlite en een nep-opslag)**
  - **Prullenbak:** verwijderd op `nu − 31 d` → gewist, met de snapshots, de exports, de bestandsrijen en de bestanden. Verwijderd op `nu − 29 d` → blijft staan.
  - **Planbestand:**
    - een planbestand waarnaar het huidige document verwijst, blijft staan;
    - een planbestand waarnaar alleen een snapshot verwijst, blijft staan;
    - een planbestand waarnaar niets verwijst en dat ouder is dan 30 dagen, wordt gewist; jonger dan 30 dagen blijft het staan.
  - **Logo:** het huidige logo blijft staan; een oud logo ouder dan 7 dagen wordt gewist.
  - **Bestand op schijf zonder rij:** ouder dan 7 dagen wordt het gewist, jonger blijft het staan.
  - **Lock:** met een bezet lock wordt er niets gewist.
  - **Volgorde:** faalt het wissen op schijf, dan is de rij al weg, en wist de volgende run het bestand.
  - **Log:** het log bevat geen sleutels en geen namen.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer.** Zoek de verwijzingen in het document met de bestaande modelhelpers voor de situatiepagina's, of in de JSON van het document en de snapshots.
- [ ] **Step 4: Draai de tests, de volledige suite en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(web): dagelijks opruimen van de prullenbak en van verweesde bestanden"`

---

### Task 3: Sessietokens beoordelen

**Files:**
- onderzoek in `node_modules/better-auth` (de versie uit de lockfile);
- `docs/lokaal-en-online.md`: één feitelijke zin bij de beveiliging;
- test `test/auth-cookie.test.ts`.

- [ ] **Step 1:** Ga in de broncode van Better Auth 1.7.7 na hoe het sessiecookie gemaakt en gecontroleerd wordt. Is het `token.signature` (HMAC met het geheim), en wordt een cookie met alleen het token geweigerd?
- [ ] **Step 2:** Schrijf een test tegen de echte auth op PGlite: een verzoek met als cookiewaarde alleen het token uit de database (zonder handtekening) krijgt geen sessie.
- [ ] **Step 3:**
  - Klopt het, dan komt er één zin in `docs/lokaal-en-online.md`: de tokens staan onversleuteld, maar zonder `BETTER_AUTH_SECRET` geven ze geen sessie; bewaar back-ups versleuteld.
  - Klopt het niet, stop dan en rapporteer `DONE_WITH_CONCERNS`, met een voorstel voor een mitigatie.
- [ ] **Step 4: Commit**
  `git commit -m "docs: sessietokens beoordeeld"` (met de test).

---

### Task 4: Instellingen, werfadres en exportconflict

**Files:**
- `apps/web/app/pages/instellingen.vue` (en een eventuele helper of composable);
- `apps/web/app/editor/projectformulier.ts`;
- `packages/model`, alleen als het leegmaken van het werfadres het model raakt;
- `apps/web/app/components/editor/ExportDialoog.vue` en de conflictafhandeling in `app/pages/projecten/[id].vue`;
- `i18n/locales/*.json`;
- tests `test/bedrijf-formulier.test.ts`, `test/editor-projectformulier.test.ts` en `test/export.test.ts` (of de bestaande tests van de conflictafhandeling).

- [ ] **Step 1: Schrijf de falende tests**
  - **Instellingen:**
    - het formulier bewaart voor het bedrijf waarvoor het geladen werd, en stuurt dat bedrijf mee in `x-elentrik-organisatie`;
    - een tweede bewaaractie tijdens een lopende geeft geen tweede verzoek;
    - na een 409 `ANDERE_ORGANISATIE` laadt het formulier de gegevens van het actieve bedrijf opnieuw voordat bewaren weer kan.
  - **Werfadres:** alle velden leeg geeft een leeg werfadres in de wijziging, en het document krijgt een leeg werfadres. Een gedeeltelijk ingevuld adres volgt de bestaande validatie.
  - **Exportconflict:**
    - de conflicttekst bij een export zonder lokale wijzigingen noemt geen "lokale wijzigingen";
    - "kopie" maakt een project van de actuele serverversie (haal die op vóór het kopiëren).
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer.** De nieuwe teksten komen in de drie talen.
- [ ] **Step 4: Draai de tests, de volledige suite en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "fix(web): bedrijfsgegevens per geladen bedrijf, werfadres leegmaken en juiste exportconflictmelding"`

---

### Task 5: Project elders verwijderd, en een fout bij het inloggen met een link

**Files:**
- `apps/web/app/composables/useAutosave.ts`: een status of signaal voor "verwijderd" bij een 404 `NIET_GEVONDEN`;
- `apps/web/app/pages/projecten/[id].vue`: de melding met de twee keuzes;
- `apps/web/server/auth/index.ts` en `server/api/auth/[...all].ts`: een fout na de verificatie van de inloglink wordt een redirect naar `/inloggen?fout=<CODE>`;
- `apps/web/app/pages/inloggen.vue`: de melding en "Stuur een nieuwe link";
- `i18n/locales/*.json`;
- tests `test/autosave.test.ts`, een servertest voor de redirect, en `e2e/verlaten.spec.ts` of een nieuwe e2e-spec.

- [ ] **Step 1: Schrijf de falende tests**
  - **Autosave:**
    - een 404 bij het bewaren geeft de status `verwijderd`, bewaart het concept lokaal en probeert niet opnieuw;
    - "Bewaar als nieuw project" maakt een nieuw project met het huidige document;
    - "Terug naar de projecten" verlaat de pagina zonder vertrekvraag over onbewaarde wijzigingen in het verwijderde project, maar het concept blijft lokaal bewaard.
  - **Inloglink:** een gesimuleerde fout in de sessiehook na een geldige inloglink geeft een 302 naar `/inloggen?fout=INLOGLINK_MISLUKT` en geen 500. De inlogpagina toont de vertaalde melding en de knop.
  - **Playwright:** open een project, verwijder het via de API in een tweede context, en wijzig iets. De melding verschijnt, en "Bewaar als nieuw project" opent het nieuwe project met de wijziging.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer**
- [ ] **Step 4: Draai de tests, de volledige suite, de typecheck en de betrokken Playwright-specs**
  Run: `pnpm test && pnpm typecheck` plus de betrokken Playwright-specs.
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "fix(web): duidelijke keuze als een project elders verwijderd werd, en een vriendelijke fout bij een mislukte inloglink"`

---

### Task 6: Alleen-lezen, vrijgesteld bedrijf en Stripe-klant

**Files:**
- `apps/web/app/components/editor/ProjectgegevensDialoog.vue`: een alleen-lezenmodus;
- `apps/web/app/components/situatie/PlanToevoegenDialoog.vue`: een 402 toont de alleen-lezenmelding, via de bestaande helper;
- de bewerkingsdialogen die bij de overgang naar alleen-lezen stil sluiten (zoek ze op);
- `apps/web/app/abonnement/weergave.ts` en `app/pages/abonnement.vue`: een vrijgesteld bedrijf krijgt geen kaarten;
- `apps/web/server/abonnementen/stripe.ts` en `beheer.ts`: een bestaande klant zoeken, plus een idempotency key;
- `test/nep-stripe.ts`;
- tests `test/editor-alleen-lezen.test.ts`, `test/abonnement-weergave.test.ts`, `test/abonnement-api.test.ts` en `test/abonnement-config.test.ts`.

- [ ] **Step 1: Schrijf de falende tests**
  - **Projectgegevens:** in alleen-lezen opent de dialoog met uitgeschakelde velden en zonder bewaarknop.
  - **Plan uploaden:** een 402 `ABONNEMENT_VEREIST` toont de alleen-lezentekst.
  - **Open dialoog:** een dialoog die openstaat bij de overgang naar alleen-lezen toont een melding en sluit niet stil.
  - **Vrijgesteld:** `paginaWeergave` voor een vrijgesteld bedrijf geeft geen kaarten en toont de status "Je bedrijf hoeft niet te betalen".
  - **Stripe-klant:**
    - `startCheckout` zonder klantrij, terwijl er in Stripe al een klant bestaat met `metadata.organisatieId`, hergebruikt die klant: geen `maakKlant`;
    - `maakKlant` stuurt een idempotency key `klant-<organisatieId>` mee (controleer dat op de draad met de SDK-test).
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer.** `StripePoort` krijgt `zoekKlant(organisatieId)` (`customers.search` met de metadata-query, of `list` met een filter). Breid de nep-poort en de e2e-nep-Stripe uit.
- [ ] **Step 4: Draai de tests, de volledige suite, de typecheck en Playwright**
  Run: `pnpm test && pnpm typecheck && (cd apps/web && npx playwright test)`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "fix(web): projectgegevens bekijken in alleen-lezen, juiste meldingen, vrijgesteld zonder kaarten en geen losse Stripe-klant"`
