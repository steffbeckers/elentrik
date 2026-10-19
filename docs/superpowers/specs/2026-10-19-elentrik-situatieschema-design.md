# Elentrik: situatieschema (ontwerp)

- **Datum:** 2026-10-19
- **Status:** ter review
- **Bouwt voort op:**
  - de MVP-spec `docs/superpowers/specs/2026-10-17-elentrik-mvp-design.md`, §4.3, §6.3 en §10 stap 6;
  - de editor-spec `docs/superpowers/specs/2026-10-18-elentrik-editor-design.md`;
  - de app `apps/web` en de pakketten `model`, `arei` en `symbols`.
- **Keuzes:** de gebruiker heeft de keuzes aan mij overgelaten ("ik volg je keuzes"). Alles in dit document is daarom **mijn keuze**, tenzij er staat dat het uit de MVP-spec komt of door de gebruiker beslist is.

## 1. Waarom en voor wie

Naast het eendraadschema moet de installateur voor de keuring een situatieschema afleveren. Dat is een plattegrond met elk punt op zijn plaats: contactdozen, lichtpunten, schakelaars, toestellen en het verdeelbord. Elk punt draagt hetzelfde label als in het eendraadschema, bijvoorbeeld "A3".

Vandaag tekent hij dat vaak opnieuw in een ander programma, of met de hand op een afdruk van het plan van de architect. Elentrik kent de punten al uit het eendraadschema. De installateur hoeft dus alleen nog elk punt op het plan te slepen. Het label volgt vanzelf, ook als hij later kringen of punten wijzigt.

**Volgorde (mijn keuze):** authenticatie (MVP §10 stap 5) wordt uitgesteld, omdat de gebruiker eerst lokaal werkt. Het situatieschema komt nu, en de PDF-export daarna. Zo bevat de eerste export meteen beide schema's.

## 2. Doelen, niet-doelen en anti-doelen

**Doelen:**
1. **Tabblad "Situatieschema" in de editor:**
   - Het werkt op hetzelfde document als het eendraadschema, met dezelfde store, undo/redo, autosave en bevindingen.
   - Het tabblad wordt actief; "Kringenlijst" blijft "binnenkort".
2. **Pagina's met een plan:**
   - Een plan is een PDF (waarvan de gebruiker één pagina kiest) of een afbeelding (PNG of JPG).
   - Er kunnen meerdere pagina's zijn, bijvoorbeeld één per verdieping.
   - Een pagina kan hernoemd en verwijderd worden.
3. **Punten plaatsen:**
   - De gebruiker sleept een niet-geplaatst punt uit de lijst op het plan, of kiest het en klikt op het plan.
   - Een geplaatst symbool kan verschoven worden, gedraaid in stappen van 15°, en van het plan gehaald.
4. **Live labels:** het label (kringletter en nummer) komt uit de analyse. Het verandert mee als het eendraadschema verandert.
5. **Schaal instellen:** optioneel. De gebruiker klikt twee punten aan en geeft de echte afstand in mm. Die schaal wordt bewaard. In deze stap toont Elentrik ze alleen, als "1 px = … mm".
6. **Lokale bestandsopslag:**
   - Originelen en rasterafbeeldingen staan op de lokale schijf, met een tabel `bestanden` in Postgres.
   - Ze zitten achter een kleine opslaginterface, zodat R2 er later in kan zonder de rest te wijzigen.

**Niet-doelen** (later):
- PDF-export (het volgende plan) en de kringenlijst;
- authenticatie, organisaties en R2;
- leidinglengtes berekenen uit de schaal;
- automatisch plaatsen, uitlijnen of snappen;
- plannen bijsnijden of draaien;
- zelf tekenen op het plan (muren, leidingtrajecten);
- weesbestanden opruimen. Een verwijderde pagina laat haar bestanden staan, zodat undo blijft werken.

**Anti-doelen** (dan is het mislukt, ook als het technisch werkt):
- **Een punt verdwijnt uit het eendraadschema** doordat de gebruiker het op het plan verwijdert. Delete op het plan haalt het punt alleen van het plan.
- **Een geüpload bestand kan code uitvoeren in de app.** Geen SVG of HTML als plan; het bestandstype wordt gecontroleerd op de inhoud, niet op de naam.
- **Een wazig plan bij afdruk:** een PDF-pagina wordt gerasterd op 300 dpi (MVP §6.3).
- **Hapering bij slepen** of bij zoomen op een groot plan.
- **Werk verliezen:** een plaatsing of een pagina is weg na herladen, of de undo herstelt ze niet.

