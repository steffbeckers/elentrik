# Bron handmatig afdekken

De gebruiker vraagt alle resterende productproblemen op te lossen en heeft verdere ontwerpvragen overgeslagen. Implementatiekeuze: rechthoekige witte afdekkingen op het geïmporteerde plan, zonder het bronbestand te wijzigen. Dit is handmatig opschonen, geen automatische herkenning of herstel van verborgen bouwlijnen.

Twee tikken op tegenoverliggende hoeken werken met muis en aanraking. Een compacte knop opent de modus; alleen daar verschijnen uitleg, contouren en verwijderen. Een gekozen afdekking kan terug verwijderd worden. Een numeriek hoekformulier maakt dezelfde handeling toegankelijk zonder aanwijzer; geen permanente kruiscursor of positiebalk. Andere plaats-/meetmodi, alleen-lezen en referentiebladen blijven beschermd. Undo/redo en autosave lopen via bestaande documentoperaties.

- [x] Model: optionele `afdekkingen` met id en begrensde rasterrechthoek; toevoegen/verwijderen, vervanging van achtergrond wist oude afdekkingen; regressies voor schema, opslaan en undo.
- [x] Gedeelde SVG-laag: vaste witte vlakken boven het raster en onder de geplaatste symbolen, ook in afdruk; regressie voor laagvolgorde.
- [x] Store en PlanCanvas: modusknop, twee hoeken, selectie/verwijderen, toetsenbordformulier, NL/FR/EN; bestaande kwartslagen behouden.
- [x] Gerichte unit-tests, typecontrole en browserproef door de hoofdagent; geen eigen devserver of browsersessie.

Bewijs: 35 gerichte model/store/render-tests slagen na de rode tests. Model en render typecontrole slagen. Browserregressie toegevoegd voor twee hoeken, undo/redo, bronbehoud, herladen, verwijderen en numerieke invoer op mobiel; hoofdagent voert uit.

Hoofdagent: de gecombineerde browserproef slaagt op desktop en mobiel, inclusief undo/redo, herladen, verwijderen en bescherming van referentiebladen. Eén bronafdekking is daarnaast via de interne Orca-browser in het echte proefproject opgeslagen.
