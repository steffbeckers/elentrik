# Hertest van de resterende elektricienpunten

Vervolg op de [praktijkreview van 5 november](2026-11-05-elektricien-hertest.md). De gebruiker vroeg op 6 november alle zes resterende productpunten op te lossen. Dit verslag onderscheidt de werking van de app van de volledigheid en elektrische juistheid van het bronvoorbeeld.

## Wat veranderde

| Eerder probleem | Nieuwe werking |
|---|---|
| Zes klikken voor 90° draaien | De twee draaiknoppen draaien 90° per klik. R/Shift+R blijven 15°. Een meervoudige selectie draait met één undo-stap, zonder de posities te verplaatsen. |
| Aarding ontbreekt, teller niet plaatsbaar | Aardingsonderbreker en aardelektrode zijn eigen modelonderdelen; beide en de teller kunnen op het situatieplan. De aarding staat in een afzonderlijke PE-tak, buiten de actieve verdeelrail. |
| Bronwaarden alleen in vrije omschrijvingen | Eigen velden voor frequentie, tellerstroom, kVA, aantal panelen en DC-detectie; technische annotaties in het schema en relevante lijsten. kVA wordt niet naar W omgerekend. |
| Extra PV-puntnummer en onbekend H3-teken | Een expliciete ongenummerde bron is mogelijk. Bestaande gedeelde groepsreferenties blijven behouden. Een driebladenglyph met vraagteken kan de vorm van H3 weergeven zonder een onbewezen toestelidentiteit te kiezen. |
| Oude en nieuwe bronlabels overlappen | **Bron opschonen** legt verwijderbare witte rechthoeken tussen de bronafbeelding en de eigen symbolen. Twee hoeken aanklikken; undo/redo, opslag, herladen en export zijn ondersteund. Een ingeklapt formulier biedt numerieke invoer. |
| Schema onnodig over veel bladen | Paginering gebruikt de werkelijk bezette delen van het schema. Vervolgverbindingen krijgen wederzijdse, unieke verwijzingen. Technische tekst wordt niet verkleind. |

De plaatsbare infrastructuur staat apart onder **Installatieonderdelen**. Ongeplaatste onderdelen houden de dossierchecklist onvolledig; dit is onderscheiden van de beperkte elektrische controles. Clientcompatibiliteit 2 beschermt het nieuwe documentmodel tegen schrijfacties van een oude editor. Bestaande versie-1-documenten blijven via de migratie leesbaar.

## Werkelijk gebruikt proefproject

De interne Orca-browser gebruikte opnieuw project `e26c4d4c-fdd2-4dc9-a8e5-dae9ee57defd` op poort 3200, met testaccount `elektricien.hertest.20261105@example.test`. De bestaande 16 kringen en 64 plaatsingen zijn behouden. Via de zichtbare app zijn 50 Hz, teller 40 A, 20 panelen, 10 kVA, 6 mA DC-detectie en de ongenummerde PV-bron ingevuld; H3 gebruikt de expliciet onbekende driebladenvorm. Aardingsonderbreker en aardelektrode zijn toegevoegd.

De teller en aardelektrode zijn op de afgelezen bronlocaties geplaatst: nu 35 eigen onderdelen op het gelijkvloers en 31 op de verdieping. Het aardelektrodelabel is via Planopmaak 240 rasterpixels naar links verschoven om overlap met S1 te verwijderen, zonder het onderdeel te verplaatsen. Eén oude R2-bronglyph is met twee hoeken afgedekt, waarbij de eigen R2 zichtbaar blijft. De rechthoek is na herladen opgeslagen. Dit bewijst de opschoonhandeling; de overige oude glyphs zijn niet allemaal handmatig afgedekt. De bestaande derde pagina **Test** is behouden.

De eerdere werkmap bevatte de lokale planbestanden. Na verwijdering waren ze nog wel zichtbaar uit de browsercache, maar ontbraken ze op de server. De eerste nieuwe UI-export sloeg daarom de situatiepagina's over. De drie oorspronkelijke rasters zijn uit de cache hersteld, met exacte controle op de opgeslagen bestandsgroottes (102.183, 98.576 en 374.930 bytes); de oorspronkelijke ACA-PDF is uit de bewaarde bron hersteld. Er is geen vervangend elektrisch model in de database geïnjecteerd. Het oorspronkelijke bestand van de afzonderlijke gebruikerspagina Test was niet uit de cache terug te halen; haar raster en documentgegevens blijven beschikbaar.

## Afdrukbewijs en verificatie

De gecontroleerde vergelijking op dezelfde eerdere projectinhoud ging van vier naar twee A3-schemabladen: alle 106 symbolen blijven eenmaal aanwezig, zonder ontbrekende of toegevoegde objecten. Ook de aangevulde projectinhoud past nu op twee A3-schemabladen, met alle 108 symbolen exact eenmaal aanwezig. Losse groepen zoals voeding, kring E en PE delen ruimte zonder tekst of symbolen te verkleinen. De vier vervolgparen verwijzen wederzijds, ook binnen hetzelfde blad. De kleinste eigen schematekst meet circa 2,498 mm. Dit is een leesbaarheidsdoel, geen wettelijke minimummaat. Deze controle is uitgevoerd in Nederlands, Frans en Engels.