## 3. Randvoorwaarden

- **Bestaande regels blijven:**
  - alleen lokaal: de server luistert op `127.0.0.1` en er is geen authenticatie;
  - eigen ontwikkeling: geen code, symbolen of teksten van andere software;
  - Conventional Commits, ondertekend, met de trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - Nuxt UI, Pinia en Drizzle; de pakketten blijven zonder I/O;
  - de vertaalteksten staan in `nl.json`.
- **Werkwijze (beslist door de gebruiker):** in de hoofdcheckout op een feature-branch, zonder worktree.
- **Bestandslimieten (MVP §6.3):**
  - een upload is maximaal 50 MB;
  - een PDF-pagina wordt in de browser met pdf.js gerasterd op 300 dpi, met een maximum van 8.000 px aan de lange zijde.
- **Nieuwe afhankelijkheid:** `pdfjs-dist`, alleen in de browser. Gebruik een exacte versie die minstens twee weken oud is.

## 4. Ontwerp

### 4.1 Model (`packages/model`)

Deze operaties bestaan al: `voegPaginaToe`, `zetAchtergrond`, `plaats` en `verwijderPlaatsing`.

Erbij komen deze pure operaties. Elk geeft patches en `DocumentFout`-codes, net als de bestaande:
- `hernoemPagina(doc, paginaId, titel)`. Een lege titel na trimmen geeft `ONGELDIG_SCHEMA`, de bestaande code voor een ongeldige waarde.
- `verwijderPagina(doc, paginaId)`. Hij verwijdert de pagina met haar plaatsingen; de punten zelf blijven bestaan.
- `zetSchaal(doc, paginaId, mmPerPx | undefined)`.
  - De waarde moet eindig en groter dan 0 zijn; anders volgt `ONGELDIG_SCHEMA`.
  - Een pagina zonder achtergrond geeft de nieuwe code `GEEN_ACHTERGROND`.
  - `undefined` wist de schaal.
- `verplaatsPagina(doc, paginaId, nieuweIndex)`. Hiermee ordent de gebruiker de verdiepingen.

`plaats` blijft zoals hij is: één plaatsing per node over alle pagina's heen.

### 4.2 Bestanden (`apps/web/server`)

- **Tabel `bestanden`:**
  - kolommen: `id` (uuid), `projectId` (verwijst naar `projecten`), `soort` (`plan-origineel` of `plan-raster`), `mime`, `grootte`, `sleutel` en `aangemaakt`;
  - er komt een Drizzle-migratie bij.
- **Opslaginterface `BestandOpslag`:**
  - methodes: `schrijf(sleutel, data)`, `lees(sleutel)` (een stream) en `bestaat(sleutel)`;
  - de lokale implementatie schrijft naar `ELENTRIK_BESTANDEN_DIR`, met als standaard `apps/web/.data/bestanden`; `.data/` komt in `.gitignore`;
  - de sleutel is altijd `<projectId>/<bestandId>`, opgebouwd door de server. Een bestandsnaam van de gebruiker komt nooit in een pad.
- **`POST /api/projecten/:id/bestanden`:**
  - multipart, met de velden `bestand` en `soort`;
  - onbekend project: 404;
  - groter dan 50 MB: 413;
  - het type wordt bepaald op **magic bytes**, niet op naam of header:
    - `plan-origineel` aanvaardt alleen PDF, PNG en JPEG;
    - `plan-raster` aanvaardt alleen PNG en JPEG;
    - al de rest geeft 415;
  - een rasterafbeelding groter dan 8.000 px aan de lange zijde geeft 422; de afmetingen worden uit de PNG- of JPEG-header gelezen;
  - het antwoord bevat `{ id, mime, grootte }`, plus `breedte_px` en `hoogte_px` voor een raster.
- **`GET /api/bestanden/:id`:**
  - streamt het bestand met de `Content-Type` uit de database;
  - headers: `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` en `Cache-Control: private, max-age=31536000, immutable`; bestanden zijn onveranderlijk;
  - onbekend id: 404.
