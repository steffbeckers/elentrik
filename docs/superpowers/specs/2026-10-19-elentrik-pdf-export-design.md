# Elentrik: PDF-export (ontwerp)

- **Datum:** 2026-10-19
- **Status:** ter review
- **Bouwt voort op:**
  - de MVP-spec `docs/superpowers/specs/2026-10-17-elentrik-mvp-design.md` (§7, §4.5 en §10 stap 7);
  - de editor-spec en de situatieschema-spec;
  - de pakketten `model`, `arei`, `symbols`, `layout` en `render`, en de app `apps/web`.
- **Keuzes:** de gebruiker liet alle keuzes aan mij ("maak de keuzes zelf maar"). Alles hier is daarom **mijn keuze**, behalve wat uit de MVP-spec komt.

## 1. Waarom en voor wie

Voor de keuring levert de installateur een papieren of digitaal dossier af. Dat bevat:
- het eendraadschema;
- het situatieschema;
- een kringenlijst;
- de gegevens van klant, werf en installateur.

Elentrik heeft al die informatie. Deze stap zet ze met één klik om in een nette PDF met een cartouche op elke pagina. Een bijlage vermeldt de AREI-bevindingen en de gemotiveerde afwijkingen, zodat niets verborgen blijft.

## 2. Doelen, niet-doelen en anti-doelen

**Doelen:**
1. **Eén knop "Exporteren"** in de bovenbalk opent een dialoog met deze keuzes:
   - de onderdelen: eendraadschema, situatieschema, kringenlijst en bijlage;
   - het papierformaat, A4 of A3;
   - een versielabel.
   Het resultaat is één PDF die de gebruiker downloadt.
2. **Een cartouche op elke pagina**, met:
   - klant en werfadres;
   - installateur, met logo;
   - EAN;
   - datum, versie en paginanummer "N / M";
   - twee lege handtekeningvakken (installateur en keurder);
   - de titel van de pagina.
3. **Eendraadschema:** de pagina's uit `layout`, zoals ze nu al gepagineerd worden.
4. **Situatieschema:** één PDF-pagina per situatiepagina. Het plan past binnen de bruikbare ruimte, met behoud van verhouding, en de symbolen en labels staan erop als SVG-laag.
5. **Kringenlijst:** een tabel met per punt deze kolommen:
   - kring, punt en type (bij een toestel ook de soort);
   - ruimte;
   - beveiliging, zoals "16 A B";
   - differentieel stroomopwaarts, zoals "30 mA type A";
   - leiding, zoals "XVB 3G2,5".
   De tabel loopt door over zoveel pagina's als nodig.
6. **Bijlage:** de bevindingen per ernst (fout, waarschuwing, info) met hun tekst, en de afgeweken bevindingen met motivatie, auteur en datum.
7. **Bedrijfsgegevens:** een instellingenpagina met naam, adres, ondernemingsnummer, telefoon, e-mail en logo van de installateur. De cartouche gebruikt die gegevens.
8. **Projectgegevens uitbreiden:** het adres van de klant, het werfadres, de EAN en de datum worden bewerkbaar in de bestaande dialoog.
9. **Tabblad Kringenlijst:** de "binnenkort"-tab wordt actief en toont dezelfde tabel als de PDF, alleen-lezen. Een klik op een rij selecteert de node.
10. **Eerdere exports** zijn opnieuw te downloaden vanuit de exportdialoog.

**Niet-doelen** (later):
- authenticatie;
- Franse PDF (de taalparameter bestaat wel, alleen `nl` heeft teksten);
- digitale handtekeningen;
- R2;
- een voorblad of inhoudstafel;
- een legende van de symbolen;
- de PDF in de browser voorbekijken (hij wordt gedownload).

**Anti-doelen:**
- **Een PDF die er schoon uitziet terwijl er onopgeloste fouten zijn.** Zijn er fouten die niet afgeweken zijn, dan vraagt Elentrik eerst een bevestiging. De bijlage komt dan **verplicht** mee, met die fouten erin.
- **Een PDF van een andere versie dan op het scherm.** De export gebruikt altijd het opgeslagen document. Daarom slaat de client eerst op (autosave-flush), en de server bewaart een snapshot bij de export.
- **Afgekapte of overlappende tekst in de cartouche of de tabel.** Lange teksten worden afgebroken met "…". Ze lopen nooit over een rand.
- **Een stille fout.** Is Gotenberg niet bereikbaar of te traag, dan krijgt de gebruiker een leesbare melding. Elentrik maakt nooit een lege of halve PDF.

## 3. Randvoorwaarden

