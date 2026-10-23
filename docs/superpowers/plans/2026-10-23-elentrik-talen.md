# Frans en Engels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elentrik in het Nederlands, Frans en Engels, overal waar de gebruiker iets ziet: de interface, de AREI-bevindingen, het PDF-dossier per project, de mails, de foutmeldingen en Stripe.

**Architecture:**
- **Pure pakketten:** `@elentrik/arei` en `@elentrik/render` krijgen tekstcatalogi per taal.
- **Model:** het document krijgt een optionele dossiertaal.
- **Server:** de gebruiker krijgt `user.taal`, die mails, nieuwe projecten en Stripe stuurt. Fouten krijgen codes die de client vertaalt.
- **Client:** de Nuxt-app krijgt `fr.json` en `en.json`, een taalkiezer, en geen hardgecodeerd Nederlands meer.

**Tech Stack:** Nuxt 4 met `@nuxtjs/i18n` 10, Better Auth 1.7.7, Drizzle op PostgreSQL 16 (tests: PGlite), Zod 4, Vitest en Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-elentrik-talen-design.md` (goedgekeurd)

## Global Constraints

**Talen en notatie**
- **Talen:** `nl` (standaard), `fr` en `en`. Het type heet overal `Taal = "nl" | "fr" | "en"`, in `@elentrik/arei`, in `@elentrik/render` en in `apps/web/shared/taal.ts`.
- **Locales:** `nl` → `nl-BE`, `fr` → `fr-BE`, `en` → `en-GB`. Ze worden gebruikt voor `Intl` (getallen, bedragen en datums) en voor `<html lang>`.
- **Geen URL-prefix:** `strategy: "no_prefix"`. De cookie heet `elentrik_taal`. `fallbackLocale` is `"nl"`.
- **Taalnamen in hun eigen taal:** "Nederlands", "Français", "English".

**Inhoud van de vertalingen**
- **Terminologie** volgt `docs/vertalingen.md` (Task 1). Kerntermen FR: RGIE, schéma unifilaire, plan de position, liste des circuits, tableau de distribution, disjoncteur, interrupteur différentiel, contrôle, constat, dérogation, propriétaire/membre, période d'essai. Kerntermen EN: AREI (Belgian wiring regulations), single-line diagram, layout plan, circuit list, distribution board, circuit breaker, residual current device (RCD), inspection, finding, deviation, owner/member, free trial.
- **Belgisch Frans:** "vous", en "septante" en "nonante" waar getallen voluit staan.
- **Ongewijzigd in elke taal:** artikelnummers, grenswaarden en technische labels op het schema, zoals `XVB 3G2,5` met een decimale komma.
- **Plaatshouders** (`{naam}`) en **meervoudsvormen** (`|`) zijn in elke taal identiek per sleutel.
- **Niet vertaald:** wat de gebruiker zelf typt (namen, adressen, motivaties).
- **Clean room:** eigen vertalingen. Geen tekst of terminologie van andere software overnemen, en nooit verwijzen naar de onderzoeksmap.

**Projectregels**
- **Tests:** de echte database `elentrik` en `apps/web/.data/bestanden` worden nooit geraakt (alleen migraties). Vitest gebruikt PGlite, Playwright `elentrik_e2e`.
- **Expliciete imports** in servercode die Vitest importeert (ruling E1).
- **Commits:** ondertekend (1Password; nooit `--no-gpg-sign`), met de afsluiting exact `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Niet pushen.

## Review Focus

1. **Een sleutel in `nl.json` zonder vertaling,** of een vertaling met een andere plaatshouder. Het scherm toont dan een rauwe sleutel of `{naam}`. Test: Task 4, de pariteitstest over de drie bestanden. Elke latere taak die sleutels toevoegt, voegt ze in alle drie toe.
2. **Een gebruiker die inlogt op een toestel met een andere browsertaal.** De interface volgt `user.taal`, niet de browser, en blijft zo na een herlaadbeurt. Test: Task 4 (client) en Task 6 (Playwright).
3. **Een project van een Nederlandstalige collega, geëxporteerd door een Franstalige gebruiker.** Het dossier volgt de dossiertaal van het project, niet de interface van wie exporteert. Test: Task 2.
4. **Een foutmelding van de server in een Franse interface.** De client toont de vertaalde code en nooit de Nederlandse `statusMessage`. Een onbekende code geeft een algemene vertaalde fout. Test: Task 3 (codes) en Task 4 (vertalen).
5. **Een bestaand project zonder dossiertaal.** Het opent en exporteert als `nl` en verandert niet stilzwijgend; een undo blijft correct. Test: Task 2.

