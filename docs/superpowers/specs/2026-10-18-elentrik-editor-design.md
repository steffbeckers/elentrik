# Elentrik: editor voor het eendraadschema (ontwerp)

- **Datum:** 2026-10-18
- **Status:** ter review
- **Bouwt voort op:** de MVP-spec `docs/superpowers/specs/2026-10-17-elentrik-mvp-design.md` (§6.1, §6.2, §6.4, §10 stap 4) en de pakketten `@elentrik/model`, `arei`, `symbols`, `layout` en `render`.

## 1. Waarom en voor wie

De installateur moet een eendraadschema sneller kunnen tekenen dan in zijn huidige desktopsoftware, met de AREI-controle die live meekijkt. Deze stap levert de editor op. Die moet zo werken als installateurs vandaag al denken en tekenen.

**Hoe de installateur werkt** (uit het gesprek):
- **Volgorde:** hij tekent van de voeding naar de kringen. Eerst de binnenkomende lijn, dan de opsplitsing naar de differentiëlen, dan de automaten per kring, en pas daarna de punten van elke kring.
- **Richting op het blad:** het schema **groeit van onder naar boven**. De voeding en het bord staan onderaan, en elke kring stijgt als een verticale lijn. Het laatste punt van een kring staat bovenaan. De kringletters staan net boven de rail.
- **Punten toevoegen:** hij kiest een onderdeel en klikt op het uiteinde van een kring. Het onderdeel komt er dan bovenop. Punt per punt toevoegen kost de meeste tijd, maar gaat zo toch vlot.
- **Nieuwe kring:** die voegt hij toe via de rail. Elentrik zet er meteen een automaat en een leiding met standaardwaarden op. Sjablonen zijn handig, maar komen bovenop de gewone manier.
- **Nieuw project:** daar staan de binnenkomende lijn, de teller en een algemeen differentieel al klaar.
- **Eigenschappen:** hij past ze zelden aan, maar elke eigenschap van elk onderdeel moet aanpasbaar zijn.
- **Undo/redo** is belangrijk.

## 2. Doelen, niet-doelen en anti-doelen

**Doelen van deze stap:**
1. **Projectenlijst:** een project aanmaken, openen, dupliceren en verwijderen.
2. **Editor voor het eendraadschema:** het schema groeit naar boven, met een palet "Onderdelen", +-knoppen op het einde van kringen en rails, een eigenschappenpaneel, en undo/redo.
3. **AREI-bevindingen live:** een lijst in het rechterpaneel en een markering op het symbool. Een bevinding kan met een motivatie afgeweken worden.
4. **Automatisch opslaan** in Postgres, met een lokaal concept in de browser en een veilige afhandeling als twee vensters tegelijk opslaan.

**Niet-doelen** (komen in latere stappen):
- inloggen, organisaties en abonnementen;
- het situatieschema en de kringenlijst (de tabbladen zijn er wel, maar uitgeschakeld met "binnenkort");
- PDF-export;
- Franse vertaling (de vertaalinfrastructuur is er, alleen met Nederlands);
- slepen om kringen of takken te verplaatsen.

**Anti-doelen** (dan is het mislukt, ook als het technisch werkt):
- symbolen vrij verslepen zoals in een tekenprogramma: de layout bepaalt de posities, de gebruiker alleen de structuur (spec §6.2);
- werk verliezen: na een herstart van de browser, of als twee vensters tegelijk opslaan;
- trage reacties: na een toevoeging of wijziging moet het schema binnen 100 ms bijgewerkt zijn, ook bij 2.000 nodes;
- AREI-fouten die de gebruiker kan missen;
- per ongeluk een hele tak verwijderen terwijl de gebruiker één punt bedoelde.

## 3. Randvoorwaarden

- **Techniek:**
  - **Gebruiker:** Nuxt 4 met **Nuxt UI** en Tailwind.
  - **Spec, als Elentrik-standaard:** Pinia, Drizzle, PostgreSQL 16, Vitest en Playwright.
  - **Mijn keuze:** lokaal draait Postgres via `infra/docker-compose.yml`. Docker is aanwezig.
- **Monorepo:** de app komt in `apps/web` en gebruikt de pakketten via `workspace:*`. De pakketten blijven zonder I/O.
- **Eigen ontwikkeling:** geen code, symbolen of teksten van andere software.
- **Commits:** ondertekend, Conventional Commits, met de trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Gitignore:** `.superpowers/` gaat in `.gitignore`. Dat is nu nog niet zo.
- **Alleen lokaal** (beslist door de gebruiker): deze versie draait alleen lokaal en is nergens online bereikbaar.
  - Er is geen authenticatie.
  - De dev-server en Postgres luisteren alleen op `127.0.0.1`.
  - Online zetten kan pas na de stap met inloggen en organisaties.

