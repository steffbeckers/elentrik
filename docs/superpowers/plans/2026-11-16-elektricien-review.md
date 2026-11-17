# Plan: elektricien- en UX-review

Ontwerp: `docs/superpowers/specs/2026-11-16-elektricien-review-design.md`. Branch: `users/s.beckers/elektricien-review` (vanaf `develop`). Vier taken met gescheiden bestanden, zodat ze naast elkaar kunnen lopen.

## Regels voor elke taak

- Blijf binnen de bestanden van je taak. Heb je iets daarbuiten nodig, meld het in je verslag en wijzig het niet.
- Commit niet en wissel niet van branch; de hoofdsessie commit.
- Schrijf eerst de test, dan de code. Draai alleen gerichte tests: `pnpm vitest run <pad>` vanuit de repo-root, en `pnpm --filter <pakket> typecheck` voor een pakket onder `packages/`. Draai niet de volledige suite, geen e2e en geen `nuxt typecheck`: er loopt een ontwikkelserver op deze checkout.
- Tests raken nooit de echte database `elentrik` of `apps/web/.data`.
- Tijdelijke bestanden alleen in `.superpowers/sdd/elektricien/tmp/` (gitignored).
- Clean room: eigen code en tekst, geen namen van andere tools.
- Nieuwe schermtekst in `apps/web/i18n/locales/nl.json`, `fr.json` en `en.json` (de pariteitstest eist alle drie; Frans met "vous", Engels Brits). Woordkeuze volgens `docs/vertalingen.md`.
- Het documentschema (`packages/model/src/schema.ts`), de PDF en de server veranderen niet.

## Taak 1: raakvlakken in het eendraadschema

Bestanden: `packages/render/src/schema-svg.ts`, `packages/render/test/**`, `apps/web/e2e/hulp/schema-selectie.ts`.

- `schemaStripSvg` zet in elke `<g data-node-id>` als eerste kind een `<rect class="raakvlak" fill="none" pointer-events="all">`: de maat van het symbool, aan elke kant 1,5 mm ruimer en minstens 8 mm breed en hoog, gecentreerd op het symbool.
- `schemaPaginaSvg` blijft byte voor byte gelijk.
- Tests: het raakvlak staat in de strook, niet in de pagina; de afmetingen kloppen voor een smal symbool (leiding).

## Taak 2: AREI-regels

Bestanden: `packages/arei/**`, behalve `packages/arei/test/sjablonen-arei.test.ts` (taak 3).

1. `parameters.ts`: `maxStroomPerDoorsnede` wordt `[mm², zekering_A, automaat_A]` met de acht rijen uit het ontwerp. `doorsnede-beveiliging` kiest de kolom op het type van de beveiliging; het bericht noemt de soort beveiliging.
2. `analyse`: `tellingen` krijgt `contactdoosPunten` (aantal contactdoos-onderdelen). `max-contactdozen` gebruikt dat; `contactdozen` (som van `aantal`) blijft bestaan voor andere afnemers.
3. Nieuwe regels volgens de tabel in het ontwerp: `differentieel.max-stroombanen`, `differentieel.type-ac`, `aarding.spreidingsweerstand`, `laadpaal.differentieel`, `verlichting.min-kringen`, `contactdoos.uitvoering`, `aarding.niet-getekend`, `kring.spanningsval`. Elke regel een eigen bestand in `regels/`, `nagekeken: false`, het artikel waar het ontwerp er een noemt (4.2.4.3, 4.4.1.5), en een commentaar met de herkomst.
   - "Achter een differentieel" betekent: het dichtstbijzijnde differentieel boven de kringbeveiliging. Het algemene differentieel telt nooit mee.
   - De ernst hangt af van `doc.meta.installatieContext` zoals in `aanvullende-differentieel.ts`.
   - Spanningsval: som van `lengte_m` van alle leidingen van de kring, kleinste doorsnede, nominale stroom van de kringbeveiliging; alleen als elke leiding een lengte en een doorsnede heeft. Percentage in het bericht met één decimaal en een komma.
4. Berichten in `berichten/nl.ts`, `fr.ts` en `en.ts`.
5. Tests per regel in `packages/arei/test/regels/`, en de bestaande tests die de tabel of het aantal regels vastleggen aanpassen.