---

### Task 1: Woordenlijst, AREI-berichten en PDF-teksten in drie talen

**Files:**
- Create:
  - `docs/vertalingen.md`;
  - `packages/arei/src/berichten/en.ts`;
  - `packages/render/src/teksten/fr.ts` en `packages/render/src/teksten/en.ts`;
  - `packages/render/src/teksten/index.ts`.
- Modify:
  - `packages/arei/src/berichten/index.ts`: `Taal` wordt `"nl" | "fr" | "en"`, met `en` in de catalogus en `LOCALE.en = "en-GB"`;
  - `packages/render/src/print/print-html.ts`: `taal: Taal`, en de teksten komen uit `TEKSTEN[taal]`;
  - `packages/render/src/print/cartouche.ts`: de datum in de locale van de taal;
  - `packages/render/src/kringenlijst.ts` en `packages/render/src/index.ts`: export van `TEKSTEN` en `Taal`.
- Test:
  - `packages/arei/test/berichten.test.ts` (uitbreiden of aanmaken);
  - `packages/render/test/teksten.test.ts`;
  - de bestaande snapshot- of print-tests uitbreiden met `fr` en `en`.

**Interfaces:**
- Produces, in `@elentrik/arei`: `type Taal = "nl" | "fr" | "en"`, `BERICHTEN: Record<Taal, …>`, en `formatteerBericht(b, taal)` (ongewijzigde signatuur).
- Produces, in `@elentrik/render`:
  - `type Taal` (her-export van de arei-`Taal`, of identiek gedefinieerd);
  - `TEKSTEN: Readonly<Record<Taal, Teksten>>`;
  - `LOCALES: Readonly<Record<Taal, string>>` = `{ nl: "nl-BE", fr: "fr-BE", en: "en-GB" }`;
  - de print-invoer `taal: Taal`.
- `docs/vertalingen.md`: de terminologietabel uit spec §3, aangevuld met elke vaste ruimte (`badkamer`, `keuken`, `wasplaats`, `slaapkamer`, `leefruimte`, `garage`, `kelder`, `zolder`, `buiten`, `technisch`, `andere`) en elk toesteltype uit het model, in de drie talen. Latere taken volgen deze lijst.

- [ ] **Step 1: Schrijf de falende tests**
  - **arei:**
    - elke sleutel van `NL` bestaat in `FR` en `EN`, en omgekeerd, met dezelfde set `{plaatshouders}`;
    - `formatteerBericht(b, "en")` formatteert getallen als `en-GB`: `1234.5` → `"1,234.5"`;
    - een artikelnummer in een bericht is in de drie talen identiek. Vergelijk het patroon `art\. ?\d+` (of de vorm die de catalogus gebruikt) per sleutel.
  - **render:**
    - `TEKSTEN.fr` en `TEKSTEN.en` hebben dezelfde structuur als `NL` (recursief dezelfde sleutels), met niet-lege strings;
    - de print-HTML met `taal: "fr"` bevat `TEKSTEN.fr.paginatitels.eendraadschema` en niet de Nederlandse titel;
    - de datum in de cartouche (nu ISO, een opvolgpunt van plan 5) wordt per taal opgemaakt met `Intl.DateTimeFormat(LOCALES[taal], { dateStyle: "short" })` op een vaste UTC-datum. Assert de exacte uitvoer per taal die Node geeft (geen ISO meer);
    - de bestaande `nl`-snapshots blijven ongewijzigd.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
  Run: `pnpm --filter @elentrik/arei test && pnpm --filter @elentrik/render test`
  Expected: FAIL.
- [ ] **Step 3: Schrijf de woordenlijst en de catalogi, en voer de `taal`-parameter door**
- [ ] **Step 4: Draai de tests, de volledige suite en de typecheck**
  Run: `pnpm test && pnpm typecheck` (repo-root)
  Expected: PASS. Bestaande aanroepers met `taal: "nl"` blijven werken.
- [ ] **Step 5: Commit**
  `git commit -m "feat: AREI-berichten en dossierteksten in het Frans en Engels, met woordenlijst"`

---

### Task 2: Dossiertaal in het model, `user.taal`, en de server die ze gebruikt

