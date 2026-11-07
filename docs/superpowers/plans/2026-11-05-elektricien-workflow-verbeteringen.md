# Elektricienworkflow verbeteren — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een elektricien kan een bestaand elektrisch dossier getrouw overnemen, efficiënt bewerken en leesbaar exporteren, zonder bestaande projectgegevens te beschadigen.

**Architecture:** Behoud het gedeelde documentmodel voor eendraadschema, situatieplan, lijsten en export. Leg structurele garanties in `packages/model`, nummering in de gedeelde analyse en tekeninformatie in layout/render; de UI gebruikt diezelfde functies. Lever drie afzonderlijk bruikbare verbeterreeksen, met documentmigraties en regressietests waar de opgeslagen betekenis verandert.

**Tech Stack:** Bestaande Nuxt/Vue/Pinia-app, TypeScript, Zod, Vitest, Playwright, PDF.js en Gotenberg. Geen nieuwe bibliotheek voorzien.

**Spec:** [Praktijktest en bewijs](../../reviews/2026-11-05-elektricien-praktijktest.md), [PRODUCT.md](../../../PRODUCT.md), [DESIGN.md](../../../DESIGN.md).

**Status (5 november 2026):** Uitvoering geautoriseerd met “Implementeer maar”. Taken 1–9 zijn samengevoegd in `users/s.beckers/elektricien-verbeteringen`, na drie afzonderlijke implementaties en onafhankelijke reviews. De UI-hertest heeft 16 kringen en 64 plaatsingen opgeleverd, inclusief aanvullende symbolen en expliciete invoeging vóór een bestaand onderdeel. De strikte volledige bronacceptatie van taak 10 blijft open; zie het [hertestrapport](../../reviews/2026-11-05-elektricien-hertest.md) voor de concrete beperkingen en laatste controles. De onderstaande checklist blijft een acceptatiechecklist, geen automatische claim op basis van geïmplementeerde code.

## Aanpak en alternatieven

Aanbevolen: drie opeenvolgende leveringen. Eerst correcte dossierinformatie en veilige structuur, vervolgens minder handelingen, vervolgens import en afdruk. Elke taak kan afzonderlijk worden beoordeeld en geïntegreerd.

Alleen snelle UI-fixes zouden het klikken verbeteren maar kringcodes, leidinggegevens en de ontbrekende voedingsinformatie ongemoeid laten. Eén grote herbouw van de editor zou veel meer tegelijk veranderen dan de review rechtvaardigt. De bestaande model- en renderlagen zijn bruikbaar; daarop voortbouwen geeft een beter begrensde wijziging.

| Levering | Taken | Resultaat | Afhankelijkheid |
|---|---|---|---|
| 1. Betrouwbaar overnemen | 1–4 | Voeding zichtbaar, geldige invoeging, behoud van referenties, volledige leidingnotatie | Basis voor de eindtest |
| 2. Sneller tekenen | 5–7 | Stabiele plaatsing, duidelijke selectie, lichtschakelingen in één handeling | Lichtsjablonen gebruiken taak 2 |
| 3. Bruikbare plannen en PDF | 8–10 | Afzonderlijke verdiepingen, leesbare afdruk en volledige hertest | Export gebruikt nieuwe velden uit levering 1 |

Geen kalenderbelofte: vooral codebehoud, documentmigraties en geometrie bij planimport vragen meer werk dan de kleine UI-correcties. Begin met taken 1 en 2; die hebben directe impact en een beperkt wijzigingsgebied.

## Global Constraints

- Behouw de bestaande stack, stijl, sneltoetsen en ondersteunde platforms. Geen algemene editorherbouw.
- Alle nieuwe gebruikerstekst in Nederlands, Belgisch Frans en Engels; technische referenties blijven taal-onafhankelijk.
- Geen claim van AREI-conformiteit op basis van de automatische bevindingen. De bestaande waarschuwing blijft zichtbaar.
- De bron is de ACA-gids van maart 2025 met voorbeeldrevisie 01-06-2023; actuele juridische geldigheid is nog niet vastgesteld.
- Bestaande projecten, plaatsingen, undo/redo, exports en snapshots moeten blijven werken. Node-ID's veranderen niet door hernummeren of weergavewijzigingen.
- Elk functioneel documentcommando is één undo-stap; formulierconcepten zijn geen opgeslagen documentmutaties.
- Schemawijzigingen gaan via `schema.ts`, `versie.ts` en `migraties.ts`. Lees bij uitvoering de dan geldende versie; reserveer nu geen versienummers voor verschillende commits. Historische exportbestanden blijven ongewijzigd.
- Geen automatische symboolherkenning, OCR, verwijdering van oude symbolen, DWG-import of uitbreiding naar volledige CAD in dit plan.
- Sneller plaatsen is geen excuus om ongemerkt het elektrisch ontwerp, de beveiliging of de ruimteclassificatie te wijzigen.

