# ACA-broninventaris en resterende reproductiegrenzen

Audit op 5 november 2026, uitsluitend bron- en codeonderzoek. De integratiecheckout liep tijdens het onderzoek van `81a24e6` naar `1693207`; onderstaande conclusies zijn gebaseerd op de daadwerkelijk gelezen bestanden, niet op een veronderstelde oude implementatie. Geen productcode gewijzigd en geen E2E uitgevoerd.

**Latere implementatie:** commit `b89e1d0` voegt de hier vastgestelde wandlichtvariant, tweepolige schakelaar, deurbel/monitor en keuze voor leidingnotatie met/zonder beschermingsgeleider toe. De vergelijking verderop blijft de oorspronkelijke audit bij `1693207`; de genoemde vier ontbrekende mogelijkheden zijn daarmee geen actuele open punten meer. De handmatige UI-proef bevestigde daarna twee invoeggaten: een differentieel ná automaat B en de hoofdleiding vóór A. Commit `84a00d0` voegt daarvoor expliciet invoegen vóór de selectie toe; beide routes zijn nadien via de UI uitgevoerd, met behoud van bestaande node-ID’s en plaatsingen. Ook de volledige EV- en PV-ketens, aanlegkeuzes en 64 plaatsingen zijn nu gecontroleerd. De actuele verificatie en resterende bronafwijkingen staan in het [hertestrapport](2026-11-05-elektricien-hertest.md).

Bron: lokaal [ACA-gids maart 2025](D:/steffbeckers/elentrik/out/review-2026-11-05/aca-maart-2025.pdf), gedrukte/PDF-pagina's 26–27 en symbolentabel 29–30. Aanvullend is p. 28 geraadpleegd om de tweepolige schakelaar ondubbelzinnig te onderscheiden. Het voorbeeld zelf draagt **Revisie 02 / Datum 01/06/2023**. Dit document inventariseert de tekenreferentie; het beoordeelt de actuele wettelijke conformiteit niet.

Visuele controle: [p. 26 op hoge resolutie](../../out/hertest/aca26-hi.png), [p. 27 op hoge resolutie](../../out/hertest/aca27-hi.png), plus uitsneden rechtstreeks uit het bron-PDF. De voorbeeldschema's zijn ingesloten rasterbeelden; vergroten voegt geen ontbrekende brondetails toe. De hieronder expliciet benoemde onzekerheden mogen daarom niet stil worden ingevuld.

## Oorspronkelijk oordeel bij 1693207

Een volledige, getrouwe reproductie van de bron is **nog niet aangetoond en heeft concrete model-/symboolgrenzen**. De zekere grenzen zijn wandlichtpunten, tweepolige schakelaars en de verplichte `G` in leidingnotatie. Ook ontbreken specifieke bronannotaties en enkele bijzondere pictogrammen als eigen invoer-/tekenmogelijkheden.

De EV-differentieel ná de automaat en een serie van omvormer → DC-leiding → PV-paneel zijn daarentegen **geen ontbrekende boomstructuren**: de huidige modelregels laten ze al toe. Een nog niet uitgevoerde UI-reconstructie van die reeksen is geen bewijs van een modelblokkade.

Een geïmporteerde achtergrond waarop oorspronkelijke symbolen blijven staan, bewijst evenmin dat die symbolen met Elentrik zijn nagetekend. Voor acceptatie moeten de eigen modelonderdelen en hun afdruk afzonderlijk zichtbaar worden beoordeeld.

## Voeding, hoofdtak en groepen

| Brononderdeel | Afgelezen gegevens | Relatie |
|---|---|---|
| Voeding/cartouche | `3 × 400 V + N ~ 50 Hz` | Vierdraads driefasenvoeding; niet automatisch andere waarden afleiden. |
| kWh-teller | `40 A`, `3N400V` | Vóór de hoofddifferentieel. |
| Hoofdleiding | `XVB 4x10`, `Cca` | Tussen teller en A; de bron gebruikt hier **x**, niet G. |
| A | Hoofddifferentieel: 300 mA, 4P, 40 A, type A | Voedt de hoofdrail. A is een differentieelreferentie, geen eindkring. |
| F | Differentieel: 30 mA, 2P, 63 A, type A | Voedt G, H, I, J, K. |
| L | Differentieel: 30 mA, 2P, 63 A, type A | Voedt M, N, O, P, Q, R. |
| EV-differentieel zonder eigen letter | 30 mA, 4P, 40 A, type A | Ná automaat B, vóór de leiding/laadpaal. Niet verwarren met B zelf. |
| Aarding links van de hoofdrail | Aardingsonderbreker en aardelektrode/aardingsaanduiding | Als getekende objecten zichtbaar; geen afzonderlijke huidige nodetypes. |