**Files:**
- Modify:
  - `packages/model/src/document.ts`: `meta.dossierTaal?` in het type, en `nieuwDocument({ dossierTaal })`;
  - `packages/model/src/schema.ts`: Zod `z.enum(["nl","fr","en"]).optional()` op `meta.dossierTaal`;
  - `packages/model/src/project.ts`: `wijzigProject` aanvaardt `dossierTaal`;
  - `apps/web/server/db/schema.ts` + migratie `0008_taal.sql`: `user.taal`, text, niet null, standaard `'nl'`;
  - `apps/web/server/auth/index.ts`: `additionalFields.taal` (`input: false`), met weigering op `/update-user` en `/sign-up/email` zoals bij `proefGebruikt`. De registratie zet de taal uit de header `x-elentrik-taal`, gevalideerd, met `nl` als standaard;
  - `apps/web/server/organisaties/leden.ts` (`mij()`): `gebruiker.taal`;
  - `apps/web/server/api/projecten/index.post.ts`: het nieuwe document krijgt `dossierTaal = user.taal`;
  - `apps/web/server/exports/repo.ts` (r. 188 `taal: "nl"`): de taal komt uit `doc.meta.dossierTaal ?? "nl"`.
- Create:
  - `apps/web/shared/taal.ts`: `TALEN`, `type Taal`, `isTaal(x): x is Taal`, `LOCALES`, `TAAL_HEADER = "x-elentrik-taal"`;
  - `apps/web/server/api/mij/taal.put.ts`.
- Test:
  - `packages/model/test/project.test.ts` (uitbreiden);
  - `apps/web/test/taal-server.test.ts`;
  - `apps/web/test/toegang.test.ts`: een rij voor `PUT /api/mij/taal`.

**Interfaces:**
- Consumes: `Taal` (Task 1).
- Produces:
  - `InstallatieDocument.meta.dossierTaal?: Taal`. Afwezig betekent `nl`. Er is geen nieuwe schemaversie (ruling: optioneel veld, geen migratie).
  - `wijzigProject(doc, { dossierTaal })` valideert de taal. Een ongeldige waarde gooit `DocumentFout("ONGELDIG_SCHEMA")`. Het telt als dezelfde undo-stap als de andere projectgegevens. Een waarde die al gelijk is, valt weg.
  - `PUT /api/mij/taal { taal }`: alleen een sessie, geen organisatie nodig. Hij valideert met `isTaal` (400 met `data.code = "ONGELDIGE_TAAL"`), zet `user.taal` en geeft `{ taal }`.
  - `Mij.gebruiker.taal: Taal` (server en client-type).
- **Volgorde bij de registratie:** de header `x-elentrik-taal` (een geldige taal), anders `nl`.

- [ ] **Step 1: Schrijf de falende tests**
  - **model:**
    - een document zonder `dossierTaal` blijft geldig en ongewijzigd na parse;
    - `wijzigProject` met `"fr"` zet het veld;
    - met `"de"` gooit het;
    - een undo herstelt de afwezigheid.
  - **server (PGlite, met Better Auth zoals in `toegang.test.ts`):**
    - een registratie met de header `fr` geeft `user.taal = "fr"`; zonder header `nl`;
    - `/update-user` met `taal` geeft 400;
    - `PUT /api/mij/taal`: `"en"` geeft 200 en `/api/mij` toont `en`; `"de"` geeft 400 `ONGELDIGE_TAAL`; zonder sessie 401;
    - `POST /api/projecten` door een `fr`-gebruiker geeft `meta.dossierTaal = "fr"`;
    - een export van een project met `dossierTaal: "en"` roept de print-HTML aan met `taal: "en"` (spy op de render-aanroep of de HTML die Gotenberg krijgt). Dat geldt ook als een `nl`-gebruiker exporteert;
    - een project zonder `dossierTaal` exporteert met `"nl"`.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer het model, de migratie, het auth-veld, de route, `mij()`, de projectaanmaak en de export**
- [ ] **Step 4: Draai de tests en de bestaande toegang- en route-tests**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(web): taal per gebruiker en dossiertaal per project"`

---

### Task 3: Mails, Stripe en foutcodes in de taal van de gebruiker