## 4. Wat al beslist is

### 4.1 Richting van het schema: naar boven

Het schema groeit **alleen nog naar boven**. De neerwaartse richting uit plan 2 verdwijnt, omdat niemand anders zo tekent. De print groeit dan ook naar boven.

**Wat de layout doet:**
- De root `aansluiting` staat onderaan in de strook.
- Elk kind staat boven zijn ouder.
- Een rail ligt boven de node die vertakt, en de kinderen staan daarboven.
- Kringletters staan tussen de rail en de beveiliging, dus net boven de rail.
- De paginering blijft horizontaal knippen zoals nu.

**Wat de symbolen doen:**
- `in` (de kant van de voeding) ligt **onderaan** in het midden, `uit` **bovenaan** in het midden.
- De vormen worden verticaal gespiegeld tegenover nu.
- Tekst in een symbool blijft rechtop en leesbaar: `kWh`, `ΔI`, de afkortingen van toestellen, `3×` en `LED`.
- De controles op het aansluitbereik en op "binnen het vak" blijven gelden, met de nieuwe ligging van `in` en `uit`.

**Snapshots:** die worden opnieuw opgenomen, en de controller bekijkt de schema's opnieuw visueel.

### 4.2 Scherm

Er zijn twee pagina's: een **projectenlijst** (`/`) en de **editor** (`/projecten/[id]`).

**Projectenlijst:**
- een tabel met naam, klant en laatst gewijzigd;
- de knoppen "Nieuw project", "Openen", "Dupliceren" en "Verwijderen", met een bevestiging bij verwijderen;
- "Nieuw project" vraagt naam, klant en stroomtype.

**De editor** is ingedeeld als variant A (palet links), die de gebruiker koos:
- **Bovenbalk:**
  - de projectnaam, klikbaar om naam, klant en stroomtype aan te passen;
  - de tabbladen *Eendraadschema* (actief), *Situatieschema* en *Kringenlijst* (die laatste twee uitgeschakeld, met "binnenkort");
  - de opslagstatus: "Opgeslagen", "Bezig met opslaan…" of "Niet opgeslagen: lokaal bewaard";
  - een teller met fouten en waarschuwingen, die het paneel Bevindingen opent;
  - de knoppen Ongedaan maken en Opnieuw.
- **Links, het paneel "Onderdelen":**
  - **De lijst met onderdelen:**

    | Onderdeel | Sneltoets |
    |---|---|
    | Contactdoos | C |
    | Lichtpunt | L |
    | Schakelaar | S |
    | Toestel (met keuze van de soort) | T |
    | Leiding | — |
    | Differentieel | D |
    | Zekering | Z |
    | Onderbord | B |

    - Er is altijd precies één onderdeel geselecteerd. Bij de start is dat Contactdoos.
  - **Sjablonen:** daaronder het blok "Sjablonen", met *Kring stopcontacten*, *Kring verlichting*, *Kookplaat*, *Wasmachine* en *Badkamer*.
- **Midden, het canvas:**
  - Het canvas toont het schema als één strook op een lichte "papier"-achtergrond, ook in dark mode.
  - Zoomen gaat met het muiswiel, en pannen door te slepen op een lege plek of met de spatie ingedrukt. Er is een knop "Passend maken".
- **Rechts:**
  - het paneel **Eigenschappen** van de selectie;
  - daaronder **Bevindingen**.

### 4.3 Toevoegen met de +-knoppen

Er zijn twee soorten +-knoppen. Ze staan **alleen** waar het geselecteerde onderdeel volgens het model mag komen (`TOEGELATEN_KINDEREN`), met de uitzonderingen hieronder.

**+ op het einde van een kring:** die staat op elk blad van de kring, dus elke node zonder kinderen.
- **Punt** (contactdoos, lichtpunt, schakelaar, toestel): het punt komt bovenop dat blad.
- **Leiding:** de leiding komt bovenop het blad.
- **Onderbord:** in één stap komen er een leiding en een verdeelbord bij, als dat nodig is. Het onderbord krijgt daarna zijn eigen rail met een +.

**+ op het einde van een rail:** die staat op elk verdeelbord, en op elk differentieel dat kringen voedt.
- **Differentieel** geselecteerd: er komt een differentieel van 30 mA type A, 2 polen en 40 A. Dat krijgt een eigen rail en een eigen +.
- **Zekering** geselecteerd: er komt een nieuwe kring met een zekering van 16 A en een leiding.
- **Elk ander onderdeel** geselecteerd: er komt een nieuwe kring met een automaat van 16 A, curve B en 2 polen, plus een leiding XVB, 3 geleiders, 2,5 mm².