## Review Focus

- Oude projecten zonder nieuwe velden: dezelfde bestaande referenties en plaatsingen na openen, bewaren en herladen — taken 3, 4 en 8.
- Onderborden, dubbele codes en gemengde automatische/vaste nummering: geen botsing of onverwachte wijziging — taak 3.
- Afbreken, undo, alleen-lezen en mislukte opslag: geen gedeeltelijke boom, verdwenen punt of misleidende bewaarstatus — taken 2, 5, 6 en 8.
- Mobiele viewport, zoom en drag-and-drop: desktopverbeteringen mogen bestaande bediening niet breken — taak 5.
- Lange tekst, meerdere verdiepingen en gekalibreerde schaal: geen afgekapt dossier of verschoven symbolen — taken 8 en 9.

## Taak 1 — Voedingsgegevens consequent tonen

**Bestanden:** `packages/layout/src/labels.ts`, `packages/layout/src/kolommen.ts`, `packages/render/src/print/cartouche.ts`, `packages/render/src/print/print-html.ts`, bijhorende pakketexports; tests in `packages/layout/test/labels.test.ts`, `packages/render/test/print-html.test.ts` en `apps/web/e2e/export.spec.ts`.

**Contract:** voeg één formatter `voedingTekst(stroomtype: Stroomtype): string` toe, met `2x230V → 2 × 230 V ~`, `3x230V → 3 × 230 V ~`, `3N400V → 3N × 400 V ~`. Gebruik dezelfde bron bij de aansluiting op het eendraadschema en in de cartouche. Leid geen frequentie of aansluitstroom af die niet opgeslagen is. Breid `CartoucheGegevens` uit met `voeding: InstallatieDocument['voeding']` en geef die in elk printpad door.

- [x] Leg de drie exacte formatteruitkomsten en aanwezigheid op elke relevante export vast in regressietests; bevestig het huidige ontbreken.
- [x] Implementeer formatter, ruimteberekening en doorgifte naar de cartouche. Voorkom overlap met teller en beveiligingslabels.
- [x] Run `pnpm exec vitest run packages/layout/test/labels.test.ts packages/render/test/print-html.test.ts`.
- [x] Maak een echte PDF met 3N400V; controleer tekstextractie én gerenderde pagina op 100%.

**Klaar als:** de gekozen voeding op scherm en PDF gelijk is, voor alle drie configuraties en dossiertalen. De test uit de review bevat zichtbaar 400 V.

## Taak 2 — Sjablonen alleen op een geldige bestemming invoegen

**Bestanden:** `packages/model/src/toevoegen.ts`, `packages/model/src/sjablonen.ts`, `packages/model/src/standaarden.ts`, `apps/web/app/stores/editor.ts`, `apps/web/app/components/editor/ProjectEditor.vue`; nieuwe UI `SjabloonInvoegenDialoog.vue` in dezelfde componentmap. Tests: `packages/model/test/toevoegen.test.ts`, `packages/model/test/sjablonen.test.ts`, `apps/web/test/editor-store.test.ts`, `apps/web/e2e/editor.spec.ts`.

**Contract:** maak de bestemming expliciet met `SjabloonDoel = { soort: 'bestaande-differentieel'; nodeId: NodeId } | { soort: 'nieuw-op-bord'; nodeId: NodeId }`. Breid `voegSjabloonToe` uit om dit doel te gebruiken. Een bestaande differentieel moet een verdeelbord als voorouder hebben; een hoofddifferentieel vóór het bord is geen kringbestemming. Een nieuwe differentieel wordt alleen toegevoegd bij `nieuw-op-bord`, met zichtbare instelwaarden. Een technisch ongeschikte bestaande beveiliging mag niet stil worden vervangen of als geschikt worden gecertificeerd.