De browserregressies controleren bronparameters en aarding, kwartslagen/fijne rotatie, bronafdekkingen, bescherming van referentiebladen en de werkelijke export/download. Desktop, mobiel, undo en opslag/herladen zijn daarin opgenomen. Vijf scenario's slaagden samen. De volledige functionele reeks slaagde met **204 bestanden / 3.791 tests**; de volledige typecontrole slaagde eveneens. De eerste brede runs vonden een vergeten compatibiliteitspaar, een verouderde checklistfixture en een hardcoded versienummer in een storetest; deze zijn onderzocht en gericht gecorrigeerd. Een browserrun kon eerst niet starten door een achtergebleven Nuxt-lock met inmiddels hergebruikt procesnummer; alleen die gecontroleerde testlock is verwijderd, zonder het andere proces te stoppen.

De bestaande browsersessie bracht bovendien een echte updatefout aan het licht: Nuxt-pictogrammen uit de weeklange cache droegen nog compatibiliteitsheader 1, waardoor client 2 herhaaldelijk om herladen vroeg. Cachebare asset-antwoorden bepalen die versie nu niet meer; actuele API-antwoorden, schrijfacties en expliciete 426-fouten blijven gecontroleerd. Gerichte rode/groene regressies, onafhankelijke review en normale navigatie met dezelfde browsercache bevestigen de reparatie.

De onafhankelijke reviews controleerden specifiek de scheiding van PE en de actieve rail, het behoud van groepsnummering, wederzijdse vervolgverwijzingen en de ruimteberekening van de compacte afdruk. De gevonden fouten zijn hersteld en opnieuw beoordeeld. De werkelijke UI-hertest vond daarnaast een ontbrekende plaatslijstcategorie voor de nieuwe infrastructuur; een bewaartest via de browser bevestigt nu dat teller en beide aardingsonderdelen beschikbaar blijven na herladen.

De laatste PDF-controle vond te kleine kWh-tekst binnen de nieuw plaatsbare teller. Alleen de afdrukweergave houdt deze glyph nu minimaal op zijn oorspronkelijke millimetermaat; zijn kader en kWh blijven samen, het label blijft buiten het gedraaide kader. Op het situatieblad verdwijnen de korte aansluitstompjes om geen verbinding met een naburig bord te suggereren. Het eendraadsymbool, de editor en de opgeslagen positie veranderen niet. Na deze laatste wijziging slagen **142 gerichte printtests**, waaronder twintig schaal-/rotatiegevallen, render-typecontrole, de opnieuw uitgevoerde volledige typecontrole en **5/5 seriële prestatietests**. De twintig tellergevallen zijn ook onafhankelijk herhaald.

De laatste echte UI-export, **ACA restpunten - nagekeken**, telt negen pagina's: twee A3-schema-, twee A4-situatie-, één bestaande Test-situatie-, drie kringenlijst- en één bevindingenpagina. Alle pagina's zijn gerenderd; de gewijzigde tellerregio en het verplaatste aardingslabel zijn nogmaals vergroot bekeken. Alle eigen geëxtraheerde tekst meet minstens circa **2,498 mm**. Oude tekst in de rasterbron valt buiten die meting. Het bestand en de meetgegevens staan lokaal in `out/vervolg-2026-11-06/elentrik-restpunten-finaal.pdf` en `final-pdf-audit.json`.

## Eerlijke resterende grenzen

- H3's toestelbetekenis blijft onzeker. De vorm is beschikbaar, maar het vraagteken is geen verklaring dat het een gekend AREI-toestel is.
- I3, de PV-array en de exacte locatie van de aardingsonderbreker zijn niet eenduidig op de gebruikte situatiebron terug te vinden. Die plaatsingen zijn niet verzonnen.
- Witte afdekkingen vereisen handwerk en kunnen ook bouwlijnen verbergen. Ze reconstrueren geen muren die achter een oud symbool zitten. Het proefproject is nog geen volledig schoongemaakt uitvoeringsdossier.
- Er is geen betrouwbare menselijke totale invoertijd gemeten. De eerdere deelvergelijking 21 naar 10 klikken blijft alleen gelden voor de vastgelegde plaatsreeks; de nieuwe kwartslagactie daalt wel rechtstreeks van zes naar één klik.

De actuele [FOD-publicatie van het AREI](https://economie.fgov.be/nl/publicaties/algemeen-reglement-op-de) vermeldt Boek 1 versie 07 van 15 september 2026, van toepassing vanaf 1 november 2026. De leiding- en aardingssymbolen zijn visueel met de officiële tabel vergeleken. Dat is geen deskundige toetsing van de volledige installatie: nul automatische fouten betekent geen bewezen AREI-conformiteit. De productmogelijkheden zijn uitgebreid, maar volledige exacte bronacceptatie blijft afhankelijk van de genoemde ontbrekende broninformatie en verdere handmatige afwerking.
