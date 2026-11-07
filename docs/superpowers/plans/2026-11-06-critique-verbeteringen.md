# Verbeteringen na de UX-critique van 6 november

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De bevindingen uit de Impeccable-critique (25/40) oplossen, met eerst de betrouwbaarheid van het dossier: stabiele kringcodes, consistente standaarden en termen, metingen in het dossier, een vindbare editor, lichtere formulieren, een nette afdruk en de werffuncties.

**Architecture:** Modelwijzigingen in `packages/model` (codes, standaarden, metingen), weergave in `apps/web` (Nuxt UI) en in `packages/render` (PDF). De plan-editor (`apps/plan-editor`) blijft bewust licht; de kleuren worden benoemde tokens.

**Tech Stack:** TypeScript, Vue 3/Nuxt 4 met Nuxt UI, Svelte 5 (plan-editor), Zod, Vitest, Playwright.

**Spec:** De critique-snapshot `apps/web/.impeccable/critique/2026-11-06T14-07-19Z__apps-web.md` en de keuzes van de gebruiker: eerst de betrouwbaarheid van het dossier, **alles** meenemen, plan-editor **bewust licht**. De gebruiker volgt de aanbevolen keuzes; die staan per taak hieronder als besluit.

## Global Constraints

- Elke nieuwe of gewijzigde tekst in `apps/web/i18n/locales/nl.json`, `fr.json` en `en.json` (fr met "vous", en British). Pas de woordenlijst `docs/vertalingen.md` mee aan bij elke term die verandert.
- Technische notatie (`B16 2P`, `XVB 3G2,5`, `40/0,03A`) blijft in elke taal Belgisch.
- Meetwaarden worden alleen geregistreerd. Er komt **geen** beoordeling of grenswaarde: de AREI-regels zijn niet gepubliceerd en voorlopig, dus geen claim van conformiteit.
- Wijzigingen aan het documentschema (`packages/model/src/schema.ts`) volgen het bestaande patroon van migraties en clientcompatibiliteit (`migraties.ts`, `versie.ts`). Bestaande documenten blijven leesbaar, en een oude editor schrijft het nieuwe model niet kapot.
- Gebruik de semantische Nuxt UI-kleuren in `apps/web`, geen hardgecodeerde hex (DESIGN.md).
- Tests en e2e raken nooit de echte database `elentrik` of `.data/bestanden`. E2e gebruikt `elentrik_e2e`.
- Tijdelijke bestanden alleen in `.superpowers/sdd/critique-verbeteringen/tmp/`.
- Commits zijn ondertekend (1Password) en eindigen met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Is 1Password vergrendeld, stop dan en meld dat.
- Werk op de huidige branch `users/s.beckers/elektricien-verbeteringen` in de hoofdcheckout. Niet pushen of mergen.
- Verificatie per taak: de gerichte tests, `pnpm --filter <pakket> typecheck` voor de geraakte pakketten, en voor UI-taken de bestaande e2e-specs die het scherm raken.

## Review Focus

1. **Bestaande projecten zonder vaste codes:** de eerste invoeging na deze wijziging mag geen enkele bestaande letter verschuiven. Taak 1 test dit op een document zonder `kringCode`.
2. **Een document met metingen openen in een editor die metingen niet kent:** dat moet geweigerd of veilig gelezen worden, nooit stil weggeschreven. Taak 3 test dit via de compatibiliteitsversie.
3. **Lege of gedeeltelijke metingen:** de PDF toont "niet ingevuld" in plaats van 0 of een lege cel. De checklist meldt het ontbreken zonder het als elektrische bevinding te tellen. Taak 3 test dit.
4. **Sneltoetsen in tekstvelden en dialogen:** `?` en `ctrl+d` mogen niet afgaan tijdens typen of in een open dialoog (`moetNegeren`/`doelSoort`). Taak 4 test dit.
5. **CSV met puntkomma's, aanhalingstekens en accenten in omschrijvingen:** het bestand moet correct openen in een Belgische Excel, met `;` als scheidingsteken, UTF-8 BOM en escaping. Taak 9 test dit.

---

### Task 1: Kringcodes blijven stabiel bij invoegen