- Alleen lokaal, zonder authenticatie. De server en alle diensten luisteren op `127.0.0.1`.
- Eigen ontwikkeling: geen code, symbolen of teksten van andere software.
- Commits zijn ondertekend en eindigen met de trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Werkwijze: de hoofdcheckout op een feature-branch, zonder worktree.
- De pakketten blijven zonder I/O. `render` levert de HTML als pure functie.
- **Omzetting (MVP §7):** Gotenberg 8 als Docker-container in `infra/docker-compose.yml`.
  - Hij luistert op `127.0.0.1:3001`, met een exacte image-tag.
  - De timeout is 60 s, met één nieuwe poging.
  - Mislukt het, dan antwoordt de server met 502 en een leesbare fout. De fout wordt gelogd met het project en het snapshot.

## 4. Ontwerp

### 4.1 Render: `printHtml` (`packages/render`)

`printHtml(doc, analyse, bevindingen, opties): { html: string; paginas: number }`, waarbij `opties` bestaat uit:
- `papier: "A4" | "A3"`;
- `onderdelen: { eendraadschema; situatieschema; kringenlijst; bijlage }`;
- `versieLabel`;
- `datum`;
- `taal: "nl"`;
- `installateur: Partij`;
- `afbeeldingen: Record<bestandId, bestandsnaam>`.

**Paginering:**
- Elke pagina is een `<section class="pagina">` met een vaste maat in mm, liggend, en `break-after: page`.
- `paginas` is het totale aantal; elke cartouche toont "N / M".
- Elentrik pagineert zelf, deterministisch. Er zijn geen CSS-paginateller en geen afhankelijkheid van hoe Chromium afbreekt.

**De onderdelen, in vaste volgorde:**
1. **Eendraadschema:** `schemaPaginaSvg(opmaak, i)` per pagina, met het papier uit de opties.
2. **Situatieschema:**
   - Per situatiepagina met achtergrond komt er een `<img src="<bestandsnaam>">`, geschaald binnen de bruikbare ruimte.
   - Daarop ligt een `<svg viewBox="0 0 b h">` met `situatieLaagSvg`, met hetzelfde kader. Het raakvlak blijft onzichtbaar.
   - Een pagina zonder achtergrond wordt overgeslagen. De bijlage vermeldt ze dan.
3. **Kringenlijst:**
   - Een vaste rijhoogte van 6 mm en een vaste kolombreedte.
   - Tekst die niet past, wordt afgekort met "…". De breedte wordt geschat met `tekstBreedte` uit `layout`.
   - De kop wordt op elke pagina herhaald.
4. **Bijlage:**
   - Items met een geschatte hoogte op basis van het aantal regels, eveneens met `tekstBreedte`.
   - Lange motivaties lopen over meerdere regels, nooit over de rand.

**Cartouche:**
- Een strook van `cartoucheHoogte_mm` (30 mm) onderaan, binnen de marge.
- Vakken voor: logo en installateur, klant, werfadres en EAN, de paginatitel (bijvoorbeeld "Situatieschema — Gelijkvloers"), datum en versie, "N / M", en twee handtekeningvakken.
- Elke tekst gaat door `escapeXml`. Een tekst die te lang is, wordt afgekort met "…".

**Overige punten:**
- **Teksten:** een woordenboek `teksten/nl.ts` in `render`. De bevindingen gebruiken `formatteerBericht(b, "nl")`.
- **Opkuis uit plan 4:**
  - de schaal in `situatieLaagSvg` wordt met 4 decimalen geschreven in plaats van 2;
  - er komt een escapetest voor `nodeId` in het attribuut.
- **De kringenlijstrijen** zijn een aparte pure functie, `kringenlijst(doc, analyse): KringenlijstRij[]`, in `render`. Ze wordt hergebruikt door het tabblad in de editor.

### 4.2 Model

`wijzigProject` krijgt er velden bij, die net als nu elk optioneel zijn en samen één undo-stap vormen:
- `klantAdres`;
- `werfadres`;
- `ean`;
- `datum`.

Ze worden gevalideerd met de bestaande Zod-schema's.

### 4.3 Server

- **Nieuwe tabellen:**
  - `bedrijfsinstellingen`: één rij met `id = 1`, `installateur` (jsonb, een `Partij`) en `gewijzigd`.
  - `snapshots` (MVP §4.5): `id`, `projectId`, `versie`, `document` (jsonb), `reden` (`export`) en `aangemaakt`.
  - `exports` (MVP §4.5): `id`, `projectId`, `snapshotId`, `bestandId`, `versieLabel`, `papier`, `onderdelen` (jsonb), `aantalFouten`, `aantalWaarschuwingen` en `aangemaakt`.
- **`bestanden`:**
  - `projectId` wordt nullable;
  - `soort` krijgt de waarden `logo` en `export` erbij. Een logo hoort bij geen project en is PNG of JPEG van hoogstens 2 MB.
