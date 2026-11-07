# Situatieplan: kwartslagen

Vervolg op punt 6 van de elektricienhertest. De gebruiker vraagt het open werk voort te zetten. We werken in de bestaande verbeterbranch en checkout.

## Ontwerp en keuze

De twee bestaande draaiknoppen draaien de selectie 90° linksom/rechtsom. Hun zichtbare tekst is 90° en hun toegankelijke naam noemt de richting. R en Shift+R blijven 15° draaien. Zo kost een kwartslag één klik zonder extra knoppen of een telkens te openen stappenmenu. Alle geselecteerde punten draaien om hun eigen positie; onderlinge posities en labeloffsets blijven behouden. Samen draaien is één undo-stap. Alleen de actieve pagina wordt gewijzigd; alleen-lezen en plaats-/meetmodus blijven beschermd.

Een keuzemenu 15°/90° voegt een instelhandeling toe. Vier draaiknoppen maken de mobiele werkbalk groter. Daarom de bestaande twee knoppen aanpassen en de bestaande fijne sneltoetsen behouden. Dit is een implementatiekeuze, geen afzonderlijk door de gebruiker gekozen ontwerp.

## Uitvoering

- [x] Geometrie en store: regressies voor kwartslag, meerdere selecties, behoud van offsets/positie, undo/redo en alleen-lezen; eerst falend uitvoeren.
- [x] Optionele stap `15 | 90` toevoegen, standaard 15; werkbalk geeft expliciet 90 door. NL/FR/EN help en labels aanpassen.
- [x] Browserproef: één klik 90°, fijn draaien, undo/redo en herladen. Typecontrole en relevante unit-tests uitvoeren.
- [x] Hertestrapport bijwerken met bewijs en resterende punten.

## Overige open punten

Aarding/teller, technische annotaties en compactere afdruk vragen elk een eigen wijziging in model/rendering en eigen bronacceptatie. De onbekende H3-glyph, ontbrekende plaatsingslocaties en een schoon bronplan zijn bronvragen. Actuele AREI-toetsing en menselijke tijdmeting zijn nog geen afgeronde acceptatie. Deze wijziging sluit alleen het kwartslagprobleem; de volledige bronacceptatie blijft open.

## Verificatie

6 november 2026: twee nieuwe regressies eerst gefaald (15° waar 90° verwacht), daarna 91/91 gerichte tests geslaagd. Volledige pnpm typecheck geslaagd. Browserproef desktop en 390px mobiel geslaagd (37,4 s), met opslag/herladen, fijn draaien en undo/redo. De eerste run bereikte de test niet door een 30s beforeAll-timeout bij accountverificatie; herhaald met CLI-timeout120s, zonder wijziging van productcode of assertions. Onafhankelijke review: geen bevindingen. UI-detector: geen bevindingen.

De gebruiker heeft vervolgens expliciet gevraagd alle restpunten op te lossen; model/annotaties, printindeling en handmatige bronafdekking worden als afzonderlijke werkpakketten voortgezet.
