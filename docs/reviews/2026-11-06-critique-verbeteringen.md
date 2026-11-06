# Verbeteringen na de UX-critique van 6 november

Vervolg op de critique van de volledige app (`apps/web/.impeccable/critique/2026-11-06T14-07-19Z__apps-web.md`, score 25/40) en het plan `docs/superpowers/plans/2026-11-06-critique-verbeteringen.md`. De gebruiker koos om eerst het dossier aan te pakken, alle bevindingen op te volgen en de plan-editor licht te houden. Dit verslag zegt per bevinding wat er veranderde, welke grenzen bewust bleven en wat de tests tonen.

## Wat veranderde

| Critique-bevinding | Wat veranderde |
|---|---|
| Kringletters hernummeren zonder melding (B1 wordt C1 na het Badkamer-sjabloon) | Bestaande kringen houden hun letter bij elke toevoeging: toevoegen, sjabloon, lichtschakeling en dupliceren. Een nieuwe kring krijgt de eerste vrije letter. Hernummeren blijft een bewuste actie in het venster Kringreferenties. Een document zonder vaste codes verschuift bij de eerste invoeging geen enkele letter; toevoeging en vastzetten zijn één undo-stap. |
| Geen meetwaarden in het dossier | Projectgegevens heeft een sectie Metingen: meetdatum, aardingsweerstand (Ω), isolatieweerstand (MΩ), meettoestel en opmerking. Een differentieel krijgt een groep Test met resultaat (OK, niet OK, niet getest) en uitschakeltijd (ms). De PDF toont de waarden of "niet ingevuld" in de bijlage, met een tabel van de differentieeltests en de zin "Geregistreerde meetwaarden; geen beoordeling door Elentrik.". Zonder bijlage komt dezelfde informatie op een korte slotpagina Metingen. De dossierchecklist meldt een ontbrekende aardings- of isolatieweerstand, los van de elektrische bevindingen. |
| Een lichtkring krijgt via L 3G2,5 en via het sjabloon 3G1,5 | Eén bron in `standaarden.ts`: een kring die met een lichtpunt of schakelaar begint, krijgt `XVB 3G1,5`; andere kringen 2,5 mm². Sneltoets, paneel, plusje en sjabloon gebruiken dezelfde regel. |
| "Kortsluitvermogen", "2 × 230 V (één fase)", px-velden, punt als decimaalteken | "Onderbrekingsvermogen (Icn)" / "Pouvoir de coupure (Icn)" / "Breaking capacity (Icn)". Stroomtype "2 × 230 V (eenfasig)" in drie talen. Afdek- en verplaatsvelden zeggen "beeldpunten van het plan", en cm als het plan een schaal heeft. Maten in de plan-editor gebruiken de taal van de interface ("6,5 m"). De grammatica van de bevinding over een gewone contactdoos of een gewoon lichtpunt is rechtgezet. |
| Toetsenbordhulp toont geen sneltoetsen | `?` en de knop Toetsenbordhulp openen het venster Sneltoetsen, met de toetsen van het eendraadschema en het situatieschema uit één gedeelde lijst. `?` en Ctrl+D gaan niet af in een tekstveld of een open dialoog. |
| Geen kopiëren of dupliceren | Ctrl+D (⌘D) dupliceert de geselecteerde kring met de eerste vrije letter. Een selectie die geen kring is, krijgt een korte melding. |
| Na C, L of D nog een extra klik | Met een kring geselecteerd voegen C en L meteen toe na de selectie, D vóór de selectie. De invoegbalk sluit na het toevoegen en met Escape. De bestemming van een nieuwe kring is het differentieel van de selectie, anders het laatst gebruikte differentieel in dit bord, anders het bord. |
| "Doorgaan met volgend punt" schuift stil door naar de teller | De modus stopt aan het einde van de kring met "Alle punten van kring X staan op het plan". Tijdens de modus staat er een chip met Stop, ook bereikbaar met Escape. |
| Geen waarschuwing bij overlappende plaatsing | Een punt binnen de symboolgrootte van een bestaande plaatsing geeft een niet-blokkerende melding "Overlapt met B1" met Ongedaan maken. Er is geen automatische snap. |
| Statusstippen alleen in kleur, geen legenda | Elke ernst heeft een eigen vorm of icoon. Het paneel Bevindingen heeft een legenda; informatieve meldingen worden apart geteld. |
| Afgekapte moduslabels | De keuzelijsten tonen volledige labels. |
| Opslagstatus op een smal scherm alleen een icoon | Op een smal scherm staat er ook een korte tekst: Opgeslagen, Bezig… of Niet opgeslagen. |
| `text-dimmed` haalt 3,7:1 in dark mode | `--ui-text-dimmed` is neutral-400 in dark mode en haalt minstens 4,5:1. |
| Vlakke kophiërarchie in de situatiepanelen | De koppen volgen de schaal van DESIGN.md (sectie 1.125rem/600, label 0.875rem/500). |
| Modal met ongeveer 22 velden | Projectgegevens is verdeeld in genummerde secties Klant, Werfadres, Installatie, Metingen en Dossier. Het werfadres heeft "Zelfde als klantadres". |
| Werfadres niet "zelfde als klant" in te vullen | Het vakje staat standaard aan bij een nieuw of leeg project, of als beide adressen al gelijk zijn. Bij een bestaand project met een leeg werfadres staat het uit, zodat een niet bevestigd werfadres nooit stil op de PDF komt. |
| Eerste klik op Bewaren sloot alleen de keuzelijst | Gereproduceerd met een echte klik en opgelost in Projectgegevens en in de invoegdialogen. |
| Onderdelen-paneel met ongeveer 20 keuzes | Drie groepen met koppen: Kring en beveiliging, Eindpunten, Sjablonen en referenties. Minder gebruikte acties staan achter "Meer…". |
| Eigenschappen zonder ordening | Groepen Elektrisch, Benaming en plan, Ruimte, en Test voor een differentieel. Er verdwijnt geen veld. |
| Een nieuw differentieel heet "Differentieel 2" | Keuzelijsten tonen "Differentieel B · 30 mA" (referentie en gevoeligheid). Zonder referentie: de naam van de positie en de gevoeligheid. |
| Badkamer-sjabloon zet geen ruimte | Het invoegvenster toont "Soort ruimte", ingevuld met de suggestie van het sjabloon. De waarde gaat naar de nieuwe punten en kan gewijzigd of leeggemaakt worden. |
| Bedrijfsnaam op twee plaatsen; logo meteen bewaard, de rest na Bewaren | "Mijn organisatie" verwijst naar Bedrijfsgegevens voor naam en logo op het dossier. Bij het logo staat "Het logo wordt meteen bewaard". |
| Afdrukvoorbeeld knipt een klein schema los van de voeding | De paginering splitst alleen wat werkelijk niet past, op hele banden. Een schema dat past, blijft heel en krijgt geen vervolgverwijzingen. Grote schema's splitsen zoals voorheen (zelfde aantal pagina's en verwijzingen). |
| EAN loopt over de cartouche | Cartouchecellen breken lange waarden (EAN, adres, namen) af binnen de cel. |
| `#e2e8f0` in `AfdrukVoorbeeld.vue` | Vervangen door een semantische kleur. Het voorbeeld volgt ook een wissel van licht naar donker terwijl het open staat. |
| Plan-editor altijd licht, 12 hardgecodeerde kleuren en 13px | Bewust licht, als papier. Kleuren en de kleine tekstmaat zijn benoemde tokens (`--plan-papier`, `--plan-inkt`, `--plan-tekst-klein` …) in `style.css`, zonder visueel verschil. DESIGN.md heeft een sectie Plan-editor. |
| Geen doorverwijzing na een nieuw project; "Gewijzigd: over 6 sec." | Na Aanmaken opent het project meteen. Een tijd in de toekomst (klokverschil) toont "zojuist". |
| Geen status per project in de lijst | Kolommen Werf (gemeente van het werfadres, anders van de klant) en Status (Geëxporteerd met datum, of Concept). Zoeken vindt ook de gemeente. |
| Geen eerste-gebruiksbegeleiding | De lege projectlijst toont de vier stappen van het werk en de knop Nieuw project. Geen rondleiding of modal. |
| Conflictdialoog zegt niet wie of wanneer | Ongewijzigd. De server kent de laatste auteur van een wijziging niet (het 409-antwoord bevat alleen de versie). |
| De kringenlijst is alleen-lezen | De omschrijving van een kring is in de lijst te bewerken: klik of F2, Enter of verlaten bewaart, Escape annuleert. Het loopt via dezelfde store-actie als het Eigenschappenpaneel, dus ongedaan maken werkt. |
| Geen export van de materiaallijst; 30 mA en 300 mA niet samen | Knop "CSV downloaden": `;` als scheidingsteken, UTF-8 met BOM, correcte aanhalingstekens, decimale komma, en bescherming tegen formules. Lijst en CSV sorteren op soort en daarna op specificatie (30 < 100 < 300 mA). |
| De checklist zegt niet welk onderdeel nog op het plan moet | Het punt "Nog N onderdelen op het plan plaatsen" noemt de onderdelen (bv. A1, Verdeelbord, Teller), elk als knop die het onderdeel in het eendraadschema selecteert. Dezelfde benoeming als in de PDF-bijlage. |