**Besluit:** bestaande codes liggen voortaan automatisch vast. Na elke operatie die kringen of differentiëlen toevoegt, krijgt elke kring die vóór de operatie al bestond en nog geen `kringCode` had, de code die hij vóór de operatie had. Nieuwe kringen krijgen via `bepaalKringCodes` de eerste vrije letter. Hernummeren blijft de bestaande expliciete actie in `KringReferentiesDialoog.vue`, met voorbeeld en undo.

**Files:**
- Modify: `packages/model/src/referenties.ts` (nieuwe functie), `packages/model/src/index.ts` (export)
- Modify: `apps/web/app/stores/editor.ts` (toepassen in het pad dat toevoeg-, sjabloon-, lichtschakeling- en dupliceeroperaties uitvoert)
- Modify: copy in `KringReferentiesDialoog.vue` en de i18n-bestanden, zodat duidelijk is dat codes vastliggen en hernummeren een bewuste keuze is
- Test: `packages/model/test/referenties.test.ts` (of het bestaande testbestand voor referenties), plus de store-test als die bestaat

**Interfaces:**
- Produces: `behoudKringCodes(voor: InstallatieDocument, na: InstallatieDocument): OperatieResultaat`. Zet in `na` de code uit `bepaalKringCodes(voor)` vast voor elke kring die in beide documenten bestaat en in `na` geen `kringCode` heeft. Een document zonder wijziging komt ongewijzigd terug.

- [ ] Schrijf falende tests:
  - Een document met kringen A en B (zonder vaste codes). Voeg vóór A een nieuwe kring toe via `voegOnderdeelToe` en daarna `behoudKringCodes`. Verwacht: de oude kringen houden A en B, de nieuwe krijgt C.
  - Hetzelfde met `voegSjabloonToe` (Badkamer) op een document met een lichtkring B1. Verwacht: de lichtkring blijft B.
  - Na `hernummerKringen` volgen de letters weer de volgorde (de bestaande expliciete actie werkt nog).
  - Onderborden houden hun eigen reeks.
- [ ] Draai de tests en zie ze falen.
- [ ] Implementeer `behoudKringCodes` en pas het toe in de store voor elke toevoegende operatie. Undo maakt de hele stap in één keer ongedaan.
- [ ] Draai de model- en webtests en de typecheck.
- [ ] Commit: `fix(model): keep existing circuit codes stable when inserting`.

### Task 2: Eén bron voor standaarden en juiste vaktermen

**Besluit:**
- Een nieuwe kring die met een lichtpunt of schakelaar begint (sneltoets L, het paneel, het plusje) krijgt `XVB 3G1,5`, net als het sjabloon "Kring verlichting". Andere eindpunten houden 2,5 mm². Leg de doorsnede per eerste onderdeel vast in `standaarden.ts`, zodat `toevoegen.ts` en `SJABLONEN` dezelfde bron gebruiken.
- `kortsluitvermogen_kA` (automaat/zekering) heet in nl "Onderbrekingsvermogen (Icn)", in fr "Pouvoir de coupure (Icn)" en in en "Breaking capacity (Icn)". De interne sleutel blijft.
- De stroomtypen worden: nl "2 × 230 V (eenfasig)", fr "2 × 230 V (monophasé)", en "2 × 230 V (single-phase)".
- Velden in px voor afdekken of verplaatsen tonen "beeldpunten van het plan" in plaats van "px". Is het plan gekalibreerd (er bestaat een schaal), dan tonen ze cm.
- De grammatica van de bevindingscopy "Dit gewone contactdoos- of lichtpunt …" wordt rechtgezet in alle drie talen.
- Alle getallen in UI-tekst gebruiken de decimale komma voor nl/fr (`Intl.NumberFormat` met de interfacetaal). Dat geldt ook voor de maten in de plan-editor ("6,5 m", "26,0 m²"); de plan-editor krijgt de taal mee via zijn bestaande initialisatie.

**Files:** `packages/model/src/standaarden.ts`, `packages/model/src/toevoegen.ts`, `apps/web/i18n/locales/*.json`, `docs/vertalingen.md`, `apps/plan-editor/src/**` (maatlabels), en de component die de afdekvelden toont (zoek op de i18n-sleutels met "px").

**Interfaces:**
- Produces: `doorsnedeVoorKring(eerste: Onderdeel): number` in `standaarden.ts`, die 1,5 teruggeeft voor `lichtpunt` en `schakelaar` en 2,5 voor de andere.

