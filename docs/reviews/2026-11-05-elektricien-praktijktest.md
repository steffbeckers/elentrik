# Praktijktest Elentrik — een bestaand elektrisch dossier overtekenen

Datum: 5 november 2026. Lokale webapp, bediend via de interne Orca-browser. Geen productcode gewijzigd.

## Oordeel

Elentrik heeft een bruikbare basis voor het opbouwen van een nieuw dossier: elektrisch model, automatische tekening, gekoppeld situatieplan, undo, automatisch bewaren en PDF-export werken in deze test. Voor een elektricien die een bestaand dossier nauwkeurig wil overnemen, veroorzaakt de huidige bediening echter te veel herstelwerk en wijken essentiële aanduidingen af. Ik zou deze workflow nog niet als vervanging van mijn bestaande tekenproces inzetten.

Dit is een uitgevoerde praktijktest met een **gedeeltelijke reconstructie**, geen volledig nagetekende woning en geen conformiteitskeuring. De concrete beperkingen hieronder maakten een getrouwe reconstructie niet haalbaar via de onderzochte bediening. Ik heb geen projectdata via API of database ingevoerd om die beperkingen te omzeilen.

## Referentie en afbakening

Bron: [ACA, Praktische gids huishoudelijke elektrische installaties, maart 2025](https://www.acavzw.be/app/uploads/2025/01/Praktische-gids-huishoudelijke-installaties-versie-maart-2025.pdf), p. 26 figuur 13 en p. 27 figuur 14. Dit is een gepaard voorbeeld van een erkend controleorganisme. De cartouches van het afgebeelde dossier vermelden revisie 02 / 01-06-2023. De uitgiftedatum van de gids is dus niet de revisiedatum van de voorbeeldtekening.

De officiële FOD-download van AREI Boek 1 uit 2026 leverde bij raadpleging een verificatiepagina op. Volledige overeenstemming van dit oudere voorbeeld met de regelgeving van november 2026 is **niet vastgesteld**. Het voorbeeld is gebruikt als vakinhoudelijke tekenreferentie, niet als certificaat van actuele conformiteit. De projectcontext werd op bestaand deel gezet; overgangsbepalingen zijn niet inhoudelijk beoordeeld.

De bron bevat circa zestien eindkringen, een hoofddifferentieel, bijkomende differentieels, toestellen, verlichting, laadpunt en PV, met situatieplannen van twee verdiepingen. Uitgevoerd:

- Nieuw testaccount en afzonderlijke organisatie aangemaakt; bevestigingsmail via Mailpit geopend.
- Nederlands gekozen en een project met 3N × 400 V aangemaakt.
- Bronkring J: zeven contactdozen opgebouwd, C20 / 2P / 3 kA, XVB 3G2,5, achter een 63 A / 30 mA-differentieel. Elentrik noemt deze kring A.
- Een deel van bronkring G: twee aftakkingen opgebouwd, waaronder twee wisselschakelaars en meerdere lichtpunten; C16 / 2P / 3 kA, VOB 3G1,5. Elentrik noemt deze kring B. Lichtpuntaantallen en symbolen zijn geen volledig gevalideerde kopie van de bron.
- Wasmachinesjabloon toegevoegd als kring C, bedoeld om ook het toesteltraject te testen. De sjabloonwaarden zijn niet volledig gelijkgemaakt aan bronkring P: onder meer B20 versus C20 en 40 A versus 63 A voor de bijkomende differentieel.
- PDF-pagina 27 geïmporteerd. Alle vijftien plaatsbare modelonderdelen van deze deeltest op de achtergrond geplaatst: zeven contactdozen, zes licht-/schakelonderdelen, wasmachine en verdeelbord.
- Een PDF met vijf pagina's gemaakt, gedownload en visueel geïnspecteerd: eendraadschema, situatieplan, twee pagina's kringenlijst en bijlage.
- Pagina herladen: model en plaatsingen bleven bewaard; de app toont opnieuw “Alle punten staan op een plan”.

De bronachtergrond bevat zijn oorspronkelijke symbolen. Die zijn **niet** door Elentrik herkend of opnieuw getekend. De zichtbare woning is dus geen bewijs dat het volledige plan werd gereconstrueerd. Rotaties, alle overige kringen, een afzonderlijk getekende bouwkundige plattegrond, complete bedrijfsgegevens, A3 en een volledig keuringsklaar dossier vallen buiten het gerealiseerde resultaat.

## Bevestigde bevindingen

### P1 — Voedingsspanning ontbreekt zichtbaar in de PDF

Reproductie: nieuw project met stroomtype 3N × 400 V → eendraadschema exporteren. De projectdialoog bevestigt het geselecteerde stroomtype, maar op PDF-pagina 1 staat geen zichtbare aanduiding 3N × 400 V, noch bij de aansluiting, noch in de cartouche. Ook de geëxtraheerde PDF-tekst bevat geen 400 V.

ACA noemt op p. 26 spanning en aard van de stroom expliciet als schemagegevens. Voeg de gekozen netconfiguratie en spanning consequent toe aan schermtekening en export. Bewijs: `export-p1.png` en de deeltest-PDF.

### P1 — Bestaande kringletters zijn niet rechtstreeks over te nemen

Reproductie: eerste contactdozenkring toevoegen → automaateigenschappen → Label invullen als “J - Stopcontacten gelijkvloers”. De schematekening en het situatieplan blijven A en A1–A7 tonen. In de kringenlijst verschijnt J alleen als omschrijving naast kring A. In de onderzochte eigenschappen is geen afzonderlijke bewerkbare kringcode aangeboden.

Impact: vergelijken met een bestaande kast, labels en bronplannen wordt foutgevoelig. De automatische volgorde dwingt de invoervolgorde op en de bron gebruikt bovendien letters voor differentieels. Voorzie expliciete kringcodes, behoud van bestaande codes en gecontroleerd hernummeren, los van de omschrijving.

### P1 — Sjabloon kan een ongeldige plaats in de structuur krijgen

Reproductie: hoofddifferentieel selecteren → Onderdelen → Kring stopcontacten. De app voegt het sjabloon toe en meldt daarna zeven fouten, onder meer “De installatie heeft geen algemeen differentieel” en punten die niet achter een automaat of zekering in een verdeelbord hangen. Undo → verdeelbord selecteren → hetzelfde sjabloon levert nul elektrische fouten op.

Een elektricien mag verwachten dat zo'n sjabloon een geldige invoegplaats vraagt of gebruikt. Blokkeer een ongeldige bestemming vooraf en benoem waar de nieuwe kring terechtkomt. Een extra aandachtspunt: een verlichtingssjabloon voegde ook onder de al geselecteerde 30 mA-differentieel een nieuwe 30 mA-differentieel toe. Maak “bestaande differentieel gebruiken” expliciet. Bewijs: `01-sjabloon-fouten-zoom.png`.

### P1 — De importworkflow levert geen bruikbare schone overtekenondergrond

De PDF-import werkt en pagina 27 is selecteerbaar. De onderzochte dialoog neemt vervolgens de volledige pagina over: beide verdiepingen, de oude cartouches, bestaande symbolen en publicatiemarge. Er was geen zichtbare uitsnij-/opsplitsstap; ook het paginamenu bood geen bijsnijden.

De nieuwe symbolen overlappen de oude aanduidingen. De liggende A4-export verkleint de volledige staande bronpagina sterk en voegt daar een nieuwe cartouche aan toe. Het resultaat is lastig leesbaar. Dat is mede een eigenschap van deze bron, maar de app helpt de gebruiker niet om die geschikt te maken.

Voorzie bijsnijden per verdieping, draaien en een duidelijke workflow voor bestaande schema's versus lege bouwplannen. Een uitzetbare overtreklaag zou nuttig zijn, mits de gebruiker daarna werkelijk een eigen ondergrond heeft. Claim geen automatische verwijdering/herkenning van oude symbolen als die niet bestaat. Bewijs: `export-p2.png`.

### P1 — Leidingkenmerken uit de bron zijn niet volledig invoerbaar

De leidingeigenschappen bieden kabeltype, doorsnede, aantal geleiders, lengte en één plaatsingskeuze. Die keuze bevat Geen, Inbouw, Opbouw, In buis en In de grond. Ik vond geen afzonderlijk veld voor Eca/Cca en geen combinatie “in buis in de wand”, terwijl de bron brandreactieklasse en gecombineerde plaatsingsaanduidingen heeft.

Vrije tekst in “Kabeltype” kan mogelijk een deel opvangen, maar is geen onderzochte structurele oplossing. Voorzie brandreactieklasse en combineerbare plaatsingskenmerken, met controle op de uiteindelijke schematische weergave. Geen generieke uitspraak dat elke installatie dezelfde kabelklasse moet gebruiken.

### P2 — Puntplaatsing kost drie klikken en laat de ondergrond verspringen

De gevolgde klikroute is telkens: Onderdelen openen → punt kiezen → positie op het plan aanklikken. Bij het kiezen sluit het paneel; de beschikbare tekenruimte en de positie van de ondergrond wijzigen. Na de plaatsing is opnieuw openen nodig.

Voor zeven contactdozen is dat 21 klikken, exclusief draaien, zoomen en corrigeren. Dit is een telling van de uitgevoerde klikroute, geen snelheidsbenchmark. De app biedt ook drag-and-drop; die route is niet getest en kan sneller zijn.

Laat het paneel op desktop open en de viewport stabiel. Bied optioneel “volgend punt plaatsen” en filteren per kring/ruimte. De geteste lijst had geen zoekveld. Bewijs: `02-puntenlijst.png` en `03-herladen-alle-punten-geplaatst.png`.

### P2 — Schakelaar en lamp samen tekenen is onvoldoende direct

Via Nieuwe kring met schakelaar → Bestaande kring uitbreiden met lamp kreeg ik B1 en B2 op de verticale lijn. Voor één geschakelde aftakking met hetzelfde nummer moest ik de kringleiding selecteren, Onderdelen openen, Schakelaar kiezen, Aftakking toevoegen, Lichtpunt kiezen en via de zijwaartse plus doorgaan. De eerste poging heb ik via selectie en Delete hersteld.

De mogelijkheid bestaat dus, maar vraagt kennis van het interne structuurmodel. Bied herkenbare samenstellingen: enkelpolig + lamp, wisselschakeling, kruisschakeling en meerdere lichtpunten. Toon vooraf het te verwachten nummer en de aftakking.

### P2 — Componenten met hetzelfde nummer zijn lastig te onderscheiden

De zoeklijst toonde twee identieke opties “B2 · Schakelaar” en twee “B2 · Lichtpunt”. De situatiepuntenlijst onderscheidt types met kleine pictogrammen, maar de tekst is telkens B2; in “Punt op plan” staan eveneens meerdere B2-opties.

Dat nummer delen is elektrisch terecht. Geef daarnaast een onderscheidende omschrijving of volgnummer binnen de aftakking, bijvoorbeeld “B2 — wissel 1”, “B2 — wissel 2”, “B2 — TL”. Verander daarvoor niet de officiële puntreferentie.

### P2 — Ongeldige invoer wordt bij wegklikken stil teruggedraaid

Reproductie: nominale stroom 16 vervangen door -1. Tijdens invoer verschijnt “Ongeldige waarde”. Klik op Label: de waarde wordt weer 16 en de foutmelding verdwijnt. De bescherming tegen ongeldige data werkt, maar het verlies van de wijziging is onvoldoende duidelijk. Laat de fout staan of meld dat de vorige waarde is hersteld.

### P2 — Zoom en exportopmaak vragen extra herstelwerk

Een sjablooninvoeging sprong naar circa 296–301% zoom, met slechts een deel van de tekening zichtbaar. “Passend maken” bracht het overzicht terug. Houd bij toevoegen bij voorkeur de bestaande zoom vast, of pas alleen aan wanneer een nieuw onderdeel anders buiten beeld ligt.

De PDF heeft kleine schematekst en veel vrije ruimte. De lange testversie breekt vlak voor de laatste letter af, over twee regels. De kringenlijst herhaalt de lange kringomschrijving op elke rij, waardoor deze kleine deeltest twee tabelpagina's gebruikt. Dit zijn reproduceerbare opmaakeffecten van de gebruikte invoer, geen bewijs dat ieder dossier dezelfde ruimte verspilt.

## Positief

- Registratie, mailbevestiging en taalwissel werkten zonder blokkade.
- Zeven contactdozen waren snel op te bouwen vanuit een sjabloon; de extra contactdoos vroeg één plusklik.
- De elektrische structuur voedt beide schema's en de kringenlijst; plaatsbare punten verdwijnen uit de resterende lijst.
- Aftakkingen, wisselschakelaars, lichtsoorten, aantallen en toestelvarianten zijn aanwezig.
- Undo en automatisch bewaren werkten; herladen bevestigde persistentie.
- Export noemt ontbrekende plaatsingen en biedt dan een concept. Na plaatsing verdween die melding.
- De PDF en exportdialoog waarschuwen expliciet dat de automatische controle beperkt is en geen conformiteitsbewijs levert.

## Volgende verbeteringen

1. Eerst dossiergetrouwheid: voedingsgegevens in export, eigen kringcodes, complete leidingnotatie en veilige sjablooninvoeging.
2. Daarna tekenwerk versnellen: stabiele viewport, blijvende onderdelenlijst, doorlopende plaatsmodus en samengestelde lichtschakelingen.
3. Daarna import en drukwerk: uitsnijden/opsplitsen van plannen, duidelijke achtergrondworkflow en leesbare paginavulling.

Een vervolgtest moet het volledige bronvoorbeeld doorlopen, inclusief laadpunt, PV, alle overige kringen, meerdere echte planpagina's en alle rotaties. De symbolencatalogus bevatte onder andere Laadpaal en Omvormer; die mogen op basis van deze test niet als ontbrekend worden aangemerkt. Een afzonderlijk PV-paneel heb ik in de bekeken categorieën niet gevonden, maar niet met een volledige invoegproef onderzocht.

## Terugvinden en bewijs

- [Lokaal testproject](http://127.0.0.1:3000/projecten/8c4827ec-29d3-428b-a96b-c2256b71fc97)
- Account: `elektricien.review.20261105@example.test`; organisatie: `TEST - Elektricien AREI review`. De Orca-browser is ingelogd.
- [Test-PDF](../../out/review-2026-11-05/elentrik-deeltest.pdf)
- [Bewijsmap](../../out/review-2026-11-05/): bron-PDF, referentierenders, screenshots, geëxporteerde pagina's en eindstatus.

Aanvullend is een onafhankelijke broncodereview gedaan. Die voorspelde onder andere het sluiten van het puntenpaneel en het terugzetten van ongeldige invoer; beide zijn vervolgens live bevestigd. Een afzonderlijke statische Impeccable-scan van `apps/web/app` eindigde met exitcode 0 en `[]`. Die scan valideert geen bedieningsroutes of elektrische conformiteit. Geen mobiele test, formele toegankelijkheidsaudit, belastingstest of vergelijking met een erkende keuring uitgevoerd. De browserstoringen aan het begin waren problemen van de testverbinding en zijn niet als Elentrik-bugs meegeteld.
