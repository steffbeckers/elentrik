# Vrije aftakkingen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Vrij opgebouwde horizontale schakelaar/lamp-aftakkingen met gedeelde puntreferenties op canvas, situatieplan en PDF.

**Architecture:** Bestaande nodes krijgen optioneel `aftakking: true`; gemarkeerde ketens beginnen aan een leiding en bevatten alleen schakelaars en lichtpunten. De analyse deelt hun puntnummer. De bestaande verticale layout reserveert ruimte voor horizontale rijen aan een leiding; bestaande documenten zonder markering behouden exact hun opmaak.

**Tech Stack:** TypeScript, Zod, Immer, Vue/Nuxt/Pinia, SVG, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-vrije-aftakkingen-design.md`

## Global Constraints

- Elke aftakking is één horizontale reeks schakelaars en lichtpunten.
- Bestaande documenten blijven leesbaar en behouden hun huidige indeling en nummering.
- Canvas en PDF gebruiken dezelfde opmaak.
- Nieuwe UI-teksten volgen de bestaande Nederlandse, Franse en Engelse vertalingen.
- Alleen-lezen verhindert alle nieuwe mutaties.

## Review Focus

- Een verwijderd eerste of laatste symbool mag geen markering of leeg punt achterlaten (taak 1).
- Een normale keten naast nieuwe aftakkingen moet zijn eigen nummering en verbinding behouden (taken 2/4).
- Een lange aftakking mag geen symbool doorsnijden op de paginagrens (taak 4).
- Aantallen, LED-tekst en waterdichtheid moeten rechtop en vrij van de horizontale leiding blijven (taak 3).
- Nieuwe acties moeten alleen-lezen, undo/redo en toetsenbordbediening respecteren (taak 5).

## Task 1: Model en geldige bewerkingen

**Files:** `packages/model/src/{schema,aftakkingen,structuur,operaties,sjablonen,toevoegen,index}.ts`; `packages/model/test/aftakkingen.test.ts`.

**Interfaces:** `isAftakkingNode(node)` type guard; `magAftakkingKind(ouder, kind, aantalKinderen)` structure check; model `Aanknoping.soort` adds `aftakking` and `aftakking-einde`. Existing `voegOnderdeelToe` and `magToevoegen` consume these kinds and return their existing result types.

- [x] Write and run failing tests for creating two branches, extending one, validation/serialization, removing first/middle/last symbols and patch round trips.
- [x] Add optional literal `aftakking: true` to switch/light nodes, enforce a linear marked chain rooted at a leiding, and reject editing the marker as an ordinary property. Generic mutations and templates enforce the same structure.
- [x] Keep schema version 1: this follows existing additive optional-field evolution; no old document requires transformation. Newly saved marked nodes require this application version.
- [x] Run `pnpm exec vitest run packages/model/test` and confirm PASS.

## Task 2: Gezamenlijke puntnummers

**Files:** `packages/arei/src/analyse/kringen.ts`; `packages/arei/test/aftakkingen.test.ts`; `packages/render/test/aftakkingen.test.ts`.

**Interfaces:** Existing `Analyse.puntLabels` assigns the first marked node a number and passes it to its marked descendants; unmarked nodes keep the existing numbering. No new node identity or counts.

- [x] Write failing tests for A1/A2/A3 branches, physical counts, ordinary neighbours, and per-symbol situation/circuit-list labels.
- [x] Pass an optional branch label through the iterative analysis traversal; allocate a number only at each marked root.
- [x] Run `pnpm exec vitest run packages/arei/test packages/render/test/aftakkingen.test.ts` and confirm PASS.

## Task 3: Horizontale symbolen

**Files:** `packages/symbols/src/{punten,teken,index}.ts`; `packages/symbols/test/aftakkingen.test.ts`.

**Interfaces:** Export `tekenAftakkingSymbool(node, einde?: boolean): Symbool` for marked switch/light nodes. In/out anchors are left/right, artwork and text stay upright; a terminal symbol ends its outgoing line at the symbol.

- [x] Write failing tests for anchors, terminal connections, both switches, lamp variants, amounts and waterdicht text.
- [x] Reuse existing artwork with horizontal connection options; keep the default symbol API and snapshots unchanged.
- [x] Run `pnpm exec vitest run packages/symbols/test` and confirm PASS.

## Task 4: Layout en PDF-paginering

**Files:** `packages/layout/src/{aftakkingen,kolommen,types,paginering}.ts`; `packages/layout/test/aftakkingen.test.ts`.

**Interfaces:** Layout `Aanknoping` adds `aftakking-einde`; `Strook` adds optional `aftakkingGrenzen` for safe cuts between horizontal symbols. The horizontal layout helper builds rows, slot widths and their extents; `maakStrook` integrates them into the existing distance-from-root algorithm.

- [x] Write failing tests for three stacked branches, aligned switches/lights, one label per branch, adjacent ordinary circuits, empty/removed branches, valid hitboxes and safe long-branch page breaks.
- [x] Exclude marked branch chains from the vertical leaf-column calculation. Reserve their width and height at their host leiding and draw a shared vertical trunk with horizontal rows.
- [x] Generate right-side extension anchors and safe cuts in gaps between symbol slots; merge those cuts into pagination candidates without altering old columns.
- [x] Run `pnpm exec vitest run packages/layout/test packages/render/test` and confirm PASS.

## Task 5: Editorbediening

**Files:** `apps/web/app/stores/editor.ts`; `apps/web/app/components/editor/{OnderdelenPaneel,SchemaCanvas}.vue`; `apps/web/i18n/locales/{nl,fr,en}.json`; editor store tests and browser integration test.

**Interfaces:** Store `voegAftakkingToeBijSelectie(): void` uses the selected leiding and switch/light preset, records one undo step and selects the first symbol. Enter on a branch endpoint uses its `aftakking-einde` anchor.

- [x] Write failing store tests for create/extend, two switch presets, undo/redo, invalid selections and read-only.
- [x] Add translated Aftakking toevoegen action with short guidance and useful disabled states; extend the endpoint plus with accessible, keyboard-operable labels.
- [x] Keep property selection, autosave, situation placement and PDF paths shared with existing nodes.
- [x] Run relevant editor and translation tests plus web typecheck; confirm PASS.

## Task 6: Gehele verandering controleren

- [x] Run `pnpm test:parallel`, `pnpm test:prestatie` and `pnpm typecheck`; investigate any baseline/environment failures explicitly.
- [x] Generate and inspect an SVG of the user's example, and exercise the UI in a browser if the local app environment supports it.
- [x] Request one independent whole-change review, fix material findings with regression tests, update the design status and report actual verification.

## Uitvoeringslog

- De gebruiker heeft implementatie goedgekeurd; uitvoering gebeurt direct zonder een tweede plangoedkeuring.
- De beheerde cloudcheckout op branch `work` is de taakwerkruimte; geen extra checkout of installatie nodig.
- Productwijzigingen blijven als reviewbare werkboomdiff beschikbaar; geen push of deployment onderdeel van deze opdracht.


## Resultaat en verificatie vóór de PR-integratie

- Implementatie afgerond op 2026-11-01, als werkboomdiff op branch `work`.
- `pnpm test:parallel`: 137 testbestanden, 3.210 tests geslaagd.
- `pnpm test:prestatie`: 5 testbestanden, 5 tests geslaagd.
- `pnpm typecheck`: alle zes pakketten, inclusief de Nuxt-app, geslaagd.
- Playwright `aftakkingen.spec.ts`: geslaagd met lokale Chromium; controleert vrije opbouw, de twee wisselschakelaars, toetsenbordbediening, opslaan en heropenen.
- Echte Gotenberg-export van het voorbeeld: twee A4-pagina's (schema en kringenlijst). Eerste pagina visueel nagekeken; geen overlappende symbolen of gedraaide teksten.
- Desktop- en mobiele screenshots bekeken. De bestaande vaste editorzijpanelen blijven desktopgericht; deze wijziging herontwerpt de mobiele editorindeling niet.
- Onafhankelijke codecontrole: geen aanvullende materiële bevindingen. De expliciet aan de uitvoerder gelaten browser- en PDF-controles zijn hierboven uitgevoerd. Elektrische simulatie en ondersteuning van nieuw gemarkeerde documenten in oudere appversies blijven volgens het goedgekeurde ontwerp buiten scope.
- Tijdens integratie gevonden en met tests hersteld: `aftakking` is een structuurveld, geen invoerveld; verschillende aftakkingsblokken in dezelfde verticale kolom delen hun symboolsleuven, zodat PDF-knippen voor alle rijen veilig zijn.
- De eerste volledige testrun in de netwerksandbox kon geen lokale testservers starten. De definitieve reeks draaide met lokale servertoegang. De oorspronkelijke testrun en achtergebleven Nuxt-testlock zijn opgeruimd.
- Voorbeeldartefacten: `/tmp/aftakkingen-voorbeeld.pdf`, `/tmp/aftakkingen-voorbeeld.svg`, `/tmp/aftakkingen-pdf.png`.


## PR-integratie op develop

- Op verzoek van de gebruiker wordt een PR geopend vanaf `vrije-aftakkingen` naar `develop`.
- Gebaseerd op `8dd888d` (PR #25); conflicten opgelost met behoud van de nieuwe werkruimte, ruimtevelden en toetsenbordbediening.
- De nieuwe invoegkeuzelijst biedt ook “Aftakking uitbreiden” en volgt de geselecteerde aftakking. Gedekt door een regressietest en de browsertest.
- Typecontrole geslaagd voor alle zes pakketten.
- Playwright `aftakkingen.spec.ts`: 1 test geslaagd op de bijgewerkte editor, inclusief invoegen via de keuzelijst, Enter/Spatie op plusjes, opslaan en heropenen.
- Nieuwe desktop- en mobiele screenshots visueel gecontroleerd; de eerder vermelde vaste zijpanelen zijn door de wijzigingen op `develop` vervangen door de nieuwe werkruimte.
- Definitieve volledige tests: 146 testbestanden, 3.290 tests geslaagd; prestatiecontrole: 5 testbestanden, 5 tests geslaagd.