De bron heeft **16 eindkringen**: B, C, D, E, G, H, I, J, K, M, N, O, P, Q, R en S. Met A, F en L zijn dus niet alle letters eindkringcodes. Alle 16 getekende automaten vermelden **3 kA**.

## Eindkringen: beveiliging, leiding en punten

Wand-/buistekens moeten naast de tekst worden overgenomen. De bron toont bij E, G, M en N met VOB een buiscirkel naast de wandmarkering; de vergroting van N/O bevestigt het verschil met O. Ook B, D, de hoofdleiding en de DC-zijde hebben een zichtbare cirkelmarkering. Een volledige omzetting van iedere geroteerde wandmarkering naar de UI-keuze inbouw/opbouw is in deze beperkte audit niet uitgevoerd; dat is een nog te controleren invoerkeuze, geen ontbrekend aanlegveld.

| Kring | Automaat | Leidingtekst | Puntinhoud en bronomschrijving |
|---|---|---|---|
| B | C32, 4P, 3 kA | `XGB 5G10 Cca` | B1 laadpaal, met tekst **6 mA DC detectie**; afzonderlijke 30 mA-differentieel na de automaat. |
| C | C20, 2P, 3 kA | `XVB 3G2,5 Cca` | C1 oven. |
| D | B25, 3P, 3 kA | `XGB 3G4 Cca` | D1 fornuis/kookplaat. De bronwaarde 3G4 wordt hier letterlijk geïnventariseerd, niet gecorrigeerd. |
| E | B10, 2P, 3 kA | `VOB 3G1,5 Eca` | E1 **Deurbel / Monitor**; getekend als monitor met onderaan bediening, niet als het halve-cirkelsymbool voor een bel uit p. 29. |
| G | C16, 2P, 3 kA | `VOB 3G1,5 Eca` | G1–G7 licht gelijkvloers; samenstellingen hieronder. |
| H | C20, 2P, 3 kA | `XVB 3G2,5 Cca` | H1 dubbele contactdoos met diepvriezer én koelkast; H2 contactdoos met vierkant ∞-pictogram, overeenkomstig ventilator op p. 29; H3 tweepolige schakelaar met rond pictogram met drie bladen. Bronkop: stopcontacten keuken. |
| I | C20, 2P, 3 kA | `XVB 3G2,5 Cca` | I1 enkel, I2 dubbel, I3 enkel contactdoospunt; living + zolder. |
| J | C20, 2P, 3 kA | `XVB 3G2,5 Cca` | J1–J7, telkens één contactdoos; gelijkvloers. |
| K | C20, 2P, 3 kA | `XVB 3G2,5 Cca` | K1–K3, telkens dubbele contactdoos; keukenwerkblad. |
| M | C16, 2P, 3 kA | `VOB 3G1,5 Eca` | M1–M2 licht verdieping; samenstellingen hieronder. |
| N | C20, 2P, 3 kA | `VOB 3G2,5 Eca` | N1 tweepolige schakelaar en drie wandlichtpunten; badkamer. De bron gebruikt ook hier C20 en 2,5; niet vervangen door een veronderstelde standaardverlichtingskring. |
| O | C20, 2P, 3 kA | `XVB 3G2,5 Cca` | O1 enkel, O2 enkel, O3 dubbel contactdoospunt; lavabo/slaapkamer. |
| P | C20, 2P, 3 kA | `XVB 3G2,5 Cca` | P1 wasmachine. |
| Q | C20, 2P, 3 kA | `XVB 3G2,5 Cca` | Q1 vaatwasmachine. |
| R | C16, 2P, 3 kA | `XVB 3G2,5 Cca` | R1–R2, telkens één contactdoos; gelijkvloers, elektrisch gordijn. Er is op deze twee punten geen afzonderlijk motorsymbool getekend. |
| S | C25, 4P, 3 kA | AC: `XGB 5G4 Cca`; DC: `Solar DC 2x6 Cca` | Omvormer met **P AC MAX = 10 kVA**, daarna DC-leiding en PV-array **×20**. Situatieplan noemt de omvormer S1. De array heeft op deze uitsnede geen afzonderlijk zichtbaar S2-nummer. Niet zelf S2 als brongegeven verzinnen. |