- [ ] Schrijf falende tests:
  - `voegOnderdeelToe(…, "lichtpunt")` op een rail geeft een leiding met `doorsnede_mm2 === 1.5`.
  - Een contactdoos geeft 2,5.
  - Het sjabloon "Kring verlichting" gebruikt dezelfde waarde als `doorsnedeVoorKring("lichtpunt")`.
  - Een test van de maatopmaak in de plan-editor: `formatteerMaat(6.5, "nl-BE")` geeft `"6,5 m"`.
- [ ] Draai de tests en zie ze falen.
- [ ] Implementeer en pas de vertalingen en de woordenlijst aan.
- [ ] Draai de model-, web- en plan-editortests, de bestaande i18n-volledigheidstest (die alle sleutels in drie talen vergelijkt) en de typecheck. Werk snapshots alleen bij waar de label- of doorsnedewijziging dat verklaart.
- [ ] Commit: `fix: align circuit standards and electrical terminology`.

### Task 3: Metingen in het dossier

**Besluit:**
- Projectniveau, optioneel object `metingen` in de projectmetadata, naast `ean` en `installatieContext`:
  - `datum?: string` (ISO-datum)
  - `aardingsweerstand_ohm?: number` (≥ 0)
  - `isolatieweerstand_MOhm?: number` (≥ 0)
  - `meettoestel?: string`
  - `opmerking?: string`
- Per differentieel optioneel:
  - `testResultaat?: "ok" | "niet_ok" | "niet_getest"`
  - `uitschakeltijd_ms?: number` (≥ 0)
- Geen grenswaarden en geen beoordeling.
- **UI:** een sectie "Metingen" in Projectgegevens (zie taak 5 voor de indeling). In het Eigenschappenpaneel van een differentieel komen de twee testvelden in een groep "Test".
- **Dossierchecklist** (`apps/web/app/editor/dossierstatus.ts`, sinds de vorige plan gedeeld met render): twee nieuwe punten, "Aardingsweerstand niet ingevuld" en "Isolatieweerstand niet ingevuld". Ze staan los van de elektrische bevindingen.
- **PDF** (`packages/render`):
  - De cartouche of de projectpagina toont de meetdatum, de aardingsweerstand en de isolatieweerstand, of "niet ingevuld".
  - De bijlage krijgt een tabel met de differentieeltests: referentie, gevoeligheid, resultaat en tijd.
  - De zin "Geregistreerde meetwaarden; geen beoordeling door Elentrik." staat erbij, in drie talen.

**Files:** `packages/model/src/schema.ts`, `migraties.ts`, `versie.ts` (alleen als het patroon dat vereist), `project.ts` (`wijzigProject` accepteert `metingen`), `apps/web/app/editor/projectformulier.ts`, `ProjectgegevensDialoog.vue`, `EigenschappenPaneel.vue`, de dossierstatus, `packages/render` (cartouche en bijlage), i18n.

**Interfaces:**
- Produces: type `Metingen` en `DifferentieelTest` vanuit `@elentrik/model`. `wijzigProject(doc, { metingen })` en het bestaande pad voor eigenschapswijzigingen voor de differentieelvelden.

- [ ] Schrijf falende tests:
  - Validatie van het schema: geldige metingen worden aanvaard, negatieve waarden geweigerd.
  - Migratie of compatibiliteit volgens Review Focus 2.
  - De dossierstatus meldt beide ontbrekende metingen en meldt niets als ze ingevuld zijn.
  - De render-output bevat in nl/fr/en de waarden of "niet ingevuld", en de tabel met differentieeltests.
  - Een e2e-stap die metingen invult in Projectgegevens, opslaat, herlaadt en de waarden terugziet.
- [ ] Draai de tests en zie ze falen.
- [ ] Implementeer in de volgorde model → dossierstatus → UI → render.
- [ ] Draai alle tests van de geraakte pakketten, de typecheck en de bestaande export-e2e.
- [ ] Commit: `feat: record measurements in the inspection dossier`.

### Task 4: Een vindbare, voorspelbare editor