- [x] Reproduceer de hoofddifferentieel uit de review in een modeltest: weigering zonder documentmutatie; hetzelfde sjabloon op het bord blijft geldig.
- [x] Test hergebruik: toevoegen onder F voegt geen extra differentieel toe, behoudt de bestaande waarden en is in één undo-stap te verwijderen.
- [x] Laat de UI vóór bevestiging bestemming en toegevoegde onderdelen tonen. Bij ongeldige selectie: vraag een geldig bord/doel; kies niet ongemerkt het eerste bord.
- [x] Toon sjabloonwaarden als voorinstellingen. Neem geen ruimte zoals “Wasplaats” automatisch als feit over; laat classificatie leeg of expliciet bevestigen.
- [x] Run `pnpm exec vitest run packages/model/test/toevoegen.test.ts packages/model/test/sjablonen.test.ts apps/web/test/editor-store.test.ts`; voer de twee invoegroutes live opnieuw uit.

**Klaar als:** de zeven structurele fouten uit de review niet door de invoeging kunnen ontstaan, en hergebruik van F voorspelbaar is. Geen algemene garantie dat elk zo toegevoegd circuit elektrisch conform is.

## Taak 3 — Bestaande kringcodes en toestelreferenties behouden

**Bestanden:** `packages/model/src/schema.ts`, `project.ts`, `operaties.ts`, `migraties.ts`, `versie.ts`; nieuwe `packages/model/src/referenties.ts`; `packages/arei/src/analyse/kringen.ts`, `packages/layout/src/labels.ts`, `apps/web/app/editor/velden.ts`, `apps/web/app/components/editor/EigenschappenPaneel.vue`, `apps/web/app/editor/schema-navigatie.ts`. Tests: modelmigraties, nieuwe `referenties.test.ts`, `packages/arei/test/analyse-kringen.test.ts`, render- en situatie-regressies.

**Voorgestelde productkeuze:** behoud automatische nummering als standaard voor bestaande projecten. Bied “Bestaande referenties behouden”: leg de huidige kringletters vast, waarna toevoegen of verplaatsen ze niet wijzigt. Een aparte actie “Opnieuw nummeren” toont eerst oud → nieuw en verwerkt de wijziging atomair.

**Contract:** optioneel `kringCode: string` op automaat/zekering, met één of meer hoofdletters A–Z; een eigen `referentie: string` op differentieels voor bijvoorbeeld A, F en L. Het bestaande `label` blijft de omschrijving. Onderbordprefixen blijven zoals nu door de analyse bepaald; de lokale code wordt daarachter toegevoegd. Reserveer expliciete codes binnen dezelfde huidige nummerreeks vóór automatische toekenning. Maak conflicten met differentieelreferenties in die reeks expliciet; maak nooit een code leeg om een conflict te verbergen.

- [x] Leg tests vast voor J → J1…J7, een behouden J bij invoegen van een nieuwe kring ervoor, verwijdering, duplicatie, undo/redo en herladen.
- [x] Test A/F/L als differentieelreferenties, automatische overslag van gereserveerde codes, onderbordprefixen en afwijzing van dubbele handmatige codes.
- [x] Voeg modeloperaties voor vastleggen, wijzigen en expliciet hernummeren toe; hergebruik die in UI en import. Analyse levert de codes aan alle afnemers, zonder lokale labeltrucs in de renderer.
- [x] Migreer oude documenten zonder nummerwijziging. Dubbele referenties uit een geïmporteerd document leveren een gerichte fout; ze worden niet stil hersteld.
- [x] Run `pnpm exec vitest run packages/model/test/referenties.test.ts packages/model/test/migraties.test.ts packages/arei/test/analyse-kringen.test.ts packages/render/test/situatie-items.test.ts` en voeg een E2E voor wijziging J en persistentie toe.

**Klaar als:** bronkring J blijft J in editor, situatieplan, kringenlijst en PDF; F en L zijn zichtbaar bij hun differentieel. Een duplicaat heeft een expliciet gekozen vrije code; geen onzichtbare hernummering van de rest.