- Een project verwijderen (soft delete) laat de bestanden staan. Opruimen hoort bij een latere stap.

### 4.3 Een plan toevoegen (client)

Flow: **Pagina toevoegen** → bestand kiezen (of slepen) → bij een PDF een pagina kiezen → uploaden → pagina aanmaken.

- **PDF:**
  1. pdf.js laadt het bestand in de browser en toont de pagina's als kleine voorbeelden.
  2. De gekozen pagina wordt gerenderd op 300 dpi. Zou de lange zijde dan boven 8.000 px komen, dan wordt de schaal verlaagd tot precies 8.000 px.
  3. Het resultaat wordt een PNG.
  4. Eerst gaat het origineel naar de server, dan de PNG.
- **Afbeelding:**
  - Is de lange zijde hoogstens 8.000 px, dan dient het originele bestand ook als raster: `rasterBestandId` is gelijk aan `origineelBestandId`.
  - Anders wordt een verkleinde PNG gemaakt en apart opgeladen.
- **Pas na een geslaagde upload** volgen `voegPaginaToe` en `zetAchtergrond`, samen als **één undo-stap**.
  - De titel is de bestandsnaam zonder extensie, met de PDF-pagina erbij (bijvoorbeeld "plan-gelijkvloers p2"), of anders "Pagina N".
  - Mislukt de upload, dan verandert er niets aan het document en krijgt de gebruiker een toast met de reden.
- Tijdens het renderen en uploaden is er een voortgangsindicator. De dialoog kan geannuleerd worden.

### 4.4 Het tabblad Situatieschema (scherm)

Dezelfde indeling als het eendraadschema:

- **Links: "Te plaatsen".**
  - De niet-geplaatste punten uit de analyse, gegroepeerd per kring (A, B, …), met symbool en label.
  - Het verdeelbord staat er ook in, want het is plaatsbaar. De analyse geeft alleen punten in `nietGeplaatst`; de niet-geplaatste verdeelborden leidt de client zelf af.
  - Is alles geplaatst, dan staat er "Alle punten staan op een plan".
- **Midden: het plan.**
  - Bovenaan staan de paginatabs, met "Pagina toevoegen" en een menu per pagina: hernoemen, schaal instellen, naar links of rechts, verwijderen.
  - Een SVG met `viewBox` in rasterpixels. Het plan is een `<image>` daarin, de symbolen staan erboven.
  - Zoomen met het muiswiel of met twee vingers. Pannen met slepen op een lege plek, of met de spatiebalk ingedrukt.
  - De knop "Passend maken" werkt zoals in het eendraadschema.
  - Een pagina zonder plan, of met een plan dat niet geladen kan worden, toont een melding met "Plan opnieuw kiezen". Dat vervangt de achtergrond en behoudt de plaatsingen.
- **Rechts:** het eigenschappenpaneel en de bevindingen, ongewijzigd. Klikken op een symbool selecteert de node in de store. De selectie wordt gedeeld met het eendraadschema.
- **Zonder pagina's:** toont het tabblad een lege toestand met "Plan toevoegen".

### 4.5 Symbolen en labels op het plan

- **Symbool:** een plaatsing tekent hetzelfde symbool als in het eendraadschema (`tekenSymbool`).
  - De grootte is vast per pagina: **de lange zijde van het raster gedeeld door 60** (in rasterpixels). Een plan van 8.000 px op A3 geeft zo een symbool van ongeveer 7 mm.
  - Het symbool draait rond zijn middelpunt.
  - `x` en `y` van een plaatsing zijn het middelpunt van het symbool, in rasterpixels.
- **Label:** het label staat rechts naast het symbool en draait **niet** mee, zodat het leesbaar blijft. Het komt live uit de analyse.
- **Markeringen:** een bevinding op een geplaatste node geeft dezelfde markering als in het eendraadschema.
- **Waar het getekend wordt:** de SVG-laag met symbolen en labels is een pure functie in `packages/render` (`situatieLaagSvg`). Zo kan de PDF-export ze later hergebruiken. Alle tekst gaat door `escapeXml`.

### 4.6 Bediening op het plan