**Besluit:**
- **Sneltoetsenoverzicht:** `?` (Shift+/) opent een dialoog "Sneltoetsen" met alle toetsen van het eendraadschema en het situatieschema in twee groepen. De bron is een gedeelde lijst naast `apps/web/app/composables/sneltoetsen.ts` en `apps/web/app/situatie/sneltoetsen.ts`, zodat de dialoog en de afhandeling niet uit elkaar lopen. De knop "Toetsenbordhulp" in `CanvasBediening.vue` opent dezelfde dialoog.
- **`ctrl+d` (en `cmd+d`)** dupliceert de geselecteerde kring met de bestaande `dupliceerKring`, met de eerste vrije letter als code. Is de selectie geen kring, dan gebeurt er niets en meldt een korte statusmelding waarom.
- **Snel toevoegen:** als een kring geselecteerd is, voegen C, L en D standaard toe "na de selectie" (D: "vóór de selectie") zonder extra klik. De invoegbalk sluit na het toevoegen en met Escape.
- **De nieuwe-kringbestemming** is standaard het differentieel van de huidige selectie, anders het laatst gebruikte differentieel in dit bord, anders het bord.
- **Modus "Doorgaan met volgend punt"** in het situatieschema:
  - Stopt aan het einde van de huidige kring en toont "Alle punten van kring X staan op het plan".
  - Gaat niet stil naar een ander onderdeel.
  - Toont tijdens de modus een zichtbare chip met de modus en een knop **Stop** (ook met Escape).
- **Overlap:** wie een punt plaatst binnen de symboolgrootte van een bestaande plaatsing, krijgt een niet-blokkerende waarschuwing "Overlapt met B1" met een knop Ongedaan maken. Er komt geen automatische snap.
- **Moduslabels:** de keuzelijsten tonen volledige labels (afbreken toegestaan, of een breder menu), niet afgekapt.
- **Statusmarkeringen** (`apps/web/app/editor/markeringen.ts`) krijgen naast de kleur een eigen vorm of icoon per ernst. In het Bevindingen-paneel komt een legenda. De infomarkeringen worden in de bovenbalk apart geteld of uitgelegd.
- **Opslagstatus:** op een smal scherm een korte zichtbare tekst ("Opgeslagen", "Bezig…", "Niet opgeslagen") in plaats van alleen een icoon (`EditorBovenbalk.vue:110`).
- **Contrast:** in dark mode wordt `--ui-text-dimmed` neutral-400 in de globale CSS van `apps/web`, zodat de tekst minstens 4,5:1 haalt op de achtergrond. Controleer light mode op dezelfde norm.
- **Situatiepanelen:** de koppen krijgen minstens een stap van 1,25 in grootte of gewicht. Volg de schaal van DESIGN.md (section 1.125rem/600, label 0.875rem/500).

**Files:** `apps/web/app/composables/sneltoetsen.ts`, `apps/web/app/situatie/sneltoetsen.ts`, een nieuwe `apps/web/app/components/editor/SneltoetsenDialoog.vue`, `CanvasBediening.vue`, `EditorBovenbalk.vue`, `OnderdelenPaneel.vue` / `InvoegBestemmingVelden.vue`, `markeringen.ts`, `BevindingenPaneel.vue`, de situatiecomponenten voor plaatsen en modus (zoek op de i18n-sleutel voor "Doorgaan met volgend punt"), de globale CSS, i18n.

**Interfaces:**
- Consumes: `dupliceerKring(doc, nodeId, nieuweCode)` uit de bestaande code en `behoudKringCodes` uit taak 1.
- Produces: `Actie` uitgebreid met `{ soort: "sneltoetsen" }` en `{ soort: "dupliceer" }`, en een gedeelde lijst `SNELTOETSEN: readonly { toets: string; omschrijvingSleutel: string; context: "schema" | "situatie" }[]`.

- [ ] Schrijf falende tests:
  - `sneltoets` geeft voor `?` de actie `sneltoetsen` en voor `ctrl+d` de actie `dupliceer`, en `null` in een invoerveld of in alleen-lezen (dupliceren).
  - Elke toets die `sneltoets` afhandelt, staat in `SNELTOETSEN`.
  - De modus "Doorgaan" stopt aan het einde van de kring.
  - De overlapdetectie is een pure functie met een test.
  - Een e2e-stap: `?` opent de dialoog, `ctrl+d` dupliceert een kring en de nieuwe letter is de volgende vrije.