- **API:**
  - `GET /api/bedrijfsgegevens` en `PUT /api/bedrijfsgegevens`, met Zod-validatie.
  - `POST /api/bedrijfsgegevens/logo`.
  - `POST /api/projecten/:id/exports`, met als invoer `{ onderdelen, papier, versieLabel }` en de header `If-Match: <versie>`, de versie die de client toont.
    - Zonder header volgt 428.
    - Verschilt de versie van de opgeslagen versie, dan volgt 409 met de huidige versie, zoals bij het opslaan. Er wordt dan niets bewaard en de client toont de conflictdialoog.

    Daarna doet de server het volgende:
    1. laadt het opgeslagen document en de bedrijfsgegevens;
    2. maakt een snapshot;
    3. draait `analyseer` en `controleer`;
    4. maakt de HTML met `printHtml`;
    5. leest de gebruikte rasters en het logo uit de opslag;
    6. stuurt alles naar Gotenberg;
    7. bewaart de PDF als `bestand` (soort `export`) plus een rij `exports`;
    8. antwoordt met `{ exportId, bestandId, aantalFouten, aantalWaarschuwingen }`.
    De bijlage wordt server-side verplicht zodra er onopgeloste fouten zijn.
  - `GET /api/projecten/:id/exports` geeft de lijst, de nieuwste eerst.
  - `GET /api/bestanden/:id` voor `soort = export` antwoordt met `Content-Disposition: attachment; filename="<project> - <versie>.pdf"`. De bestandsnaam wordt gesaneerd en ook als RFC 5987 `filename*` meegegeven. Zo blokkeert de CSP-sandbox de download niet.
- **Gotenberg-client** (`server/pdf/gotenberg.ts`):
  - een `fetch` naar `/forms/chromium/convert/html` met `index.html` en de afbeeldingen als bestanden;
  - `paperWidth`/`paperHeight` in inch, marges 0 en `printBackground`;
  - een injecteerbare `fetch`, zodat hij testbaar is;
  - een `AbortSignal`-timeout van 60 s en één nieuwe poging bij een netwerkfout of 5xx;
  - de URL komt uit `ELENTRIK_GOTENBERG_URL`, standaard `http://127.0.0.1:3001`.

### 4.4 Client

- **Bedrijfsgegevens:** een pagina `/instellingen`, met een link vanuit de projectenlijst. Ze bevat een formulier en een logo-upload met voorbeeld.
- **Projectgegevens:** de bestaande dialoog krijgt secties voor klant en werf.
- **Exportdialoog:**
  1. Bij het openen gebeurt eerst `autosave.nuOpslaan()`. Lukt dat niet (conflict of fout), dan kan de gebruiker niet exporteren en ziet hij de reden.
  2. Zijn er onopgeloste fouten, dan vraagt Elentrik een bevestiging met het aantal. De bijlage is dan aangevinkt en uitgeschakeld, met uitleg.
  3. Het versielabel is standaard "V{n+1}", met n het aantal eerdere exports. Kan de lijst niet geladen worden, dan blijft het label leeg en moet de gebruiker het zelf invullen.
  4. Tijdens het exporteren is er een voortgangsindicator. Daarna start de download automatisch, en de lijst met eerdere exports wordt bijgewerkt.
- **Tabblad Kringenlijst:**
  - een tabel uit `kringenlijst()`, met dezelfde kolommen;
  - een klik selecteert de node, en de bevindingen blijven rechts staan.

## 5. Kwaliteit en tests

- **Render:**
  - snapshottests van `printHtml` voor de drie referentie-installaties, ook met situatiepagina's;
  - geldige XHTML-fragmenten;
  - escapetests voor de cartouche en voor bevindingen;
  - paginering: een kringenlijst van 120 rijen geeft het juiste aantal pagina's, en elke pagina toont "N / M";
  - afkorten met "…";
  - een prestatietest: `printHtml` voor 2.000 nodes in minder dan 200 ms.
- **Model:** de uitgebreide `wijzigProject`, met undo.
- **Server:**
  - de Gotenberg-client tegen een nep-`fetch`: succes, een timeout met één nieuwe poging, en 5xx of een netwerkfout die 502 geeft;
  - de exports-repo met PGlite: snapshot, export, bestand, en de verplichte bijlage bij fouten;
  - de bedrijfsgegevens-API;
  - de download-header met een gesaneerde bestandsnaam.
- **E2E** (Gotenberg draait via docker-compose):
  - bedrijfsgegevens invullen;
  - een project met kring, contactdozen en een plan exporteren;
  - de PDF downloaden en nagaan dat hij begint met `%PDF-` en het verwachte aantal pagina's heeft (pdfjs-dist in Node);
  - een tweede export staat in de lijst met "V2";
  - bij onopgeloste fouten: de bevestiging, en de bijlage verplicht.

## 6. Wat aan de bouwer overblijft

- de precieze vakindeling en lettergroottes van de cartouche, zolang alles past en leesbaar is (minstens 2,5 mm tekst);
- de kolombreedtes van de kringenlijst;
- de opmaak van de instellingenpagina.