**Files:**
- Modify:
  - `apps/web/server/mail/sjablonen.ts`: elke sjabloonfunctie krijgt `taal: Taal` en heeft teksten in drie talen;
  - `apps/web/server/auth/index.ts`:
    - bevestiging, magic link en herstel krijgen `user.taal`;
    - een uitnodiging krijgt de `taal` van wie uitnodigt (`inviter.user`);
  - `apps/web/server/abonnementen/stripe.ts` en `beheer.ts`: `maakCheckout` en `maakPortaal` krijgen `locale: Taal` en geven die door aan Stripe (`locale`);
  - elke server-`createError` met een `statusMessage` die de gebruiker kan zien, krijgt een `data.code`. Inventaris: `grep -rn "createError" apps/web/server`. Bestaande codes (`ABONNEMENT_VEREIST`, `ANDERE_ORGANISATIE`, `LAATSTE_EIGENAAR`, …) blijven gelijk. De nieuwe codes zijn SCREAMING_SNAKE_CASE, in het Nederlands, zoals de bestaande.
- Create: `apps/web/shared/foutcodes.ts`: `FOUTCODES` (een const-lijst van alle codes die de server kan sturen) en `type Foutcode`.
- Test:
  - `apps/web/test/mail-sjablonen.test.ts` (uitbreiden);
  - `apps/web/test/foutcodes.test.ts`;
  - de Stripe-poorttests (`abonnement-config.test.ts`, `abonnement-api.test.ts`) voor `locale`.

**Interfaces:**
- Consumes: `Taal` en `isTaal` (Task 2), en `user.taal`.
- Produces:
  - `bevestigMail({ naam, link, taal })`, `magicLinkMail({ link, taal })`, `herstelMail({ naam, link, taal })` en `uitnodigingMail({ …, taal })`;
  - `FOUTCODES` en `Foutcode`, een gesloten lijst. Task 4 maakt per code een vertaalsleutel `fouten.<CODE>`.

- [ ] **Step 1: Schrijf de falende tests**
  - **Mails:**
    - per sjabloon en per taal een onderwerp en tekst in die taal. Controleer een kenmerkend woord per taal, zoals "Bevestig", "Confirmez" en "Confirm";
    - HTML-escaping blijft;
    - de regel "Heb je dit niet aangevraagd?" bestaat in de drie talen.
  - **Auth (PGlite):**
    - een `fr`-gebruiker die zich registreert, krijgt een Franse bevestigingsmail;
    - een `en`-eigenaar die een nieuw e-mailadres uitnodigt, verstuurt een Engelse uitnodiging.
  - **Stripe:** `maakCheckout` en `maakPortaal` sturen `locale=fr` op de draad (bestaande lokale SDK-server-test), en de routes geven `user.taal` door.
  - **Foutcodes:**
    - een statische test zoekt elke `createError(` in `apps/web/server/**` met een `statusMessage` en een status 4xx, en eist een `data.code` die in `FOUTCODES` staat. Een kleine, gedocumenteerde uitzonderingslijst is toegelaten, bijvoorbeeld fouten die de gebruiker nooit ziet;
    - `FOUTCODES` heeft geen dubbels.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Implementeer de sjablonen, de taal in auth, de Stripe-`locale` en de codes**
- [ ] **Step 4: Draai de tests en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(web): mails, Stripe en foutcodes in de taal van de gebruiker"`

---

### Task 4: Vertaalbestanden, taalkeuze en vertaalde foutmeldingen in de client

**Files:**
- Create:
  - `apps/web/i18n/locales/fr.json` en `apps/web/i18n/locales/en.json`: volledige vertalingen van `nl.json`, volgens `docs/vertalingen.md`;
  - `apps/web/app/components/TaalKiezer.vue`;
  - `apps/web/app/composables/useTaal.ts`;
  - `apps/web/app/fouten.ts`: de centrale vertaling van een fetch-fout.
- Modify:
  - `apps/web/nuxt.config.ts`: drie locales met `language` `nl-BE`, `fr-BE` en `en-GB`, `fallbackLocale: "nl"`, en `detectBrowserLanguage: { useCookie: true, cookieKey: "elentrik_taal", redirectOn: "root", alwaysRedirect: false }` (of het equivalent in v10);
  - `apps/web/i18n/locales/nl.json`: nieuwe sleutels `taal.*` en `fouten.<CODE>` voor elke code in `FOUTCODES`, plus `fouten.onbekend`;
  - `apps/web/app/stores/sessie.ts`: na `laad()` zet de store de i18n-locale op `gebruiker.taal`;
  - `GebruikerMenu.vue` en `AuthKader.vue`: `<TaalKiezer />`;
  - de registratie stuurt `x-elentrik-taal` mee met de huidige locale;
  - de bestaande plekken die een server-fouttekst tonen (`app/editor/export.ts` en de andere call sites van `statusMessage`): ze gebruiken `vertaalFout`;
  - `<html lang>` via `useHead` of de i18n-module.