## Taak 4 — Brandreactieklasse en gecombineerde plaatsing modelleren

**Bestanden:** `packages/model/src/schema.ts`, `migraties.ts`, `materialen.ts`, `packages/layout/src/labels.ts`, `packages/symbols/src/leiding.ts`, `apps/web/app/editor/velden.ts`, `EigenschappenPaneel.vue` en de bestaande vertaalbestanden. Tests: model/schema/migraties, layout/labels, symbolen en print.

**Contract:** optioneel `brandreactieklasse: string` op leiding, maximaal 64 tekens, zonder automatisch te raden wat vereist is. Bied Eca en Cca als snelle invoer en laat volledige opgegeven classificaties toe. Vervang de enkelvoudige plaatsing door `aanleg?: { ligging?: 'inbouw' | 'opbouw' | 'grond'; inBuis: boolean }`. Migratie: `buis → {inBuis:true}`, andere oude waarden → overeenkomstige ligging met `inBuis:false`; ontbrekend blijft onbekend. Gebruik geen “onbekend = inbouw”.

- [x] Test oude waarden en combinaties; verifieer migratie zonder verlies van kabeltype/doorsnede/geleiders en zonder dubbele classificatie.
- [x] Toon afzonderlijke invoer voor ligging en buis; dezelfde samengestelde symboliek verschijnt op scherm en PDF. Laat de gebruikte symbolen aan de actuele officiële AREI-symbolentabel toetsen voordat ze als correcte notatie worden opgeleverd.
- [x] Neem de klasse op in leidinglabels, kringenlijst en materiaalonderscheid. Leid geen compliance-oordeel af uit alleen deze invoer.
- [x] Run `pnpm exec vitest run packages/model/test/schema.test.ts packages/model/test/migraties.test.ts packages/layout/test/labels.test.ts packages/render/test/print-html.test.ts` plus de geraakte symbooltests.

**Aanvullende verificatie 6 november 2026:** de actuele volledige officiële AREI-uitgave is nu bereikbaar: Boek 1 versie 07 van 15 september 2026, van toepassing vanaf 1 november 2026. De gebruikte leidingtekens zijn visueel vergeleken met tabel 2.23, gedrukte p. 55–56 (PDF 60–61); de bestaande samengestelde notatie komt overeen met deze tekens, gedraaid voor verticale leidingen. Twee gerichte symboolregressies slagen. Dit sluit deze bronvergelijking af, niet de deskundige controle van een volledige installatie. Zie [vervolgplan](2026-11-06-elektricien-restpunten.md).

**Klaar als:** XVB 3G2,5 Cca en VOB 3G1,5 Eca in buis in de wand zonder vrije-tekstconstructies getrouw kunnen worden vastgelegd en geëxporteerd.

## Taak 5 — Stabiel en doorlopend punten plaatsen

**Bestanden:** `ProjectEditor.vue`, `EditorWerkruimte.vue`, `SchemaCanvas.vue`, `situatie/TePlaatsenPaneel.vue`, `situatie/PlanCanvas.vue`, `app/composables/useCanvasWeergave.ts`, `app/editor/weergave.ts`. Tests: `apps/web/test/weergave.test.ts`, `weergave-resize.test.ts`, `situatie-store.test.ts`, `apps/web/e2e/situatie.spec.ts`.

**Gedrag:** houd het paneel bij desktopklikplaatsing open. Voeg “Doorgaan met volgend punt” toe, standaard uit; selecteer daarin het volgende ongeplaatste punt binnen het actieve kringfilter. Escape stopt, einde van de lijst stopt, een mislukte plaatsing schuift niet door. Bewaar pan en absolute schaal; houd bij noodzakelijke viewportverandering het gekozen plananker vast. Behoud de bestaande mobiele paneelroute.