Voor H3 is de schakelaarsoort zeker op grond van de twee parallelle streepjes aan één hendel. De precieze benaming van het ronde driebladenpictogram is **niet expliciet bijgeschreven**. Ventilator is een plausibele interpretatie, maar wordt hier niet als door de brontabel bewezen toestelidentiteit behandeld. Het huidige ventilatorsymbool is het vierkante ∞-symbool, zodat een pixelgetrouwe match met het ronde H3-pictogram evenmin is aangetoond.

## Geschakelde lichtpunten zonder samenvoegen van verschillende referenties

De wandlichtaansluiting is het kruis met een losse korte streep naast het kruis, in het horizontale eendraadschema als streep onder het kruis weergegeven. Op p. 29 staat dit expliciet onderscheiden van het gewone lichtpunt. Roteren van een gewoon kruis voegt die streep niet toe.

| Punt | Schakelaars | Lichtpunten |
|---|---|---|
| G1 | 1 enkelpolige | 1 wandlichtpunt |
| G2 | 2 wisselschakelaars | 2 wandlichtpunten |
| G3 | 2 wisselschakelaars | 1 wandlichtpunt |
| G4 | 2 wisselschakelaars | 2 wandlichtpunten |
| G5 | 1 enkelpolige | 1 wandlichtpunt |
| G6 | 2 wisselschakelaars | 1 wandlichtpunt en 1 gewoon lichtpunt |
| G7 | 1 enkelpolige | 2 wandlichtpunten |
| M1 | 2 wisselschakelaars | 1 wandlichtpunt |
| M2 | 1 enkelpolige | 2 wandlichtpunten |
| N1 | 1 **tweepolige** | 3 wandlichtpunten |

G bevat dus 11 schakelaars en 11 lichtpunten op 7 elektrische puntreferenties, waarvan 10 wandlichtpunten. M bevat 3 schakelaars en 3 wandlichtpunten op 2 referenties. N1 bevat 1 tweepolige schakelaar en 3 wandlichtpunten op 1 referentie. Bij een samenstelling moeten de afzonderlijke symbolen op het situatieplan zelfstandig plaatsbaar blijven met hun gedeelde referentie. Eén lichtnode `aantal:3` is niet hetzelfde bewijs als drie afzonderlijk geplaatste N1-armaturen.

## Wat p. 27 wel en niet lokaliseert

| Bronblad | Zichtbare referenties |
|---|---|
| Gelijkvloers, voorbeeldblad 2/5 | B1; G1–G7; J1–J7; R1–R2; S1 omvormer; bord/teller/aardingsaanduiding bij de trap. Meerdere schakelaars/lampen dragen dezelfde G-code. |
| Eerste verdieping, voorbeeldblad 3/5 | C1, D1, E1; H1–H3; I1–I2; K1–K3; M1–M2; N1; O1–O3; P1, Q1. Samengestelde punten hebben meerdere fysieke symbolen met dezelfde code. |
| Niet gelokaliseerd op deze twee uitsneden | I3 uit de omschrijving living + zolder; de PV-array ×20. Er is hier geen zolder- of dakblad beschikbaar. Dat is een beperking van deze **bronselectie**, geen bewezen ontbrekende importfunctie. |

## Oorspronkelijke vergelijking bij 1693207

