# Backlog: functies uit het marktonderzoek van november 2026

Op 7 november 2026 zijn vergelijkbare Belgische tools voor eendraadschema's en situatieplannen bekeken. Dit document zet de bruikbare ideeën om in Elentrik-backlogpunten, in eigen woorden. Het bevat geen code, symbolen, teksten of schermontwerpen van andere software (clean room). Elke functie wordt vanaf nul ontworpen volgens de gewone werkwijze: brainstorm, spec, plan.

Elk punt vermeldt wat de installateur eraan heeft, wat Elentrik vandaag al heeft, een ruwe omvang (S, M, L of XL) en open vragen.

## Wat Elentrik al onderscheidt

Deze punten blijven behouden en kunnen in de communicatie in de verf gezet worden:

- automatische opmaak van het eendraadschema vanuit de elektrische structuur;
- live AREI-bevindingen en gemotiveerde afwijkingen (voorlopige regelset, geen conformiteitsattest);
- sjablonen voor kringen;
- meetresultaten in het dossier, zoals de testtabel voor differentieelschakelaars;
- een materiaallijst met kabel- en geleidermeters op basis van tracélengtes;
- organisaties met de rollen eigenaar en lid;
- het importeren van een plan uit PDF of afbeelding, met uitsneden per verdieping, kalibratie en afdekking van oude symbolen.

## Hoge prioriteit: klein, en van nut bij elk dossier

### 1. Openbare leeslink per project — M

- **Nut:** de keurder, de klant of een collega bekijkt het dossier zonder account en kan het afdrukken of als PDF downloaden. Er hoeven geen bijlagen meer gemaild te worden.
- **Vandaag:** geen mogelijkheid om een project te delen buiten de organisatie.
- **Open vragen:**
  - Kan een link intrekken en verlopen?
  - Geldt hij voor een vaste versie of voor de laatste stand?
  - Krijgt de lezer de keuze van secties en papierformaat?
  - Hoe beperken we misbruik (rate limiting, links die niet te raden zijn)?
  - Hoe gaan we om met privacy, aangezien klantgegevens in het dossier staan?

### 2. Keuringsorganisme in de projectgegevens — S

- **Nut:** het dossier vermeldt voor welk keuringsorganisme het bestemd is. Samen met de installateur, de installatie, de EAN-code en de versie komt het in de kop- of voettekst van elke PDF-pagina.
- **Vandaag:** EAN-code en ondernemingsnummer bestaan al; het keuringsorganisme ontbreekt.
- **Open vragen:**
  - Een vaste lijst van erkende organismen of vrije invoer?
  - Wie houdt die lijst actueel?

### 3. Bedrijfsgegevens invullen via het ondernemingsnummer — S/M

- **Nut:** minder typwerk voor de klant, de installateur en het keuringsorganisme.
- **Open vragen:**
  - Welke bron gebruiken we (open data van de KBO of een betaalde API)?
  - Wat zijn de licentievoorwaarden?
  - Werkt het ook als de bron offline is? Handmatige invoer moet altijd mogelijk blijven.

### 4. Fase per kring — S

- **Nut:** bij driefasige installaties toont de kringenlijst over welke fase (L1, L2 of L3) elke kring loopt.
- **Open vragen:**
  - Volstaat informatieve invoer, of moeten er ook bevindingen volgen, zoals een waarschuwing bij ongelijke belasting? Dat laatste is pas later aan de orde.

### 5. Ongeplaatste punten zichtbaarder maken — S/M

- **Nut:** de installateur ziet meteen hoeveel punten nog niet op het situatieplan staan. Een filter in de lijst met punten (alle, geplaatst, niet geplaatst) brengt hem er rechtstreeks naartoe.
- **Vandaag:** dit verschijnt als info-bevinding en in de dossierchecklist, maar niet als teller of filter in de editor.

### 6. Exportopties per kring — M

- **Nut:**
  - Lange schema's worden beter leesbaar als de installateur zelf kiest waar een nieuwe pagina begint.
  - Per kring kan hij kiezen of die liggend of staand wordt afgedrukt.
  - Hij kiest ook of kringnamen en subkringnamen op het schema komen.
- **Open vragen:** hoe verhoudt dit zich tot de automatische opmaak? Een handmatige paginagrens mag de opmaak niet stilzwijgend breken.

### 7. Gratis onderwijsaccount — S/M

- **Nut:** studenten en scholen leren werken met Elentrik. Exports krijgen een duidelijk watermerk en zijn niet bruikbaar als officieel dossier.
- **Open vragen:**
  - Hoe verifiëren we dat iemand student of leerkracht is?
  - Hoe past dit in de Stripe-abonnementen en de organisatiestructuur?

## Middelgrote prioriteit

### 8. Een bestaand eendraadschema importeren uit foto, scan of PDF — XL (strategisch)

- **Nut:** bij herkeuring, renovatie, uitbreiding en woningverkoop bestaat het schema meestal al op papier. Wie het niet opnieuw moet tekenen, wint veel tijd. Ook syndici, scholen en technische diensten met veel papieren borden hebben er baat bij. Dit is mogelijk het sterkste argument voor nieuwe gebruikers.
- **Vereisten voor bruikbaarheid:**
  - **Controle-stap:** elk onzeker symbool en elke onzekere verbinding verschijnt als na te kijken punt, met een verwijzing naar de plaats in de bron. Dit sluit aan op de bestaande bevindingen.
  - **Verwerking op de achtergrond:** de gebruiker hoeft niet te wachten en krijgt een melding als de omzetting klaar is.
  - **Meerdere pagina's in één bestand:** inclusief verbindingen die over pagina's heen lopen.
  - **Twee ingangen:** een nieuw project vanuit een scan, of een extra bord toevoegen aan een bestaand project.
  - **Eerlijke communicatie over de grenzen:** het resultaat is een vertrekpunt en geen nagekeken schema. Fotografietips verbeteren het resultaat.