- [x] Leg een browsertest vast die een herkenbaar plananker vóór en na selectie/plaatsing vergelijkt: maximaal 1 CSS-pixel afwijking bij gelijk viewportformaat.
- [x] Test zeven punten met paneel open: geen heropenen nodig. Test vanaf gesloten paneel doorlopende modus: maximaal 10 klikken inclusief openen, modus kiezen, eerste punt kiezen en zeven plaatsingen; exclusief draaien/corrigeren.
- [x] Test Escape, undo, pagina- en filterwissel, mislukte opslag, alleen-lezen, bestaande drag-and-drop en een smalle viewport.
- [x] Controleer de zoombevinding opnieuw met absolute weergavematen. `zoomPercentage` is relatief aan passend maken; een veranderd percentage alleen is geen fout. Houd toevoegen stabiel en pan alleen indien nodig om de toevoeging te tonen; expliciet “Passend maken” blijft bestaan.
- [x] Run `pnpm exec vitest run apps/web/test/weergave.test.ts apps/web/test/weergave-resize.test.ts apps/web/test/situatie-store.test.ts` en de gerichte situatie-E2E.

**Klaar als:** de plattegrond niet verspringt bij elk gekozen punt, de 21-klikkenroute aantoonbaar korter is en bestaande invoermethoden blijven werken.

## Taak 6 — Duidelijke selectie en betrouwbare veldfeedback

**Bestanden:** `app/editor/schema-navigatie.ts`, `app/editor/weergave.ts`, `situatie/TePlaatsenPaneel.vue`, `situatie/PlanCanvas.vue`, `editor/EigenschappenPaneel.vue`; tests in `schema-navigatie.test.ts`, `velden.test.ts` en editor/situatie-E2E.

- [x] Voeg zoeken op code/type/omschrijving en een kringfilter toe aan Te plaatsen. Behoud de bestaande volgorde binnen de kring.
- [x] Gebruik in alle selectielijsten onderscheidende presentatietekst, bijvoorbeeld “B2 — wisselschakelaar 1” en “B2 — wisselschakelaar 2”. Het suffix is UI-uitleg, geen gewijzigde elektrische code in het dossier. Gebruik node-ID als selectiewaarde.
- [x] Houd ongeldige veldinvoer en foutmelding zichtbaar bij blur. Bewaar alleen geldige waarden. Bij selectie verlaten: meld welk concept niet is opgeslagen en bied herstellen/terugkeren; plak het nooit op de volgende selectie. Escape herstelt expliciet de opgeslagen waarde.
- [x] Voeg gerichte tests toe voor identieke B2-namen en de reeks `16 → -1 → blur`: fout blijft zichtbaar, document blijft 16, geen onjuiste claim dat -1 is bewaard. Test ook selectie- en taalwissel.
- [x] Run `pnpm exec vitest run apps/web/test/schema-navigatie.test.ts apps/web/test/velden.test.ts` en de gerichte E2E voor invoer.

**Klaar als:** de gebruiker het juiste onderdeel kan kiezen en begrijpt of een wijziging werkelijk bewaard is.

## Taak 7 — Lichtschakelingen als samenstelling toevoegen

**Bestanden:** `packages/model/src/standaarden.ts`, `sjablonen.ts`, `toevoegen.ts`, `aftakkingen.ts`, `apps/web/app/stores/editor.ts`; nieuwe `editor/LichtschakelingDialoog.vue`. Tests: `packages/model/test/aftakkingen.test.ts`, `toevoegen.test.ts`, editor-E2E en schema-/situatierendering.

**Samenstellingen:** enkelpolige schakelaar + lamp; twee wisselschakelaars + lamp; twee wisselschakelaars en één kruisschakelaar + lamp. Aantal en soort lichtpunten zijn instelbaar. Een bestaande kring krijgt alleen een aftakking; een nieuwe kring volgt het doelcontract van taak 2. Geen extra differentieel of automaat bij uitbreiding van een bestaande kring.

- [x] Test elke samenstelling als één transactie; alle onderdelen in dezelfde aftakking delen één puntreferentie en blijven afzonderlijk plaatsbaar.
- [x] Toon vóór toevoegen de bestemming, puntcode en samenstelling. Kies de juiste aftakking automatisch vanuit de geselecteerde kring; behoud losse componentinvoer.
- [x] Test undo, duplicatie, renderen en plaatsing van beide wissels afzonderlijk. Een hoog lampenaantal wordt correct geteld en veroorzaakt geen onbedoeld extra kringpunt.
- [x] Run `pnpm exec vitest run packages/model/test/aftakkingen.test.ts packages/model/test/toevoegen.test.ts packages/render/test/schema-svg.test.ts` en een editor-E2E.