## Bewuste keuzes en grenzen

- **Metingen worden alleen geregistreerd.** Er is geen grenswaarde en geen oordeel. De AREI-regels in de app zijn voorlopig, dus Elentrik doet geen uitspraak over conformiteit.
- **Bestaande projecten krijgen twee nieuwe open checklistpunten** (aardings- en isolatieweerstand) en blijven concept tot die weerstanden ingevuld zijn.
- **Clientcompatibiliteit 3.** De meetvelden zijn optioneel binnen documentschema 2; oude documenten blijven leesbaar zonder migratie. De server weigert schrijfacties van een oudere editor (426), zodat die de metingen niet stil kan wegschrijven. Open tabbladen van de vorige versie vragen bij de uitrol om te herladen.
- **Metingen staan in de bijlage, niet in de cartouche.** De cartouche blijft 30 mm hoog, zodat geschaalde plannen niet over meer bladen gaan. Zonder bijlage komt een korte slotpagina Metingen; zo'n export telt één pagina meer.
- **Een kring met 6 contactdozen splitst nog op A4 liggend.** Het schema is ongeveer 190 mm hoog en de tekenruimte 151 mm. Kleiner tekenen kan niet zonder onder de 2,5 mm tekst te gaan. Een staand blad of A3 voor het eendraadschema is een productkeuze die openblijft. Een heel lang klant- en werfadres maakt de cartouche ongeveer 34 mm hoog; een klein schema kan dan ook splitsen.
- **De 🏠 in de lege staat van de plan-editor blijft.** Ze staat in de vendorcode (`FloorPlanCanvas.svelte`), die niet gewijzigd wordt. DESIGN.md vermeldt dit. Ook de getallen op de liniaal van de vendorcode houden een punt.
- **Maten in px op een plan zonder schaal** heten "beeldpunten van het plan". Een schaal wordt niet verzonnen.
- **De CSV gebruikt een decimale komma in elke taal**, omdat Excel naar de regionale instelling van Windows kijkt en de `;` al van een Belgische instelling uitgaat. Een Engelse gebruiker met Britse instellingen ziet de getallen als tekst.
- **De laatst gebruikte differentieel** voor een nieuwe kring wordt per sessie onthouden, niet in het document.
- **Uitgesteld als opvolgpunt:** bulkbewerking van meerdere punten (vraagt een nieuw selectiemodel), snap naar de muur bij plaatsen (vraagt muurgeometrie uit de plan-editor) en een ruimtenaam in de plan-editor die de ruimtesoort zet (raakt het documentmodel van de plan-editor).