- **Plaatsen:**
  - Sleep een punt uit "Te plaatsen" naar het plan; het punt komt op de plek waar je loslaat.
  - Of kies het punt in de lijst en klik op het plan. Zo werkt het ook met het toetsenbord en op een tablet.
  - Escape breekt het plaatsen af.
- **Verschuiven:** sleep het symbool. Tijdens het slepen toont Elentrik een lokale preview zonder documentoperatie. Bij het loslaten volgt één `plaats`, dus één undo-stap.
- **Draaien:**
  - R draait 15° met de klok mee, Shift+R 15° ertegen.
  - Er zijn ook knoppen in een kleine werkbalk bij de selectie.
- **Van het plan halen:** Delete of Backspace, of de knop "Van plan halen", roept `verwijderPlaatsing` aan. Het punt komt terug in "Te plaatsen" en blijft in het eendraadschema (anti-doel).
- **Pijltjes:** verschuiven het geselecteerde symbool 10 rasterpixels, met Shift 1 pixel. Elke toetsaanslag is een eigen undo-stap.
- **Al geplaatst op een andere pagina:** sleep je zo'n punt, dan verhuist het (zo werkt `plaats` al). Elentrik toont een toast "A3 verplaatst van Gelijkvloers naar Verdieping".
- **Dezelfde sneltoetsfilter als in het eendraadschema:** geen sneltoetsen in tekstvelden, widgets of open dialogen. Ctrl+Z en Ctrl+Y werken zoals in het eendraadschema.

### 4.7 Schaal instellen

- In het paginamenu kies je "Schaal instellen". Dan klik je twee punten op het plan aan; Elentrik toont een lijn ertussen.
- Daarna vul je de echte afstand in mm in. Die moet groter dan 0 zijn.
- Elentrik rekent `mmPerPx = afstand_mm / afstand_px` en roept `zetSchaal` aan.
- De pagina toont daarna "Schaal: 1 px = … mm", met de optie "Schaal wissen".

## 5. Kwaliteit en tests

- **Model:**
  - unittests per nieuwe operatie, elk met undo via inverse patches;
  - de property-based test van het model gaat ook pagina-operaties gebruiken.
- **Server:** API-tests met PGlite en een tijdelijke map:
  - 404, 413, 415 en 422;
  - magic bytes: een PNG-bestand met de naam `.pdf` wordt PNG, en een SVG wordt geweigerd;
  - een bestandsnaam met `../` heeft geen invloed op het pad;
  - de headers van `GET`.
- **Pure client-logica** (Vitest, met expliciete imports volgens ruling E1):
  - de omrekening van scherm naar plan en terug;
  - de draaistappen;
  - de symboolgrootte;
  - de rasterschaal: 300 dpi met een plafond van 8.000 px;
  - de magic-bytes-detectie;
  - het lezen van de PNG- en JPEG-header.
- **E2E (Playwright)**, met eigen gemaakte fixtures: een kleine PNG, en een PDF van 2 pagina's die door een script in de repo gegenereerd wordt, dus geen bestand van derden.
  - Upload een PNG en plaats een punt via slepen. Het label staat op het plan, en de info "nog niet geplaatst" voor dat punt verdwijnt.
  - Herlaad de pagina: de plaatsing staat er nog.
  - Ctrl+Z haalt de plaatsing weg.
  - Een PDF-upload met de keuze van pagina 2 levert een pagina met een raster.
  - Delete op het plan laat het punt in het eendraadschema staan.
- **Prestatie:**
  - 300 geplaatste symbolen op een raster van 8.000 px: slepen blijft vloeiend, zonder analyse per beweging;
  - een unittest meet dat de SVG-laag voor 300 plaatsingen onder 16 ms opgebouwd wordt.

## 6. Wat aan de bouwer overblijft

- de precieze componentnamen en de bestandsindeling binnen `apps/web/app/components/situatie/`;
- of het zoomen en pannen uit `SchemaCanvas.vue` als gedeelde composable herbruikt wordt (aanbevolen), of apart gebouwd;
- de vorm van de pagina-voorbeelden in de PDF-dialoog;
- hoe pdf.js zijn worker laadt in Nuxt, zolang het lokaal en zonder CDN werkt.
