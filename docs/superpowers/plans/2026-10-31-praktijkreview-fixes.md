# Praktijkreview — implementatieplan

> **For agentic workers:** gebruik test-driven-development voor de regressies en verification-before-completion voor de eindcontrole. De onafhankelijke export- en auth-onderzoeken worden volgens dispatching-parallel-agents uitgevoerd.

**Goal:** de bevestigde problemen uit de praktijkreview oplossen zonder bestaande dossiers te verliezen.

**Architecture:** behoud de pure model/AREI/layout/render-pakketten en de bestaande Nuxt-editor. Voeg optionele documentvelden toe voor installatiecontext, ruimtenamen en planweergave. Nieuwe dossiers starten met onbekende installatiecontext: een nieuw dossier is niet noodzakelijk een nieuwe installatie. Oude dossiers zonder context worden niet stilzwijgend als conform of nieuw beschouwd.

**Tech Stack:** bestaande TypeScript, Zod, Vue/Nuxt, Pinia, Vitest en PDF-renderpipeline; geen nieuwe dependencies.

**Spec:** de gebruikersopdracht om de problemen uit de voorgaande praktijkreview op te lossen; het reviewrapport staat lokaal in out/review-2026-10-31/review-elentrik.html.

## Ontwerpkeuzes en grenzen

- Gerichte verbeteringen binnen de bestaande architectuur; geen vervangende editor of generieke CAD-module.
- Gewone contactdozen en lichtpunten zonder 30 mA krijgen bij context nieuw een fout; bestaande/onbekende context vraagt expliciete controle van toepasselijkheid, zonder een afwijking automatisch toe te kennen.
- De regelset blijft voorlopig. UI en PDF tonen de beperkte reikwijdte; geen claim dat hiermee het volledige AREI is geverifieerd.
- Ruimteclassificatie blijft bestaan voor regels; een aparte vrije ruimtenaam maakt Hal en Slaapkamer 1 mogelijk.
- Export bewaart ingevoerde gegevens en breekt tekst af met paginering, in plaats van identifiers weg te knippen.
- Planinstellingen: symboolgrootte, labelgrootte en onafhankelijke labelverschuiving; dezelfde afleiding voor editor en PDF. Bestaande plaatsingen behouden hun uiterlijk bij ontbrekende instellingen.
- Registratie: alleen een bewezen oorzaak repareren; geen speculatieve wijziging aan stagingbeveiliging of deployment.

## Review Focus

- Oude documenten zonder nieuwe velden blijven laden en behouden plaatsingen en validatiecontext.
- Vrije ruimtenamen mogen de badkamerclassificatie niet omzeilen.
- Verplaatsen/draaien mag labelinstellingen niet verliezen; undo en read-only moeten werken.
- Lange adressen/omschrijvingen en XML-tekens moeten volledig, veilig en binnen de PDF-pagina blijven.
- Nieuwe kringstart respecteert voorinstellingen en maakt één undo-stap; directe leiding/beveiliging blijft bruikbaar.

## Taken

- [x] 1. Model en validatie: regressies voor installatiecontext, 30 mA op gewone punten, behoud oude dossiers; context in projectformulier, beperkte controle in UI; veilige sjablonen. Test model/arei/projectformulier/editor.
- [x] 2. Export: 6 kA, omschrijvingen, aantallen/varianten, vrije ruimtenaam, volledige A4-adressen, beperkte-controlevermelding. Test render/layout en visuele PDF-controle.
- [x] 3. Editor: gekozen eindpunt in nieuwe kring opnemen; vrije ruimtenaam en Hal. Test toevoegen/velden/vertalingen en browser.
- [x] 4. Situatieplan: instelbare symbool/labelgrootte en labeloffset, stabiele plaatsmodus, begrijpelijke schaalweergave. Test model/store/render en browser met bestaand testproject.
- [x] 5. Registratie: auth/config/routes/tests onderzoeken; alleen onderbouwde reparatie. Open runtimevraag afzonderlijk rapporteren als logs ontbreken.
- [x] 6. Integratie: pnpm test, pnpm typecheck, diff-review, echte browser- en PDF-controle.

## Uitvoeringslog

- Baseline: 132 testbestanden, 3192 tests geslaagd; 5 prestatietests geslaagd. Geïsoleerde worktree, detached HEAD; appbroncode initieel schoon. Alleen lokale .pnpm-store ongevolgd.
- Autorisatie: gebruiker vraagt de eerder beschreven problemen op te lossen; geen extra goedkeuringsrondes voor routinekeuzes. Geen deployment of merge.

## Eindverificatie — 31 oktober 2026

- Model, editor, export en planopmaak geïmplementeerd met regressietests. Nieuwe velden zijn optioneel voor bestaande dossiers.
- `pnpm test`: 135 bestanden / 3223 tests geslaagd, daarna alle 5 prestatietests geslaagd. Na de laatste hoofd-30mA-correctie voor badkamer/wasplaats: volledige AREI-suite opnieuw, 16 bestanden / 215 tests geslaagd (waaronder twee nieuwe regressies).
- `pnpm typecheck`: alle pakketten en de Nuxt-app geslaagd. `git diff --check`: geen problemen.
- Onafhankelijke review: extreme metadata (>60 mm cartouche) veroorzaakte eerst exportfouten; nu begrensde cartouche met volledige metadata op gepagineerde projectgegevenspagina's. Herreview bevestigde de repro opgelost.
- Browser: bestaande woning met zes kringen en achttien punten; ontbrekende aanvullende bescherming geeft 10 waarschuwingen bij onbekende context en 10 fouten bij nieuw. Planopmaak 150% symbolen / 160% labels en DB1-labeloffset -15 px blijven bewaard. Hal en vrije ruimtenaam ingevoerd.
- Plaatsmodus: canvas bleef exact x224/y106/b1075/h826 vóór en na kiezen van een te plaatsen punt. Tijdelijke verwijdering van DB1 ongedaan gemaakt; alle punten opnieuw op het plan.
- Echte A4-export V3 via app gemaakt en alle vijf pagina's gerenderd en visueel bekeken. 6 kA, TV-hoek, contactdoos ×3, wisselschakelaars, Hal gelijkvloers, volledige klant-/werfinformatie en berekende afdrukschaal aanwezig. Bewust fout testdossier bevat verplicht de tien bevindingen.
- Bewijs: `out/review-2026-10-31/dossier-na-herstel-A4.pdf`, `export-na-herstel-1.png` t/m `-5.png`, `08-planopmaak-na-herstel.png` en testlogs in dezelfde map (lokale, genegeerde artefacten).
- Registratieonderzoek afgerond, probleem nog open: 182 gerichte auth/config-tests geslaagd; geen bewezen codeoorzaak. Nodig voor vervolg: web-staging/Postgres-logs van 31 oktober 2026 20:12–20:20 UTC en originele signup-responsecode. Geen speculatieve auth- of deploymentwijziging gedaan.
- De automatische AREI-controle blijft uitdrukkelijk beperkt en voorlopig. Geen deployment, push of merge uitgevoerd.

## Statusupdate — 1 november 2026

- De gebruiker bevestigt dat registratie op staging intussen is opgelost. Dit is geen open reviewpunt meer; de oplossing gebeurde buiten bovenstaande wijzigingen. Niet opnieuw getest in deze toelichtingsronde.