**Klaar als:** de bronstructuur schakelaar–lamp met hetzelfde puntnummer in één bewuste toevoegactie ontstaat, zonder de verkeerde verticale keten eerst te moeten herstellen.

## Taak 8 — Meerdere verdiepingen uit één document voorbereiden

**Bestanden:** `situatie/PlanToevoegenDialoog.vue`, `PaginaTabs.vue`, `app/situatie/pdf.ts`, `plan-opladen.ts`, `app/stores/situatie.ts`, `packages/model/src/schema.ts`, `situatie.ts`, migraties; nieuwe `situatie/PlanUitsnede.vue`. Tests: `plan-opladen.test.ts`, `situatie-store.test.ts`, `packages/model/test/situatie.test.ts`, situatie-E2E.

**Eerste versie:** vóór plaatsing één of meer bronpagina's selecteren, per pagina meerdere uitsneden benoemen en in stappen van 90° draaien. ACA-pagina 27 levert zo “Gelijkvloers” en “Verdieping 1”. Behoud het originele bestand en bronuitsnede; genereer per uitsnede één nieuw raster. Planpunten gebruiken daarna de coördinaten van dat raster. Gedeeltelijk mislukte uploads mogen geen half aangemaakte planpagina's opleveren.

**Scopegrens:** wijzig een uitsnede met reeds geplaatste punten niet stil. Bied in deze eerste versie een nieuwe planpagina aan; automatisch transformeren van bestaande plaatsingen bij opnieuw bijsnijden vereist een aparte geometrische wijziging. Een uitsnede verwijdert geen bestaande elektrische symbolen. Bied desgewenst een referentieblad aan dat niet wordt meegeëxporteerd; plaats definitieve punten uitsluitend op het gekozen echte ondergrondblad. Zonder schoon plan blijft zelf tekenen of een schoon bronplan nodig.

- [x] Test twee uitsneden uit één PDF, meerdere pagina's, rotatie, cancel en uploadfout. Hetzelfde originele bestand hoeft maar eenmaal opgeladen te worden.
- [x] Test behoud van bestaande pagina's en plaatsingen. Alle paginagegevens worden pas na succesvolle voorbereiding als één undo-transactie toegevoegd.
- [x] Laat schaal per definitieve uitsnede instellen. Neem geen ongeldige oude kalibratie over na resampling; toon een duidelijke melding als kalibratie ontbreekt.
- [x] Run `pnpm exec vitest run apps/web/test/plan-opladen.test.ts apps/web/test/situatie-store.test.ts packages/model/test/situatie.test.ts` en voer de ACA-import live uit.

**Klaar als:** twee afzonderlijke verdiepingen zonder boekmarges of oude cartouches ontstaan, zonder te suggereren dat oude symbolen automatisch verwijderd zijn.

## Taak 9 — Afdrukformaat en leesbaarheid verbeteren

**Bestanden:** `packages/layout/src/papier.ts`, `paginering.ts`, `packages/render/src/print/print-html.ts`, `cartouche.ts`, `tekst.ts`, `stijl.ts`, `apps/web/app/editor/export.ts` en de exportdialoogcomponent. Tests: `packages/render/test/print-html.test.ts`, bestaande print-snapshots en `apps/web/e2e/export.spec.ts`.

- [x] Bied per situatiepagina expliciet staand/liggend en papierkeuze aan; export gebruikt dezelfde voorbereidende uitsnede als de editor. Respecteer gekalibreerde schaal, of vermeld expliciet wanneer passend op papier wordt gekozen.
- [x] Gebruik een afdrukvoorbeeld waarin de gebruiker clipping en tekstgrootte kan beoordelen. Voorgestelde ondergrens voor technische tekst: 2,5 mm op papier; dit is een leesbaarheidsdoel, geen geciteerde AREI-eis. Paginer liever dan tekst onbeperkt te verkleinen.
- [x] Laat lange versielabels volledig doorlopen binnen een passende cartouchehoogte; geen afkapping. Groepeer de kringenlijst per kring en herhaal de groepskop op vervolgpagina's; elke puntrij blijft identificeerbaar.
- [x] Test 3N400V, lange Nederlandse/Franse/Engelse tekst, A4/A3, beide oriëntaties, meerdere pagina's en een groot schema. Test daarnaast een bestaande gekalibreerde ondergrond op behoud van afdrukmaat.
- [x] Run `pnpm exec vitest run packages/render/test/print-html.test.ts`; genereer en render echte Gotenberg-PDF's. Vergelijk geometrie en leesbaarheid, niet alleen bijgewerkte snapshots.