- Test:
  - `apps/web/test/vertalingen.test.ts`: de pariteit van de drie JSON-bestanden;
  - `apps/web/test/taal-client.test.ts`;
  - `apps/web/test/fouten-client.test.ts`.

**Interfaces:**
- Consumes: `Taal`, `TALEN`, `isTaal`, `LOCALES`, `TAAL_HEADER` (shared/taal.ts), `FOUTCODES` (Task 3), `PUT /api/mij/taal`, en `Mij.gebruiker.taal` (Task 2).
- Produces:
  - `useTaal(): { taal: Ref<Taal>; zetTaal(t: Taal): Promise<void> }`. `zetTaal` wisselt de i18n-locale, zet de cookie en roept bij een sessie `PUT /api/mij/taal` aan. Een fout bij het bewaren laat de interface gewisseld, toont een toast en vraagt geen herlaadbeurt;
  - `vertaalFout(fout: unknown, t: (sleutel: string) => string): string`. Bij een bekende `data.code` geeft hij `t("fouten." + code)`, anders `t("fouten.onbekend")`. Hij geeft nooit de `statusMessage` van de server terug.

- [ ] **Step 1: Schrijf de falende tests**
  - **Pariteit:**
    - `nl.json`, `fr.json` en `en.json` hebben exact dezelfde sleutels, recursief;
    - elke waarde heeft dezelfde set `{plaatshouders}` als `nl`, en hetzelfde aantal `|`-vormen;
    - geen lege strings;
    - elke `FOUTCODES`-code heeft `fouten.<CODE>` in de drie bestanden;
    - `fr.json` en `en.json` zijn geen kopie van `nl.json`: minder dan 5 % van de waarden is identiek aan `nl`, met een uitzonderingslijst voor merknamen en codes.
  - **Taal:**
    - `zetTaal("fr")` roept de API aan met `{ taal: "fr" }` en zet de locale;
    - na `laad()` met `gebruiker.taal = "en"` is de locale `en`, ook als de cookie `fr` zegt.
  - **Fouten:**
    - een fout `{ data: { code: "ANDERE_ORGANISATIE" }, statusMessage: "Nederlandse tekst" }` geeft de vertaling en niet de tekst;
    - een onbekende code geeft `fouten.onbekend`;
    - een netwerkfout zonder `data` geeft `fouten.onbekend`.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Vertaal, configureer, bouw `TaalKiezer` en `useTaal`, en zet de call sites om naar `vertaalFout`**
- [ ] **Step 4: Draai de tests en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(web): interface in het Frans en Engels met taalkiezer en vertaalde foutmeldingen"`

---

### Task 5: Geen hardgecodeerd Nederlands meer, en de dossiertaal in de editor

**Files:**
- Modify:
  - `apps/web/app/editor/velden.ts`: geen Nederlandse labels meer, alleen vertaalsleutels (`velden.<sleutel>`, `velden.<sleutel>.opties.<waarde>`, `ruimtes.<ruimte>`). De module faalt nog steeds bij een ontbrekende beschrijving, nu tegen `nl.json`;
  - de componenten en composables onder `apps/web/app/**` met letterlijke Nederlandse tekst in templates, `aria-label`, `title`, `placeholder` of toasts: ze gebruiken `$t`/`t()`;
  - `ProjectgegevensDialoog.vue` (of waar de projectgegevens bewerkt worden): een keuze "Dossiertaal" (NL/FR/EN), via `wijzigProjectgegevens({ dossierTaal })`;
  - `apps/web/app/stores/editor.ts`: `wijzigProjectgegevens` aanvaardt `dossierTaal`;
  - `ExportDialoog.vue`: een regel "Dossiertaal: {taal}";
  - `nl.json`, `fr.json` en `en.json`: alle nieuwe sleutels, in de drie talen.
- Test:
  - `apps/web/test/geen-hardgecodeerde-tekst.test.ts`: een statische scan;
  - `apps/web/test/velden.test.ts` (aanpassen);
  - `apps/web/test/editor-store.test.ts` (dossiertaal).