Meld in je verslag welke bestaande sjablonen (`SJABLONEN` in `packages/model`) door de nieuwe regels een bevinding krijgen.

## Taak 3: sjablonen, startwoning en slimme bestemming

Bestanden: `packages/model/src/standaarden.ts`, `packages/model/src/sjablonen.ts`, `packages/model/src/index.ts`, `packages/model/test/**`, `packages/arei/test/sjablonen-arei.test.ts`, `apps/web/app/components/editor/OnderdelenPaneel.vue`, `SjabloonInvoegenDialoog.vue`, `InvoegBestemmingVelden.vue`, `apps/web/app/editor/invoegen.ts`, `apps/web/app/stores/editor.ts`, de bijhorende tests in `apps/web/test/`, en in de taalbestanden alleen sleutels onder `editor.sjablonen`, `editor.onderdelenPaneel`, `editor.invoegen` en een nieuwe `editor.startwoning`.

1. Nieuwe sjablonen: vaatwasser, droogkast, oven, boiler, warmtepomp, laadpaal, zonnepanelen, keuken, buiten, aarding. Voorinstellingen die binnen de regels van taak 2 passen (tabel 1; wasmachine, droogkast en vaatwasser achter 30 mA; laadpaal achter een eigen differentieel van 30 mA type B; kookplaat, oven, boiler en warmtepomp mogen rechtstreeks onder het algemene differentieel).
2. `startWoning(doc)` in het model: de samenstelling uit het ontwerp als één operatie. Alleen toegelaten in een document zonder kringen. Test: geen bevinding met ernst fout in de context nieuw (taak 2 loopt parallel; controleer aan het einde opnieuw tegen de dan aanwezige regels en meld wat overblijft).
3. Editor: in een schema zonder kringen toont het paneel Onderdelen bovenaan een blok "Snel starten" met de knop "Startwoning invoegen"; één stap voor ongedaan maken; de bestaande controle op de gratis limiet blijft werken.
4. Slimme bestemming: een differentieel van maximaal 30 mA met 8 kringen wordt niet meer als standaardbestemming voorgesteld; de keuzelijst toont de bezetting.
5. Het paneel groepeert de sjablonen onder Kringen, Toestellen en Installatie.

## Taak 4: bordoverzicht, voorstellen en teller

Bestanden: `packages/render/src/bordoverzicht.ts` (nieuw), `packages/render/src/index.ts`, `packages/render/test/bordoverzicht.test.ts`, `apps/web/app/components/kringenlijst/**`, `apps/web/app/editor/velden.ts`, `apps/web/app/components/editor/EigenschappenPaneel.vue`, `apps/web/app/components/editor/EditorWerkruimte.vue`, de bijhorende tests in `apps/web/test/`, en in de taalbestanden alleen sleutels onder een nieuwe `editor.bord`, `editor.werkruimte` en `velden`.

1. `bordOverzicht(doc, analyse)`: per verdeelbord naam, aantal kringen, modules (één per pool van elke automaat en elk differentieel dat rechtstreeks in dat bord zit; een zekering telt het aantal polen van het stroomtype), voorgestelde rijen van 18 modules met 20 % reserve, en per differentieel gevoeligheid, aantal kringen en aantal contactdozen. Het algemene differentieel voor het hoofdbord telt mee in de modules van het hoofdbord.
2. Een compact blok "Bordoverzicht" boven de kringenlijst, met de vermelding dat het indicatief is. Bij meer dan 8 kringen achter een differentieel van maximaal 30 mA krijgt die regel een waarschuwingskleur en -icoon.
3. Voorstellen in het paneel Eigenschappen: kabeltype (XVB, XGB, EXVB, VOB, VVB, EXAVB, XFVB), doorsnede (1,5 – 35 mm²), nominale stroom van automaat en zekering, nominale stroom en gevoeligheid van een differentieel. Vrije invoer blijft werken; het veldtype `Veld` kent al `suggesties`.
4. Het tabblad Situatieschema toont het aantal nog te plaatsen onderdelen (uit `dossierStatus`), met een toegankelijke tekst.

## Afronding (hoofdsessie)

Volledige `pnpm test:parallel`, `pnpm test:prestatie`, `pnpm typecheck`, de e2e-specs die de gewijzigde schermen raken, een visuele controle in de browser, en een draft-PR naar `develop`.