- [ ] Draai de tests en zie ze falen.
- [ ] Implementeer.
- [ ] Draai de webtests, de editor-e2e en de typecheck. Controleer visueel op desktop en mobiel (screenshots in tmp), in dark en light.
- [ ] Commit: `feat(editor): discoverable shortcuts, stable modes and accessible markers`.

### Task 5: Lichtere formulieren en panelen

**Besluit:**
- **Projectgegevens** (`ProjectgegevensDialoog.vue`): verdeeld in genummerde secties Klant, Werfadres, Installatie, Metingen (taak 3) en Dossier. Het werfadres krijgt een selectievakje "Zelfde als klantadres" (standaard aan als het werfadres leeg is). Opslaan blijft één knop. Onderzoek en herstel het probleem waarbij de eerste klik op Bewaren alleen een open keuzelijst sloot; reproduceer het eerst in een test.
- **Onderdelenpaneel** (`OnderdelenPaneel.vue`): drie groepen met koppen, namelijk Kring en beveiliging, Eindpunten, Sjablonen en referenties. Minder gebruikte acties staan achter "Meer…". Per zichtbare groep hooguit ongeveer zes knoppen.
- **Eigenschappenpaneel:** groepen "Elektrisch" (In, polen, curve, Icn, gevoeligheid), "Benaming en plan" (label, naam op plan, vaste kringcode) en "Ruimte" (soort ruimte). Velden die voor het nodetype niet gelden, verdwijnen niet stil: houd het huidige gedrag van welke velden er zijn, maar groepeer ze.
- **Keuzelijsten met toestellen** tonen differentiëlen als "Differentieel B · 30 mA" (referentie + gevoeligheid) in plaats van "Differentieel 2".
- **Bedrijfsgegevens en organisatie:** "Mijn organisatie" vermeldt onder de naam: "De naam en het logo op je dossiers stel je in bij Bedrijfsgegevens", met een link. Bij het logo staat "Het logo wordt meteen bewaard". De overige velden behouden hun knop.
- **Badkamer-sjabloon** (`SjabloonInvoegenDialoog.vue`): als het sjabloon een ruimte suggereert, toont de dialoog een veld "Soort ruimte", ingevuld met die suggestie. De gebruiker kan het wijzigen of leegmaken, en de waarde gaat naar de nieuwe punten.

**Files:** `ProjectgegevensDialoog.vue`, `projectformulier.ts`, `AdresVelden.vue`, `OnderdelenPaneel.vue`, `EigenschappenPaneel.vue`, `velden.ts`, `SjabloonInvoegenDialoog.vue`, `packages/model/src/standaarden.ts` (een optioneel veld `ruimte` op `Sjabloon`), de pagina's onder `apps/web/app/pages/instellingen*` / organisatie, i18n.

- [ ] Schrijf falende tests:
  - Projectformulier: "Zelfde als klantadres" kopieert het adres bij opslaan en laat het werfadres leeg als de gebruiker dat wil (volg het bestaande adresmodel).
  - Het label van een differentieel volgt het formaat "Differentieel B · 30 mA".
  - Het Badkamer-sjabloon zet de gekozen ruimte op de nieuwe punten.
  - Een e2e-stap: Projectgegevens openen, een keuzelijst openen, met één klik bewaren en de waarden zijn opgeslagen.
- [ ] Draai de tests en zie ze falen.
- [ ] Implementeer.
- [ ] Draai de tests, de e2e van Projectgegevens en instellingen, en de typecheck. Controleer visueel.
- [ ] Commit: `refactor(ui): group long forms and panels`.

### Task 6: Afdruk: kleine schema's heel laten en de cartouche netjes

**Besluit:**
- De compacte paginering (`packages/layout` / `packages/render`) splitst een schema alleen als het werkelijk niet op de bladzijde past. Een schema dat op één bladzijde past, houdt de voeding in de tekening en krijgt geen "p. 1 #1"-verwijzingen.
- Cartouchecellen breken lange waarden (EAN, adres, namen) af binnen de cel, en de tekst valt nooit buiten de cel.
- In `AfdrukVoorbeeld.vue:38` wordt `#e2e8f0` een semantische kleur of een benoemde variabele voor de papierachtergrond.

**Files:** de pagineringsmodule in `packages/layout` of `packages/render` (zoek op de vervolgverwijzingen "p. "), de cartouche-renderer, `AfdrukVoorbeeld.vue`. Tests en snapshots in de bestaande render-tests.