**Algemeen:**
- Een nieuw punt krijgt de standaardwaarden: contactdoos ×1 met randaarde en kinderbeveiliging, lichtpunt ×1, schakelaar enkel, en voor een toestel de gekozen soort.
- Een toevoeging is altijd één undo-stap, ook als er twee nodes tegelijk bijkomen.
- **Sjablonen:** een klik op een sjabloon voegt het toe op de rail van het geselecteerde bord, of anders op het hoofdbord.

### 4.4 Selecteren, toetsenbord en verwijderen

**Selecteren:**
- Een klik op een symbool selecteert het. Shift+klik voegt toe aan of haalt uit de selectie. Escape wist de selectie.

**Toetsenbord:**
- `↑` en `↓` gaan naar het volgende of vorige punt in dezelfde keten.
- `←` en `→` springen naar de vorige of volgende kring.
- `Enter` voegt het geselecteerde onderdeel toe op het einde van de kring van de selectie.
- Ctrl+Z maakt ongedaan, en Ctrl+Y of Ctrl+Shift+Z doet opnieuw.

**Verwijderen:**
- `Delete` **verwijdert alleen de geselecteerde node(s)**. Hun kinderen schuiven één niveau naar beneden, naar de ouder, op dezelfde plaats.
- Mag een kind niet onder die ouder hangen, dan weigert de editor met een melding. Die zegt dat Shift+Delete de hele tak verwijdert.
- `Shift+Delete` verwijdert de hele tak, met een bevestiging vanaf 5 nodes.
- De root, de teller en het hoofdbord zijn niet te verwijderen.

**Model:** hiervoor komen er nieuwe operaties in `@elentrik/model`, telkens met patches:
- `verwijderEnkel(doc, nodeId)`;
- `voegAfwijkingToe(doc, afwijking)` en `verwijderAfwijking(doc, regelId, nodeId)`;
- `wijzigProject(doc, { klantNaam?, stroomtype? })`.

Die laatste drie waren uitgestelde punten (R16) uit plan 1.

### 4.5 Eigenschappen en bevindingen

**Eigenschappen:**
- Per type is er een formulier met Nederlandse labels.
- Enums worden keuzelijsten, getallen getalvelden (met eenheid), en booleans schakelaars.
- Ook `ruimte` en `label` zijn aanpasbaar.
- Een wijziging gaat meteen door via `wijzigEigenschappen`. Typen in een veld telt als één undo-stap per veld, tot je het veld verlaat.
- Bij meerdere geselecteerde nodes van hetzelfde type pas je de gemeenschappelijke velden in één keer aan. Bij gemengde types toont het paneel alleen het aantal.
- Bovenaan het paneel staan het puntlabel (bv. "A4") en het type.

**Bevindingen:**
- De lijst is gegroepeerd per ernst, en een klik selecteert het onderwerp (`nodeIds[0]`).
- Op het canvas krijgt elk symbool met een bevinding een kleine markering in de kleur van de ernst. Is de bevinding afgeweken, dan is de markering grijs.
- **"Afwijking motiveren"** opent een dialoog met een verplichte motivatie van minstens 10 tekens. Een afwijking is ook te verwijderen.
- **Werking:** na elke wijziging draaien `controleer`, `opmaak` en de render opnieuw.

### 4.6 Opslaan en conflicten

**Server:** Nitro, met Drizzle en Postgres. Er is één tabel `projecten`:

| Kolom | Type |
|---|---|
| `id` | uuid |
| `naam` | text |
| `klantnaam` | text |
| `document` | jsonb |
| `versie` | int |
| `aangemaakt` | timestamptz |
| `gewijzigd` | timestamptz |
| `verwijderd` | timestamptz, null |

Organisaties komen in de stap van inloggen en organisaties, via een migratie.

**API:**

| Methode | Route | Gedrag |
|---|---|---|
| GET | `/api/projecten` | Lijst zonder het document. |
| POST | `/api/projecten` | Body: `{naam, klantnaam, stroomtype}`. Maakt het startdocument aan. |
| GET | `/api/projecten/:id` | Met document en versie. |
| PUT | `/api/projecten/:id` | Header `If-Match: <versie>`. Valideert met `parseDocument` en `valideerStructuur`. Geeft 409 bij een andere versie en 422 bij een ongeldig document. |
| POST | `/api/projecten/:id/dupliceer` | Maakt een kopie. |
| DELETE | `/api/projecten/:id` | Soft delete. |