| Onderdeel | Codebewijs | Beoordeling |
|---|---|---|
| Kringletters en differentieelreferenties | `packages/model/src/schema.ts` heeft `kringCode` en `referentie`; `packages/layout/src/labels.ts` neemt de differentieelreferentie op. | Ondersteund. A/F/L niet als eindkringen invoeren. |
| Bescherming en leidingbasis | Schema bevat curve B/C/D, polen, nominaal_A, kortsluitvermogen_kA, kabeltype, doorsnede, geleiders, brandreactieklasse en gecombineerde aanleg. | Alle genoemde automaat-/differentieelwaarden zijn structureel invoerbaar. Eca/Cca en in-buis-plus-wand zijn geen resterende generieke veldgaten. |
| EV-differentieel na B | `packages/model/src/structuur.ts:8` laat differentieel als kind van automaat toe; `:18` ook na leiding. | **Geen ontbrekende modeltopologie.** Mogelijke UI-invoegroute en uiteindelijke keten/afdruk moeten nog met deze exacte bron worden beoordeeld. |
| Omvormer → DC-leiding → PV | `structuur.ts:9,18,22`: toestel mag leiding als kind hebben; leiding mag toestel als kind hebben. `ToestelsoortSchema` bevat omvormer en pvPaneel. | **Geen ontbrekende modeltopologie.** Exacte bronnotatie/parameters hebben wel grenzen hieronder. Een afzonderlijke PV-node krijgt mogelijk een extra puntreferentie; het gewenste bronreferentiegedrag moet expliciet worden beoordeeld, niet aangenomen. |
| Losse onderdelen onder één punt | `packages/model/src/aftakkingen.ts` en `packages/layout/src/aftakkingen.ts` ondersteunen gemarkeerde reeksen van schakelaar, lichtpunt, contactdoos en toestel met gedeelde puntreferentie. | H1/H2 en de lichtsamenstellingen zijn niet bij voorbaat geblokkeerd door alleen de aanwezigheid van verschillende onderdeelfamilies. Volledige UI-reconstructie nog niet bewezen. |
| **Wandlichtpunt** | `schema.ts:134` heeft alleen standaard/led/tl/spot/noodverlichting; `packages/symbols/src/punten.ts:90` tekent geen aparte wandmarkering. | **Bewezen ontbrekende variant/eigenschap en tekening.** Een label “wandlamp” of rotatie van het standaardlichtpunt vervangt ×\| niet. Raakt G, M en N. |
| **Tweepolige schakelaar N1 en H3** | Schema schakelaar heeft geen polen/tweepolig-variant. `punten.ts:218` tekent dubbel als twee uiteenlopende hendels. Bron p. 28 tekent tweepolig als één hendel met twee streepjes; de twee-hendelvariant heet daar eenpolige omschakelaar, dubbele aansteking. | **Bewezen semantisch en grafisch verschil.** “Dubbel” is geen aangetoonde oplossing voor N1/H3; waterdicht is evenmin een poleigenschap. |
| **Leiding zonder G** | `packages/layout/src/labels.ts:32` voegt altijd `${aantalGeleiders}G${doorsnede}` toe. Geen keuze x/G of afzonderlijke PE-aanwezigheid in leidingmodel. | **Bewezen notatiegrens** voor hoofdleiding `4x10` en DC `2x6`. “Solar DC” als kabeltype invullen geeft alsnog `2G6`; niet als getrouwe bronovername presenteren. |
| E1 monitor | De expliciete broncaption bij kring E op p. 26 luidt `Deurbel / Monitor`; dit is geen toestelnaam uit de symbolentabel. Toestellen bevatten bel, geen specifieke monitorvariant. `punten.ts:291` tekent bel als halve cirkel, niet het display met onderste bedieningsband van p. 26/27. | Specifiek monitorpictogram ontbreekt. Een generiek display-/bedieningssymbool met de broncaption kan een passende oplossing zijn; een specifieke intercomfunctie is niet door deze bron bewezen en hoeft niet te worden verzonnen. |
| H3 rond driebladenpictogram | `punten.ts:297` ventilator is vierkant met twee lussen. | Exacte bronidentiteit onzeker; exacte glyphmatch ontbreekt. Niet stil als droogkast of motor invoeren. |
| PV-array ×20 en 10 kVA | Toestel heeft `vermogen_W`, geen aantal panelen of schijnbaar vermogen in VA. `punten.ts:317` heeft wel een PV-symbool, `:376` een omvormer. | De **categorieën bestaan**. De bronaanduidingen aantal20 en 10kVA zijn niet als die parameters opgeslagen/afgedrukt. 10kVA mag niet zonder bronkennis naar 10000W worden omgezet. Vrije omschrijving is hoogstens een expliciete tekstuele workaround. |
| 6 mA DC-detectie bij laadpaal | Toestelvelden hebben geen DC-detectie-eigenschap. | Specifieke parameter ontbreekt. Een label kan de broninformatie tekstueel bewaren, maar is geen gestructureerde detectie-eigenschap of automatisch identieke schema-aanduiding. |
| 50 Hz en teller40A | Voeding bevat uitsluitend stroomtype; teller heeft geen stroom-/frequentieveld (`schema.ts:89,225`). `voedingTekst` toont uitsluitend de opgeslagen spanning/configuratie. | Bewust niet afgeleid, dus de brongegevens zijn niet volledig als eigen technische velden reproduceerbaar. De verbeterde 400V-vermelding lost dit niet impliciet op. |
| Aardingsonderbreker/aardelektrode | Geen bijbehorend nodetype in de schema-union of `packages/symbols/src/teken.ts`; het aansluitingssymbool in `voeding.ts` is een AC-aansluitcirkel. | De specifieke getekende aardingsobjecten uit de bron zijn niet als eigen dossieronderdelen aanwezig. Dit zegt niets over een niet geteste vrije bouwkundige achtergrondtekening. |
| Koelkast, diepvriezer, ventilator, PV-categorie, bel, motor | Expliciete toestelsoorten in schema en renderer. | Niet meer als algemeen ontbrekende toestelcategorieën rapporteren. Motor komt op de onderzochte R-punten bovendien niet als afzonderlijk getekend bronobject voor. |