- [ ] Schrijf falende tests:
  - Een klein schema (voeding, 1 differentieel, 3 kringen) geeft één pagina zonder vervolgverwijzingen.
  - Een groot schema splitst nog op dezelfde plaats als vóór de wijziging (regressie).
  - Een EAN van 18 cijfers en een lang adres blijven binnen de celgrenzen (meet de tekstbreedte tegen de cel, volgens het bestaande meetpatroon in render).
- [ ] Draai de tests en zie ze falen.
- [ ] Implementeer.
- [ ] Draai de render-, layout- en printtests, plus de seriële prestatietests (`pnpm test:prestatie`). Render een voorbeeld-PDF (`pnpm voorbeeld:print`) en bekijk die visueel.
- [ ] Commit: `fix(print): keep small diagrams whole and wrap cartouche cells`.

### Task 7: Plan-editor bewust licht, met tokens

**Besluit:**
- De plan-editor blijft licht, als papier.
- De 12 hardgecodeerde kleuren in `apps/plan-editor/src/App.svelte:104-113` en `style.css:3-9` worden CSS-variabelen met betekenisvolle namen (bijvoorbeeld `--plan-papier`, `--plan-inkt`, `--plan-rand`, `--plan-succes-*`, `--plan-fout-*`), gedefinieerd in `style.css`.
- De lettergrootte van 13px wordt 0.8125rem als token `--plan-tekst-klein`, of de labelgrootte van 0.875rem als dat in de toolbar past.
- De 🏠-emoji in de lege staat wordt een Lucide-achtig inline SVG-icoon of verdwijnt.
- DESIGN.md krijgt een korte sectie "Plan-editor", die de bewuste lichte papierstijl en deze tokens vastlegt.

**Files:** `apps/plan-editor/src/App.svelte`, `apps/plan-editor/src/style.css`, de lege-staatcomponent in `apps/plan-editor/src`, `DESIGN.md`. Raak `apps/plan-editor/vendor` niet aan.

- [ ] Bouw de plan-editor (`pnpm --filter @elentrik/plan-editor build`) en draai de bestaande tests van de plan-editor als nulmeting.
- [ ] Vervang de waarden door tokens, zonder dat de kleuren visueel veranderen. Controleer met een screenshot ervoor en erna.
- [ ] Draai `impeccable detect --json apps/plan-editor/src` (launcher: `C:/Users/SteffBeckers/.claude/plugins/cache/impeccable/impeccable/4.8.0/skills/impeccable/scripts/impeccable`). Verwacht: geen `design-system-color` en geen `design-system-font-size` meer, of alleen in de tokendefinities.
- [ ] Werk DESIGN.md bij en commit: `refactor(plan-editor): name light paper tokens`.

### Task 8: Projectlijst en eerste gebruik

**Besluit:**
- Na "Aanmaken" in `NieuwProjectDialoog` ga je meteen naar `/projecten/<id>`.
- `relatieveTijd` toont tijden in de toekomst (klokverschil) als "zojuist".
- De projectlijst krijgt kolommen "Werf" (gemeente van het werfadres, anders van het klantadres) en "Status". Status is "Geëxporteerd" (met datum) als er een export bestaat, anders "Concept". De zoekfunctie zoekt ook op de gemeente.
- De lege projectlijst toont de vier stappen van de workflow kort, met de knop "Nieuw project" als primaire actie. Er komt geen tour of modal.
- Na het oplossen staat de conflictdialoog: als de server de tijd en de gebruiker van de laatste wijziging kent, toont de dialoog "Gewijzigd door X om HH:MM". Kent de server ze niet, dan blijft de huidige tekst.

**Files:** `apps/web/app/pages/index.vue`, de `NieuwProjectDialoog`-component, de util voor `relatieveTijd`, de API die de projectlijst levert (`apps/web/server/...`; zoek de route van de lijst), `ConflictDialoog.vue` / `apps/web/app/editor/conflict.ts`, i18n.

- [ ] Schrijf falende tests:
  - `relatieveTijd` met een tijd in de toekomst geeft "zojuist".
  - Een servertest: de lijstroute levert `werfGemeente` en `laatsteExport` (of null) en blijft beperkt tot de eigen organisatie.
  - Een e2e-stap: nieuw project aanmaken opent de editor.