**Klaar als:** de volledige inhoud leesbaar is zonder handmatig PDF-schalen, en de lange testversie en werfgegevens behouden blijven.

## Taak 10 — Volledige praktijktest en opleverbesluit

**Bestanden:** nieuwe scenario's/fixtures onder `apps/web/e2e`, aanvullingen op `docs/reviews/2026-11-05-elektricien-praktijktest.md` in een afzonderlijk gedateerd hertestrapport. Gebruik zelfgemaakte testfixtures voor geautomatiseerde regressies; verspreid de externe ACA-bron niet onnodig als repositoryfixture.

- [x] Maak vooraf een inventaris van alle bronkringen, beveiligingen, leidinggegevens, symbolen, puntreferenties en beide verdiepingen. Controleer de nog niet geteste symbolen zoals PV-paneel afzonderlijk; maak een expliciete ontbrekende-functielijst waar nodig. Een omvormer is niet hetzelfde als een PV-paneel.
- [ ] Maak een nieuw testaccount en teken het volledige bronvoorbeeld via de UI. Gebruik geen database- of modelinjectie om ontbrekende bediening te omzeilen.
- [ ] Noteer klikken per vaste deelhandeling, inclusief correcties; meet invoertijd apart van browserautomatiseringswachttijd. Vergelijk de zeven contactdozen met de 21-klikkenbasis uit de review.
- [x] Controleer codes, topologie, specificaties en plaatsingen met een bronchecklist. Een geïmporteerde achtergrond telt niet als opnieuw opgebouwd elektrisch model.
- [x] Test herladen, undo/redo, dupliceren en bewaren. Exporteer en controleer elke pagina visueel plus tekst/metadata. Houd modeldata en oude exports tijdens migraties gescheiden.
- [x] Run na gerichte tests `pnpm typecheck` en `pnpm test`. Run vanuit `apps/web` de geraakte Playwright-scenario's, bijvoorbeeld `pnpm exec playwright test e2e/editor.spec.ts e2e/situatie.spec.ts e2e/export.spec.ts`, tegen de bestaande gescheiden testomgeving.
- [ ] Laat elektrische notatie en de toepasselijke AREI-versie inhoudelijk beoordelen voordat conformiteitsclaims worden toegevoegd. Een niet-bereikbare officiële bron of ontbrekende deskundige beoordeling blijft als beperking in de oplevering staan.

**Uitgevoerde deelacceptatie:** nieuw account, alle 16 kringen en 64 gelokaliseerde objecten via de UI; codes/topologie/plaatsingen gecontroleerd; herladen en werkelijke export uitgevoerd. De vaste plaatsroute telt 10 in plaats van 21 klikken. Een menselijke invoertijd is niet gemeten; gelogde automatiseeracties zijn geen tijdbenchmark. Volledige exacte reproductie en actuele deskundige AREI-toetsing blijven open.

**Oplevercriteria:** geen open P1 uit de geteste workflow; expliciete broncodes en kenmerken behouden; geen onbedoelde extra beveiliging; alle werkelijk overgenomen onderdelen correct geplaatst; opgeslagen project en PDF consistent; aantoonbaar kortere plaatsroute. Als een ontbrekend symbool of andere functie de volledige reconstructie blokkeert, is de hertest niet geslaagd: registreer de concrete uitbreiding en rond die af vóór deze eindacceptatie.

## Zelfcontrole van dit plan

Alle bevestigde reviewpunten zijn toegewezen: voeding (1), codes (3), sjablonen (2), import (8), leidingen (4), plaatsen/zoom (5), aftakkingen (7), selectie/invoer (6), print (9). Behoud van bestaande data en de eerdere deeltestbeperking zijn afgedekt in de globale eisen en taak 10. De implementatie en hertest worden afzonderlijk gerapporteerd; actuele AREI-conformiteit wordt niet afgeleid uit geslaagde softwaretests.