- **Open vragen:**
  - Welke herkenningsaanpak: een eigen model, een LLM met beeldinvoer of een combinatie?
  - Hoe zit het met de privacy van geüploade klantdocumenten?
  - Wat kost een import, en is hij gratis of betalend?
  - Hoe testen we de herkenning, met welke set voorbeeldschema's die we mogen gebruiken?
- **Voorstel:** eerst een haalbaarheidsonderzoek (spike) op een tiental eigen of vrij bruikbare schema's.

### 9. Het plan van de architect opkuisen — L

- **Nut:** een druk plan van de architect wordt een rustige achtergrond. Muren, deuren, ramen en trappen blijven; meubels, maatlijnen en tekst verdwijnen. Het origineel blijft bewaard en kan teruggezet worden.
- **Vandaag:** handmatige afdekking van stukken is mogelijk. Dit is de automatische volgende stap.

### 10. Het plan van de architect omzetten naar bewerkbare muren — XL

- **Nut:** de geïmporteerde plattegrond wordt bewerkbaar in de OpenPlan3D-editor.
- **Voorstel:** pas aanpakken na punt 9, met dezelfde controle-stap als bij punt 8.

### 11. Projectbestanden van de bekendste desktoptool importeren — L

- **Nut:** maakt overstappen van de bekendste desktoptool veel makkelijker. Verschillende webtools bieden dit al aan.
- **Vandaag:** dit valt bewust buiten de MVP-scope ("competitor project import"). De beslissing moet dus expliciet herzien worden.
- **Open vragen:**
  - Is het bestandsformaat juridisch vrij te lezen?
  - Is er openbare documentatie, of moeten we het formaat uit zelf gemaakte voorbeelden afleiden? Dat laatste mag alleen binnen de clean-roomregels.

### 12. Splitscherm met schema en plan — M

- **Nut:** een punt selecteren in het schema markeert het ook op het plan, en omgekeerd. Je kan van verdieping wisselen in het plan. Koppelen en nakijken gaat zo veel sneller, vooral samen met punt 5.

### 13. Eerst plannen en later koppelen — M

- **Nut:** sommige installateurs beginnen bij het plan. Ze plaatsen eerst losse punten en koppelen die later aan een kring in het schema.
- **Open vragen:** past dit in het model, waar het schema vandaag de bron is voor de plaatsing?

### 14. Noodstroom en back-up als sjabloon — S/M

- **Nut:** met één sjabloon voeg je een hybride omvormer, een omschakelaar (ATS) en een back-upbord in.
- **Vandaag:** het sjablonensysteem en de omvormer bestaan al. Nog na te gaan: zijn het omschakelaarsymbool en het back-upbord beschikbaar volgens de AREI-referentie?

### 15. Hulp bij het tekenen van plannen — S

Ideeën om na te gaan in de OpenPlan3D-editor:

- een bijna rechte muur rechttrekken met één actie;
- hoeken laten snappen naar 0° of 90° binnen enkele graden;
- een achtergrondafbeelding vergrendelen.

## Lage prioriteit of later

- **Domotica:** een adres per component (verstuurt naar of ontvangt van) en een overzicht van in- en uitgangen. KNX- en Niko-symbolen moeten eerst in de symboolreferentie.
- **Blad met uitwendige invloeden:** alleen nodig als Elentrik ook niet-huishoudelijke installaties ondersteunt.
- **Leesbare API en MCP-koppeling:** per organisatie, met afgebakende rechten en tokens die kunnen verlopen.
- **Koppeling met CRM-systemen:** op aanvraag.
- **Offline werken met synchronisatie:** valt vandaag bewust buiten de MVP. Lokaal conceptherstel bestaat al.

## Prijsmodel om te overwegen

Te bespreken bij het afstellen van de Stripe-abonnementen. Er zijn nog geen prijzen vastgelegd.

- Gratis tekenen en betalen bij de export, per project of met een abonnement.
- Na betaling blijft een project bewerkbaar en kan het opnieuw geëxporteerd worden.
- Na het einde van een abonnement blijven projecten en eerdere PDF's beschikbaar.
- Een abonnement zonder automatische verlenging, als keuze naast verlenging.
- Een gratis start voor bedrijven die jonger zijn dan een jaar.

De proefperiode en een mogelijke gratis versie zijn verder uitgewerkt in `2026-11-07-proefperiode-en-gratis-versie.md`.

## Voorgestelde volgorde

1. Een eerste plan met de punten 2, 3, 4 en 5: kleine aanvullingen op de projectgegevens en de editor.
2. Punt 1, de leeslink, met een eigen spec voor privacy en beveiliging.
3. Beslissingen nemen over punt 11 (import uit de desktoptool) en over het prijsmodel.
4. Een haalbaarheidsonderzoek voor punt 8 (schema-import), en afhankelijk van het resultaat de punten 9 en 10.