## Eindcontrole

Resultaten op de eindstand van de branch:

| Controle | Resultaat |
|---|---|
| `pnpm test:parallel` (functionele suite) | **215 bestanden / 3.955 tests geslaagd** |
| `pnpm test:prestatie` (serieel) | **5/5 geslaagd** |
| `pnpm typecheck` (alle pakketten) | geslaagd |
| e2e van `apps/web` (volledige suite) | **117/117 geslaagd** (11,5 min) |
| `impeccable detect` op `apps/web/app` | 0 meldingen (vooraf 1: `#e2e8f0` in `AfdrukVoorbeeld.vue`) |
| `impeccable detect` op `apps/plan-editor/src` | 0 meldingen (vooraf 13) |

Een eerste run van `pnpm test:parallel` liep naast de e2e-server en gaf drie time-outs van 30 s in databasetests (`admin-bestanden`, `admin-projecten`, `bestanden-opslagruimte`). Apart slaagden die 36 tests; de herhaalde volledige run zonder andere belasting slaagde helemaal. De prestatietests (`printHtml op 2.000 nodes`, `schemaStripSvg`) zijn alleen onder parallelle belasting wisselvallig; de seriële run is de maatstaf.

De e2e-spec `plan-tekenen` faalde als hij als eerste op een koude ontwikkelserver draaide: de spec zet zijn standaardtime-out op 10 s, en de editor compileert bij het eerste bezoek langer. Op een warme server slaagde hij al. De spec wacht nu tot 60 s op de eerste knop. Dit was geen productfout. De eerder gemelde falingen in `talen.spec.ts` (regels 118 en 177) traden in deze runs niet op.

Visueel gecontroleerd op 1440 en 390 px breed, in licht en donker: de lege projectlijst, de lijst met een project, de editor, het venster Sneltoetsen, Projectgegevens, het situatieschema in de modus Doorgaan en het afdrukvoorbeeld. Twee fouten van deze branch zijn hersteld, elk met een e2e-controle:

- Op een smal scherm drukten de doorgaan-chip en Stop de uitleg "Klik op het plan om A1 te plaatsen." samen tot één woord per regel, en het einde viel weg. De uitleg breekt nu naar een eigen regel.
- In het venster Sneltoetsen stond de sluitknop over het einde van de uitleg in de kop. De koptekst blijft nu vrij van de knop.

Niet aangepast, want niet nieuw: de projectlijst scrolt op een smal scherm opzij, zodat Gewijzigd en de acties buiten beeld vallen. Dat deed de tabel al voor deze branch; de nieuwe kolommen Werf en Status maken het wel breder. Het afdrukvoorbeeld van het standaardsjabloon splitst op A4 liggend, zoals hierboven beschreven.

De e2e-specs draaien tegen de eigen database `elentrik_e2e` op poort 3100, nooit tegen de echte gegevens.