Algemene `label`-tekst bestaat op nodes, maar is niet hetzelfde als een gekozen elektrische variant. De schematekstfunctie in `packages/layout/src/kolommen.ts:298–341` tekent beveiliging, leiding, puntreferentie en bordnaam; zij maakt willekeurige toestelomschrijving/vermogen niet automatisch tot een brongetrouwe technische annotatie naast elk symbool. De kringenlijst kan omschrijvingen wel bewaren. Daarom moet een eventuele tekstworkaround als zodanig in de acceptatie staan.

## Oorspronkelijk open acceptatiebewijs bij 1693207

De bestaande functies volstaan niet voor de uitspraak “het hele ACA-dossier is exact in de UI gereproduceerd”. Eerst moeten de zekere symbolische/notationele verschillen hierboven zijn opgelost of expliciet als geaccepteerde afwijking zijn vastgelegd. Daarna blijft een volledige reconstructie nodig: alle 16 eindkringen met de juiste beschermingen, H-groepen en lichtsamenstellingen, afzonderlijke plaatsingen op de twee echte ondergrondbladen, en de geëxporteerde vergelijking per bronreferentie.

Op dit moment zijn EV- en PV-keteninvoer, alle bron-aanlegkeuzes en de complete punt-/toestelverdeling **onvoldoende geverifieerd**, niet allemaal bewezen ontbrekend. I3 en de PV-array missen een plaats op de twee beschikbare bronplannen; de audit mag daarvoor geen eigen geometrie verzinnen. De symbolentabel bevat daarnaast veel objecten die niet in dit voorbeeld voorkomen; volledige catalogusdekking is geen voorwaarde die uit deze beperkte bronreconstructie mag worden afgeleid.

## Actuele stand na de UI-hertest

Alle 16 eindkringen en 64 op de twee bronbladen gelokaliseerde modelobjecten zijn via de UI opgebouwd en opgeslagen. De vier ontbrekende primitieve varianten en beide invoegroutes zijn opgelost. Het volledige conceptdossier telt tien PDF-pagina’s. Daarmee vervallen de oorspronkelijke onzekerheden over de uitvoerbaarheid van EV/PV-ketens, aanlegkeuzes en groepssamenstellingen.

De exacte bronacceptatie blijft open door de ontbrekende aardingsobjecten en plaatsbare teller, de onzekere H3-glyph, extra gegenereerde PV-referentie S2 en technische gegevens die alleen als omschrijving beschikbaar zijn (20 panelen, 10 kVA, 6 mA DC-detectie), of geen eigen veld hebben (50 Hz, teller 40 A). I3 en de PV-array hebben geen locatie op de twee beschikbare bronbladen. Oude symbolen in de achtergrond zijn niet verwijderd en tellen niet als eigen modelobject. Zie het hertestrapport voor het opleverbesluit; deze beperkingen worden niet als stilzwijgend geaccepteerde afwijkingen beschouwd.