**Startdocument:** `nieuwDocument` uit het model, plus in één bewerking een differentieel van 300 mA type A, 2 polen en 40 A, en daaronder een verdeelbord. Is het stroomtype `3N400V`, dan heeft het differentieel 4 polen.

**Client:**
- Wijzigingen worden 2 s na de laatste wijziging opgeslagen (spec §6.4).
- Tegelijk komt er een lokaal concept in IndexedDB.
- Bij het openen wordt een lokaal concept aangeboden als dat nieuwer is.
- Bij een 409 kan de gebruiker kiezen: "Serverversie laden" of "Mijn versie als kopie bewaren".

### 4.7 Keuzes die ik zelf maakte (na de review van het ontwerp)

1. **Inhoud van de sjablonen.** Dit zijn constanten in de app. De waarden passen binnen de voorlopige AREI-parameters, zodat een sjabloon geen fouten oplevert. Ze moeten wel mee nagekeken worden met de AREI-waarden.
   - *Kring stopcontacten:* automaat 20 A, curve B, 2 polen → leiding XVB, 3 geleiders, 2,5 mm² → 6 contactdozen.
   - *Kring verlichting:* automaat 16 A, curve B → leiding XVB, 3 geleiders, 1,5 mm² → schakelaar enkel → 4 lichtpunten.
   - *Kookplaat:* automaat 32 A → leiding XVB, 3 geleiders, 6 mm² → toestel kookplaat in de keuken. Bij `3N400V`: automaat 4 polen en leiding met 5 geleiders.
   - *Wasmachine:* automaat 20 A → leiding XVB, 3 geleiders, 2,5 mm² → toestel wasmachine in de wasplaats.
   - *Badkamer:* een differentieel van 30 mA met daaronder een automaat van 16 A → leiding XVB, 3 geleiders, 2,5 mm² → 2 contactdozen in de badkamer.

   Ligt een sjabloon met een eigen differentieel op een rail die al onder een differentieel van 30 mA hangt, dan blijft dat geldig. De AREI-regels beoordelen het resultaat.
2. **Wat niet verwijderd kan worden:** alleen de `aansluiting` en de `teller`. Al de rest kan weg.
   - Delete op het algemeen differentieel schuift het bord naar de teller.
   - Shift+Delete vraagt een bevestiging vanaf 5 nodes.
   - Alles is ongedaan te maken.

   **Doel voor een sjabloon:** de rail van het geselecteerde bord of differentieel. Is er niets geselecteerd, dan het eerste verdeelbord in pre-order.
3. **Stroomtype wijzigen** past alleen `voeding.stroomtype` aan. Bestaande nodes worden niet aangepast. Regel 7 (polen ↔ stroomtype) meldt de tegenstrijdigheden als bevinding.
4. **Projectnaam en klant:**
   - **Projectnaam:** die staat alleen in de kolom `naam`. Hij gaat apart mee in de PUT-body `{ naam?, document }` en hoort niet bij undo.
   - **Klant en stroomtype:** het document is de bron (`meta.klant.naam`, `voeding.stroomtype`). De server kopieert de klantnaam bij elke PUT naar de kolom `klantnaam`.
   - **Dupliceren:** dat geeft een nieuwe rij-id, een nieuwe `doc.id` en de naam "<naam> (kopie)".
5. **Kleinere punten:**
   - Op het einde van een kring staat geen + voor een differentieel.
   - Onderbord op een rail werkt zoals "elk ander onderdeel", dus een nieuwe kring.
   - Enter werkt bij een vertakking of een meervoudige selectie op de eerste geselecteerde node, en dan op het diepste blad langs de eerste kinderen.

## 5. Wat aan de bouwer overblijft

- De structuur van de Nuxt-app: componenten, composables en stores.
- Hoe het canvas tekent: de SVG-string van `render` met een overlay voor selectie, markeringen en +-knoppen, of iets anders. Het moet wel binnen 100 ms reageren bij 2.000 nodes.
- **Waar de +-knoppen en de markeringen komen.** Daarvoor mag `layout` uitgebreid worden met de aanknopingspunten:
  - het einde van elke kring;
  - het einde van elke rail;
  - per node zijn vak.
- Exacte teksten, iconen, kleuren en spaties binnen de standaardstijl van Nuxt UI.
- Hoe de testdatabase werkt. Mijn voorstel is PGlite in-process voor API-tests en Docker Postgres voor ontwikkeling.
- **Testverdeling:**
  - Vitest voor de nieuwe modeloperaties en de API;
  - Playwright voor één flow: nieuw project → kring via de rail → 3 contactdozen → label A3 zichtbaar → ongedaan maken → herladen → nog steeds opgeslagen.
