# Elentrik werkbaarheid — Implementation Plan

> Execute with superpowers:subagent-driven-development; preserve the existing main checkout and all prior changes requested by the user.

**Goal:** Make the app coherent and workable across drawing, diagnosis, delivery and administration.
**Architecture:** Preserve Vue/Nuxt/Pinia and the electrical model. Reduce permanent editor controls; make insertion an explicit state, retain finding context, expose dossier completeness separately from electrical validation, and unify settings navigation/save feedback.
**Spec:** `.impeccable/critique/2026-11-01T16-54-10Z__apps-web-app.md`, accepted by the user's request to improve everything generally.

## Constraints
- Work in the main checkout serving port 3000 as requested. Preserve all existing uncommitted changes. No dependency installations, deployment, billing/access/account mutations.
- Preserve current navy/blue identity, electrical symbols, undo/read-only protections and NL/FR/EN localisation.
- Keep the drawing dominant. No new permanent banner stack. Useful empty states and keyboard access remain.
- Review source-backed fixes with meaningful tests; visual/copy edits need typecheck and browser verification rather than implementation-mirroring tests.

## Tasks
- [ ] Administration/account: shared settings navigation, dirty-form protection and save feedback; explicit role-change confirmation/copy; active subscription facts from available data only; password visibility and registration recovery; project-name links. Files: pages/{index,instellingen,organisatie,abonnement,inloggen,registreren,wachtwoord-herstellen}.vue, new settings/auth components and own locale subtree. Test existing relevant suites and typecheck.
- [ ] Drawing: EditorWerkruimte.vue starts closed on small screens and preserves finding context; SchemaCanvas.vue moves destination controls into explicit add mode, keeps current target visible/highlighted, synchronises new selection with compatible target; add zoom buttons and focus selection using useCanvasWeergave.ts. Cover selection-to-insertion fallback and view maths with unit tests.
- [ ] Diagnosis/delivery: BevindingenPaneel.vue collapsible groups and retained active diagnosis while editing; ExportDialoog.vue and a shared completeness helper expose plan/unplaced/project gaps and navigate to relevant editor surfaces without blocking deliberate concept export. Test completeness counts and empty/read-only cases.
- [ ] Integration: run targeted tests, localisation/source checks and typecheck, inspect desktop/mobile and a realistic test project, one independent code review then fix confirmed issues. Leave dev server on 3000.

## Review focus
- Selecting a different circuit while add mode is active must not silently keep an unrelated destination.
- Read-only remains enforced for all mutations; diagnosis/navigation and zoom still work.
- Incomplete dossier is distinct from electrical correctness; draft export stays available.
- Switching views or closing panels preserves deliberate user context without obscuring drawing.
- Existing company fields do not falsely become dirty during loading/saving; locale keys stay complete.

## Ledger
Ruling: continue in main checkout — explicitly requested in the conversation and contains the reviewed changes; isolating would omit the live state.
Ruling: implement the accepted review directly — user selected all improvements after concrete review; no renewed design approval is necessary.

Completed all four tasks in the main checkout. Admin implementation: out/app-werkbaarheid/admin-report.md. Independent source review and clean re-review: out/app-werkbaarheid/review-report.md.

Verification: integrated 19 files / 375 tests passed; following final form-focus, touch sizing and copy updates, 5 affected files / 65 tests passed (including one additional completeness regression). Nuxt typecheck exit 0; optional vue-router Volar plugin resolution warning remains in the local dependency setup. No dependency changes made for that warning.

Browser: explicit A1 selection + B5 insertion override + Enter added B6 correctly; undo restored the fictive review project. Diagnosis retained in properties and removed on unrelated manual selection. Concept-export checklist displayed actual missing address/context/plan/placements. Mobile canvas measured 390×641 (no page overflow), form fields measured 44px. Large Thuis project focus-on-selection displayed 350%; read-only inspection only. Password reveal switched input type; invalid registration focused the first name field after UForm loading cleared.

Browser limitation: native company leave confirmation blocked automation and required the user to cancel; subsequently confirmed original company name and no dirty fields. No company/account/role/payment writes occurred. Browser provider ID changed after reconnection; viewport reset on recovered Chrome connection. Review fixture remains open; existing dev server left running on port 3000.

## Aanvullende keuzes van de gebruiker — 1 november 2026

- Schemaonderdelen en invoegpunten gebruiken compacte, doorzoekbare menu's. De elektrische volgorde en groepering per bord blijven behouden.
- De organisatiekiezer staat rechts en verschijnt alleen vanaf drie organisaties. Bij precies twee organisaties kan de gebruiker via het gebruikersmenu wisselen. Organisatie toevoegen en de drie instellingenpagina's staan in het gebruikersmenu.
- Geen vaste Projecten-link in de bovenbalk. Het Elentrik-logo navigeert naar de projecten. Dubbele instellingentabs, terugknoppen en de losse knop Bedrijfsgegevens op de projectenpagina zijn verwijderd.
- De projecteditor toont links het logo (alleen het icoon op mobiel) en rechts Exporteren vóór het gebruikersmenu. De algemene bovenbalk toont ook op mobiel de naam Elentrik.
- Omgeslagen navigatierijen krijgen 8 px tussenruimte. De melding over de proefperiode staat onder het veld voor de bedrijfsnaam. Het taalicoon wordt expliciet in de clientbundel opgenomen.
- Handmatige browsercontrole van zoeken/selecteren met toetsenbord, invoegbestemming, lege zoekresultaten, instellingenmenu, nieuw-bedrijfdialoog en desktop/mobiele bovenbalk. Geen bedrijf aangemaakt of opgeslagen tijdens deze controles.

Fix wave: keyboard insertion mismatch, grouped-point diagnosis identity and stale diagnosis state corrected; independent reviewer marked all addressed. Registration error focus corrected after live evidence showed the library temporarily disables inputs during validation.

## PR-verificatie — 1 november 2026

- Volledige functionele suite: 141 bestanden, 3271 tests geslaagd. Prestaties: 5 bestanden, 5 tests geslaagd.
- Typecontrole: alle vijf packages en de Nuxt-app geslaagd. De bestaande optionele Volar-pluginwaarschuwing blijft zichtbaar.
- Onafhankelijke broncodereview: geen belangrijke regressies of blokkerende bevindingen.
- De aangepaste Playwright-scenario’s zijn niet opnieuw uitgevoerd; de beschreven lokale UI-stromen zijn handmatig via de browser gecontroleerd.