**Interfaces:**
- Consumes: `Taal`, de vertaalbestanden en de pariteitstest (Task 4), en `meta.dossierTaal` met `wijzigProject` (Task 2).
- Produces: `beschrijfVelden(type)` (of de bestaande naam) geeft `labelSleutel`, `eenheid` en `opties[].labelSleutel` terug. Het paneel vertaalt die. Een eenheid zoals `mm²` of `A` blijft letterlijk.

- [ ] **Step 1: Schrijf de falende tests**
  - **Statische scan:**
    - voor elke `.vue` onder `app/` zoekt de test in de `<template>` naar tekstknopen en de attributen `label`, `title`, `placeholder`, `aria-label` en `description` met letters. Ze moeten via `$t(`/`t(` komen, of via een binding. Een gedocumenteerde uitzonderingslijst is toegelaten: merknamen ("Elentrik", "Stripe"), eenheden en symbolen;
    - in `.ts` onder `app/` mogen toast- en melding-titels geen letterlijke tekst bevatten. Controleer het patroon `title: "` en `description: "`.
  - **`velden.ts`:**
    - elke label- en optiesleutel bestaat in `nl.json`, en daardoor ook in `fr` en `en`;
    - de module bevat geen woorden zoals "Badkamer" meer.
  - **Editor-store:** `wijzigProjectgegevens({ dossierTaal: "fr" })` is één undo-stap; dezelfde waarde nog eens geeft geen stap.
- [ ] **Step 2: Draai de tests en controleer dat ze falen**
- [ ] **Step 3: Zet de teksten om, voeg de dossiertaal toe aan de dialoog en het exportvenster, en vul de drie vertaalbestanden aan**
- [ ] **Step 4: Draai de tests en de typecheck**
  Run: `pnpm test && pnpm typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git commit -m "feat(web): alle teksten vertaalbaar en dossiertaal in de editor"`

---

### Task 6: E2E in drie talen, en de documentatie

**Files:**
- Create: `apps/web/e2e/talen.spec.ts`.
- Modify:
  - `apps/web/e2e/hulp/*`, alleen als een bestaande hulp op Nederlandse tekst leunt en zo breekt bij een andere taal. Bestaande specs blijven in het Nederlands draaien (de browsertaal van Playwright: zet `locale: "nl-BE"` in `playwright.config.ts` `use`);
  - `docs/lokaal-en-online.md`: een korte sectie "Talen":
    - de taalkeuze en de cookie;
    - de dossiertaal;
    - nieuwe teksten altijd in de drie bestanden toevoegen (de pariteitstest);
    - een opvolgpunt: het Frans laten nalezen door iemand met Frans als moedertaal vóór de lancering.

- [ ] **Step 1: Schrijf de falende spec**
  1. Een gebruiker registreert zich en logt in (bestaande hulp), wisselt via het gebruikersmenu naar Français:
     - de projectenlijst toont de Franse titel (uit `fr.json`);
     - na een herlaadbeurt blijft hij Frans;
     - een nieuwe browsercontext met `locale: "en-GB"` die inlogt als dezelfde gebruiker, krijgt toch Frans (`user.taal` wint).
  2. Een nieuw project van die Franstalige gebruiker heeft dossiertaal Français in de projectgegevens. De export geeft een PDF waarvan de tekst de Franse paginatitel bevat (bestaande hulp `e2e/hulp/pdf.ts`). Daarna wordt de dossiertaal in de dialoog op English gezet; de volgende export bevat de Engelse titel.
  3. De aanmeldpagina met een `en-GB`-browser zonder cookie toont Engels. De taalkiezer op die pagina wisselt naar Nederlands.
  4. Een bevinding in de editor van de Franstalige gebruiker wordt in het Frans getoond, met een vaste sleutel uit `BERICHTEN.fr`.
- [ ] **Step 2: Draai de spec en controleer dat hij faalt**
  Run: `cd apps/web && npx playwright test e2e/talen.spec.ts`
  Expected: FAIL.
- [ ] **Step 3: Pas de hulpen en de config aan, en schrijf de documentatie**
- [ ] **Step 4: Draai de volledige Playwright-suite twee keer, plus de unit-suite**
  Run: `cd apps/web && npx playwright test && npx playwright test && cd ../.. && pnpm test && pnpm typecheck`
  Expected: alles PASS.
- [ ] **Step 5: Commit**
  `git commit -m "test(web): end-to-end in drie talen, en documentatie voor de talen"`