- [ ] Draai de tests en zie ze falen.
- [ ] Implementeer.
- [ ] Draai de server-, web- en projectlijst-e2e-tests en de typecheck.
- [ ] Commit: `feat(projects): open new projects and show site and status`.

### Task 9: Kringenlijst bewerkbaar en materiaallijst als CSV

**Besluit:**
- In `KringenlijstTabel.vue` kan de kolom omschrijving (naam van de kring) inline bewerkt worden: Enter of blur bewaart, Escape annuleert. Dat loopt via dezelfde store-operatie als het Eigenschappenpaneel, zodat undo/redo werkt. Andere kolommen blijven alleen-lezen. Het bestaande roving-tabindexpatroon blijft.
- De materiaallijst krijgt een knop "CSV downloaden": `;` als scheidingsteken, UTF-8 met BOM, kolommen zoals in de lijst. Sorteer op soort en dan op specificatie, zodat 30 mA en 300 mA differentiëlen naast elkaar staan; dat sorteren geldt ook in de lijst zelf.
- Bulkbewerking van meerdere punten valt buiten dit plan (zie Uitgesteld).

**Files:** `apps/web/app/components/**/KringenlijstTabel.vue`, de materiaallijstcomponent, een nieuwe pure util `apps/web/app/editor/materiaalcsv.ts`, `packages/model/src/materialen.ts` (sortering), i18n.

**Interfaces:**
- Produces: `materiaalCsv(regels: MateriaalRegel[], taal: string): string`.

- [ ] Schrijf falende tests:
  - `materiaalCsv` volgt Review Focus 5 (puntkomma, aanhalingstekens, accenten, BOM).
  - De sortering zet de differentiëlen samen.
  - Een componenttest of e2e: de omschrijving wijzigen in de kringenlijst, ongedaan maken, opnieuw.
- [ ] Draai de tests en zie ze falen.
- [ ] Implementeer.
- [ ] Draai de tests en de typecheck.
- [ ] Commit: `feat(lists): inline circuit names and material CSV export`.

### Task 10: Dossierchecklist noemt wat ontbreekt

**Besluit:** het checklistpunt "Nog N onderdelen op het plan plaatsen" toont in de editor de namen van die onderdelen (bv. "I3, PV-installatie, aardingsonderbreker"), elk als knop die het onderdeel selecteert. De bijlage in de PDF doet dat al sinds het vorige plan; gebruik dezelfde benoeming uit de gedeelde dossierstatus.

**Files:** `apps/web/app/components/editor/DossierChecklist.vue`, `apps/web/app/editor/dossierstatus.ts` (of de gedeelde module in render), i18n.

- [ ] Schrijf een falende componenttest: de checklist met twee ongeplaatste onderdelen toont beide namen, en een klik selecteert het onderdeel.
- [ ] Implementeer, draai de tests en de typecheck.
- [ ] Commit: `feat(editor): name unplaced parts in the dossier checklist`.

### Task 11: Eindcontrole

- [ ] Draai de volledige suite: `pnpm test:parallel` (met maximaal twee workers als het geheugen krap wordt), `pnpm test:prestatie` en `pnpm typecheck`, plus de e2e-specs van de geraakte schermen.
- [ ] Draai `impeccable detect --json apps/web/app` en `apps/plan-editor/src`. Verwacht: geen nieuwe meldingen.
- [ ] Controleer visueel op desktop en mobiel, in dark en light: de projectlijst, de editor met het sneltoetsenoverzicht, Projectgegevens, het situatieschema in de modus "Doorgaan" en het afdrukvoorbeeld.
- [ ] Voeg in `docs/reviews/` een kort verslag toe met wat er veranderde per critique-bevinding, plus de testresultaten.

## Uitgesteld (met reden)

- **Bulkbewerking van meerdere punten in het eendraadschema:** vraagt een nieuw selectiemodel. De bewerkbare kringenlijst (taak 9) en dupliceren (taak 4) dekken het meeste herhaalwerk. Wordt een opvolgpunt.
- **Snap naar de muur bij plaatsen op een plan:** vraagt geometrie van de muren uit de plan-editor. De waarschuwing bij overlap (taak 4) voorkomt de ergste fout. Opvolgpunt.
- **Een ruimtenaam die de ruimtesoort zet in de plan-editor:** raakt het documentmodel van de plan-editor. Opvolgpunt.
