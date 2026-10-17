# Elentrik MVP: ontwerp

- **Datum:** 2026-10-17
- **Status:** ter review
- **Werknaam:** Elentrik

## 1. Doel en context

Elentrik is een commerciële web-app voor Belgische elektrotechnische installateurs. Ze tekenen er eendraadschema's en situatieschema's mee en stellen een AREI-keuringsdossier op. Elentrik gaat de concurrentie aan met bestaande desktopsoftware.

**Onderscheidend vermogen:**
1. **Sneller en slimmer tekenen.** Het eendraadschema wordt automatisch opgemaakt, kringen worden via sjablonen toegevoegd, en de AREI-controle loopt live mee terwijl je tekent.
2. **Prijs en eenvoud.** Elentrik draait in de browser zonder installatie, is snel aan de slag en is betaalbaar voor kleine installateurs.

**Succescriterium MVP:** een installateur kan een eengezinswoning van nul tot een volledig keuringsdossier (PDF) uitwerken. Het dossier bestaat uit:
- het eendraadschema;
- het situatieschema op een geïmporteerd plan;
- de kringenlijst;
- de AREI-bevindingen.

Dat moet sneller gaan dan met bestaande desktopsoftware.

### Juridische randvoorwaarde (eigen ontwikkeling)

Elentrik wordt volledig zelfstandig ontwikkeld. Daarvoor gelden deze regels:
- **Geen code overnemen:** er wordt geen code, symboolafbeelding, tekst, vertaling of PDF van andere software overgenomen of als bron gebruikt.
- **Eigen materiaal:** symbolen, UI-teksten en regelteksten worden zelf gemaakt.
- **Wat wel mag:** functionaliteit en domeinkennis (AREI, gebruikelijke werkwijze) mogen gebruikt worden.
- **Import van bestanden uit andere software** valt buiten de MVP. Komt die er later, dan wordt dat een interoperabiliteitsfunctie die vooraf juridisch wordt afgetoetst.

## 2. Scope

### In de MVP
- Organisaties (installatiebedrijven) met meerdere gebruikers, login, en één abonnementsformule met proefperiode.
- Projecten: aanmaken, openen, dupliceren en verwijderen per organisatie.
- Editor voor het eendraadschema met automatische lay-out, sjablonen en sneltoetsen.
- Situatieschema: een PDF of afbeelding als plan importeren en er symbolen uit het schema op plaatsen.
- Kringenlijst, automatisch afgeleid.
- AREI-motor met live bevindingen en gemotiveerde afwijkingen.
- PDF-export van het keuringsdossier op A4 of A3.
- Bedrijfsinstellingen: logo, gegevens, standaardwaarden voor sjablonen en een handtekening.
- Interface in het Nederlands en het Frans.

### Buiten de MVP
- Muren, deuren en ramen tekenen.
- DWG-import.
- Materiaallijst met prijzen.
- Import van projecten uit andere software.
- Volledig offline werken.
- Samenwerken in realtime.
- Koppelingen met groothandels, domotica (bv. Niko Home Control) of keuringsorganismen.
- Een mobiele app.

## 3. Architectuur

pnpm-monorepo in TypeScript (strict):

```
elentrik/
├─ packages/
│  ├─ model/    InstallatieDocument-schema's (Zod), types, migraties, documentoperaties
│  ├─ arei/     analyseer() + controleer(): regelsets, regels, bevindingen
│  ├─ layout/   automatische opmaak van het eendraadschema (boom → coördinaten, paginering)
│  ├─ symbols/  parametrische SVG-symbolen (eigen ontwerp, IEC 60617/NBN-stijl)
│  └─ render/   document → SVG (scherm) en print-HTML (PDF), framework-onafhankelijk
├─ apps/
│  └─ web/      Nuxt 4 (Vue 3): editor, projecten, instellingen, Nitro-API
└─ infra/       docker-compose: web, Postgres, Gotenberg; configuratie voor S3/R2
```

**Afhankelijkheden lopen in één richting:** `model` ← `arei`, `layout`, `symbols` ← `render` ← `web`. De pakketten onder `packages/` bevatten geen I/O, geen Vue en geen Nuxt. Ze draaien zowel in de browser als in Node.

**Technologie:**

| Onderdeel | Keuze |
|---|---|
| Frontend | Nuxt 4, Vue 3, Pinia, Tailwind, @nuxtjs/i18n (nl, fr) |
| Tekenlaag | SVG (geen canvas-bibliotheek); pdf.js voor de achtergrond van het plan |
| Backend | Nitro (Nuxt-server), Drizzle ORM, PostgreSQL 16 |
| Authenticatie | Better Auth met organization-plugin |
| Opslag | S3-compatibel (Cloudflare R2), uploads via presigned URLs |
| PDF | Gotenberg (headless Chromium) in een eigen container |
| Betalingen | Mollie (Bancontact, SEPA-domiciliëring) |
| Tests | Vitest (pakketten en API), Playwright (editorflows) |

## 4. Datamodel (`packages/model`)

### 4.1 InstallatieDocument

Elk project heeft één JSON-document, met een `schemaVersion` en migraties per versie.

```ts
type NodeId = string; // UUIDv7

interface InstallatieDocument {
  id: string;
  schemaVersion: number;          // start op 1; migreer(doc) tilt oudere documenten op
  regelset: string;               // bv. "arei-2020@1"
  meta: {
    klant: Partij; installateur: Partij; keuringsorganisme?: Partij;
    werfadres: Adres; ean?: string; datum: string; versieLabel?: string;
  };
  voeding: { stroomtype: "2x230V" | "3x230V" | "3N400V" };
  rootId: NodeId;                 // altijd een node van type "aansluiting"
  nodes: Record<NodeId, Node>;
  situatie: { paginas: SituatiePagina[] };
  afwijkingen: Afwijking[];
}

interface Partij { naam: string; ondernemingsnummer?: string; email?: string; telefoon?: string; adres?: Adres; logoBestandId?: string }
interface Adres { straat: string; nummer: string; bus?: string; postcode: string; gemeente: string; land: string }
interface Afwijking { regelId: string; nodeId: NodeId; motivatie: string; door: string; datum: string }
```

### 4.2 Nodes

De nodes worden genormaliseerd opgeslagen: elke node heeft een `parentId` en een geordende lijst `kinderen`. Het type is een discriminated union op `type`.

```ts
interface NodeBase { id: NodeId; parentId: NodeId | null; kinderen: NodeId[]; label?: string; ruimte?: Ruimte }

type Ruimte = "badkamer" | "keuken" | "wasplaats" | "slaapkamer" | "leefruimte" | "garage"
            | "kelder" | "zolder" | "buiten" | "technisch" | "andere";

type Node = NodeBase & (
  | { type: "aansluiting" }
  | { type: "teller" }
  | { type: "differentieel"; gevoeligheid_mA: number; nominaal_A: number; polen: Polen; klasse: "AC" | "A" | "F" | "B" }
  | { type: "automaat"; nominaal_A: number; polen: Polen; curve: "B" | "C" | "D"; kortsluitvermogen_kA?: number }
  | { type: "zekering"; nominaal_A: number }
  | { type: "verdeelbord"; naam?: string }
  | { type: "leiding"; kabeltype: string; doorsnede_mm2: number; aantalGeleiders: number; plaatsing?: "inbouw" | "opbouw" | "buis" | "grond" }
  | { type: "contactdoos"; aantal: number; randaarde: boolean; kinderbeveiliging: boolean; waterdicht: boolean }
  | { type: "lichtpunt"; aantal: number; soort?: "standaard" | "led" | "tl" | "spot" | "noodverlichting" }
  | { type: "schakelaar"; soort: "enkel" | "dubbel" | "wissel" | "kruis" | "dimmer" | "drukknop"; waterdicht: boolean }
  | { type: "toestel"; soort: Toestelsoort; vermogen_W?: number }
);

type Polen = 1 | 2 | 3 | 4;
type Toestelsoort = "wasmachine" | "droogkast" | "vaatwasser" | "kookplaat" | "oven" | "boiler"
                  | "warmtepomp" | "laadpaal" | "omvormer" | "andere";
```

**Invarianten,** gecontroleerd door `valideerStructuur(doc)`:
- De nodes vormen precies één boom vanaf `rootId`, zonder cycli.
- `parentId` en `kinderen` zijn consistent met elkaar.
- Wat een node als kind mag hebben, ligt per type vast in de tabel `TOEGELATEN_KINDEREN`. Een `contactdoos` kan bijvoorbeeld geen `automaat` als kind hebben.

**Afgeleide gegevens** zoals kringletters, puntnummers en de beveiliging boven een punt worden nooit opgeslagen. Ze komen uit `arei.analyseer`.

### 4.3 Situatieschema

```ts
interface SituatiePagina {
  id: string; titel: string;
  achtergrond?: { origineelBestandId: string; rasterBestandId: string; pdfPagina?: number;
                  breedte_px: number; hoogte_px: number; schaal?: { mmPerPx: number } };
  plaatsingen: { nodeId: NodeId; x: number; y: number; rotatie: number }[];   // coördinaten in rasterpixels
}
```

### 4.4 Documentoperaties

Alle wijzigingen lopen via pure functies in `model`: `voegToe`, `verplaats`, `verwijder`, `wijzigEigenschappen`, `pasSjabloonToe`, `plaats`, `verwijderPlaatsing`.
- Ze geven een nieuw document terug, plus immer-patches en inverse patches voor undo/redo.
- Na elke operatie blijven de invarianten gelden. Een ongeldige operatie gooit een `DocumentFout` met een foutcode.

### 4.5 Database (Drizzle)

| Tabel | Belangrijkste kolommen |
|---|---|
| Better Auth-tabellen | gebruikers, sessies, organisaties, lidmaatschappen (rollen `eigenaar`, `lid`) |
| `projecten` | id, organisatieId, naam, klantnaam, document (jsonb), versie (int), aangemaakt, gewijzigd, verwijderd (soft delete) |
| `snapshots` | id, projectId, versie, document (jsonb), reden (`export` \| `handmatig`), aangemaaktDoor, aangemaakt |
| `bestanden` | id, organisatieId, projectId?, sleutel (R2), mime, grootte, soort (`plan-origineel` \| `plan-raster` \| `logo` \| `handtekening` \| `export`) |
| `exports` | id, projectId, snapshotId, bestandId, aantalFouten, aantalWaarschuwingen, aangemaakt |
| `bedrijfsinstellingen` | organisatieId, standaardwaarden (jsonb), handtekeningBestandId? |
| `abonnementen` | organisatieId, mollieKlantId, mollieAbonnementId, status, proefTot, betaaldTot |

Toegang wordt op elke API-route afgedwongen: een gebruiker ziet alleen projecten en bestanden van zijn eigen organisaties.

## 5. AREI-motor (`packages/arei`)

### 5.1 Analyse

`analyseer(doc): Analyse` is een pure functie die het document in één doorgang verwerkt:
- **Kringen:** elke `automaat` of `zekering` die ergens onder een `verdeelbord` hangt, start een kring.
  - Kringen krijgen letters op volgorde van de boom (diepte eerst): A, B, …, Z, AA, AB, ….
  - De punten in een kring worden genummerd in dezelfde volgorde: A1, A2, ….
  - Een `verdeelbord` onder een kring (een onderbord) begint een eigen reeks letters met het onderbord als prefix.
- **Keten per punt:** per punt wordt de keten naar boven bepaald, met de dichtstbijzijnde `leiding`, `automaat` of `zekering`, en alle `differentieel`s erboven.
- **Kringgegevens:** per kring het aantal contactdozen (som van `aantal`), lichtpunten, schakelaars en toestellen, de ruimtes die erin voorkomen, en de kleinste leidingdoorsnede in de kring.
- **Niet-geplaatst:** de punten die nog niet op een situatiepagina staan.

### 5.2 Regels en controle

```ts
interface Regel {
  id: string;                         // "arei.kring.max-contactdozen"
  artikel: string;                    // verwijzing naar het AREI-artikel
  ernst: "fout" | "waarschuwing" | "info";
  nagekeken: boolean;                 // true pas na controle door een vakkundig persoon; vereist voor publicatie
  check(analyse: Analyse, doc: InstallatieDocument): Bevinding[];
}
interface Regelset { id: string; versie: number; regels: Regel[] }
interface Bevinding { regelId: string; ernst: Regel["ernst"]; nodeIds: NodeId[]; berichtSleutel: string; parameters: Record<string, string | number>; afgeweken: boolean }

function controleer(doc: InstallatieDocument, regelset: Regelset): Bevinding[];
```

- Een bevinding waarvoor in `doc.afwijkingen` een afwijking staat met hetzelfde `regelId` en `nodeId`, krijgt `afgeweken: true`. Ze blijft dan zichtbaar, maar telt niet mee als fout.
- De berichten zijn i18n-sleutels die per taal vertaald worden, met de waarden uit `parameters`.
- **Versies van regelsets:** een regelset is na publicatie onveranderlijk. Wijzigingen leiden tot een nieuwe versie. Een document blijft gekoppeld aan de regelset in `doc.regelset`, totdat de gebruiker het expliciet bijwerkt.

### 5.3 Eerste regelset `arei-2020@1`

De lijst hieronder geeft aan welke regels de MVP minstens bevat. **De numerieke grenswaarden en artikelverwijzingen komen niet uit dit ontwerp.** Ze worden overgenomen uit de officiële AREI-tekst en nagekeken door een vakkundig persoon (installateur of keuringsorganisme). Pas dan wordt een regel aan de gepubliceerde regelset toegevoegd. Dat afdwingen is werk binnen de MVP, zie §9.

1. Na de teller zit een algemeen differentieel.
2. Punten in natte ruimtes (badkamer, wasplaats) en de toestellen wasmachine, droogkast en vaatwasser zitten achter een differentieel met de vereiste lage gevoeligheid.
3. De nominale stroom van een automaat of zekering past bij de kleinste leidingdoorsnede in de kring. De tabel doorsnede → maximale stroom is configureerbaar binnen de regelset.
4. Het aantal contactdozen per kring respecteert het maximum.
5. Kringen voor contactdozen en kringen voor lichtpunten respecteren de minimale doorsnede.
6. Toestellen die een eigen kring vereisen (o.a. kookplaat, oven, boiler, laadpaal) zitten alleen op hun kring.
7. Voor de stroomtype `3N400V` hebben meerpolige beveiligingen het juiste aantal polen.
8. *(info)* Elk punt staat op een situatiepagina.
9. *(info)* Elke `leiding` heeft een doorsnede en een kabeltype.

### 5.4 Uitvoering

- **Browser:** `controleer` draait na elke documentoperatie, synchroon. Het doel is minder dan 20 ms voor 2.000 nodes. Wordt dat niet gehaald, dan verhuist de motor naar een Web Worker zonder dat de API verandert.
- **Server:** dezelfde motor draait opnieuw bij export. Het resultaat van de server gaat in de PDF.

## 6. Editor (`apps/web`)

### 6.1 Indeling
- **Links:** het palet met symbolen en sjablonen, met zoekfunctie en favorieten per gebruiker.
- **Midden:** tabbladen *Eendraadschema*, *Situatieschema* en *Kringenlijst*.
- **Rechts:** het eigenschappenpaneel (gegenereerd uit het Zod-schema van het type, met meervoudige selectie) en het paneel *Bevindingen*.

### 6.2 Eendraadschema
- **Opmaak:** de positie van symbolen wordt niet vrij gekozen. `layout.opmaak(doc, analyse, papier)` berekent de coördinaten en de paginering. De gebruiker bewerkt alleen de structuur:
  - toevoegen als kind of als buur;
  - een tak verslepen naar een andere ouder of een andere positie;
  - verwijderen, kopiëren en plakken.
- **Sjablonen:** een sjabloon is een stukje boom met standaardwaarden, bv. *Stopcontacten keuken*, *Verlichting*, *Kookplaat* of *Badkamer*. De standaardwaarden komen uit `bedrijfsinstellingen` en kunnen per sjabloon overschreven worden. Het sjabloon toevoegen gebeurt in één bewerking, dus ook één stap ongedaan maken.
- **Toetsenbord:**
  - pijltjes om door de boom te navigeren;
  - `Enter` voor een nieuwe buur;
  - `Tab` voor een nieuw kind;
  - lettersneltoetsen per symbooltype;
  - `Delete` om te verwijderen;
  - `Ctrl+Z` en `Ctrl+Y` om ongedaan te maken en opnieuw te doen.
- **Bevindingen:**
  - een badge met de ernst op het symbool;
  - klikken in de lijst selecteert het symbool en scrollt ernaartoe;
  - de actie "afwijking motiveren" vraagt een verplichte tekst van minstens 10 tekens.

### 6.3 Situatieschema
- **Upload:**
  - Een PDF of afbeelding (PNG of JPG) mag maximaal 50 MB zijn.
  - Bij een PDF kiest de gebruiker een pagina. pdf.js zet die in de browser om naar een PNG van 300 dpi, met een maximum van 8.000 px aan de lange zijde.
  - Het origineel en de PNG gaan via presigned URLs naar R2.
- **Plaatsen:**
  - De lijst met niet-geplaatste punten komt uit de analyse.
  - De gebruiker sleept een punt op het plan. Het label (kringletter en nummer) wordt live afgeleid.
  - Een geplaatst symbool kan verschoven, gedraaid in stappen van 15° en verwijderd worden.
- **Bediening:** zoomen met het muiswiel en met twee vingers, pannen met slepen of de spatiebalk ingedrukt houden.
- **Schaal instellen:** optioneel. De gebruiker klikt twee punten aan en geeft de afstand in mm op.

### 6.4 Status, opslaan en conflicten
- **Store:** het document staat in een Pinia-store. Elke documentoperatie levert patches die op de undo-stack gaan, met maximaal 200 stappen per sessie.
- **Automatisch opslaan:** 2 seconden na de laatste wijziging gaat er een `PUT /api/projecten/:id` met de header `If-Match: <versie>`.
  - Bij succes geeft de server de nieuwe versie terug.
  - Bij een conflict (409) krijgt de gebruiker een melding met twee keuzes: de serverversie laden, of zijn eigen versie als kopie bewaren.
- **Lokaal concept:** het laatste niet-opgeslagen document staat ook in IndexedDB. Bij het openen van een project wordt een lokaal concept aangeboden als dat nieuwer is dan de serverversie.
- **Validatie:** de server valideert elk binnenkomend document met het Zod-schema en `valideerStructuur`. Een ongeldig document krijgt een 422 en wordt niet opgeslagen.

### 6.5 Symbolen (`packages/symbols`)
- Elk symbool wordt eigen ontworpen als functie van de eigenschappen van de node naar een SVG-fragment, bv. aantal contactdozen, randaarde of polen.
- Per symbool liggen het aansluitpunt en de grootte vast, zodat `layout` ermee kan rekenen.
- De symbolen worden gecontroleerd met snapshottests per symbool en per variant.

## 7. PDF-export

1. **Aanvraag:** de client roept `POST /api/projecten/:id/exports` aan met:
   - de gekozen onderdelen (eendraadschema, situatieschema, kringenlijst, bijlage met bevindingen);
   - het papierformaat (A4 of A3);
   - het versielabel.
2. **Controle:** de server laadt het opgeslagen document en maakt een `snapshot` met reden `export`. Daarna draait hij `controleer`.
   - Zijn er fouten die niet afgeweken zijn, dan heeft de client vooraf al een bevestiging gevraagd.
   - De export gaat altijd door. De bijlage vermeldt de fouten.
3. **Opbouw:** `render.printHtml(doc, analyse, bevindingen, opties)` maakt één HTML-document met print-CSS:
   - **Cartouche** op elke pagina: klant, werfadres, installateur met logo, datum, versie, paginanummer en handtekeningen.
   - **Eendraadschema:** de pagina's komen uit `layout`, die per groep van kringen afbreekt.
   - **Situatieschema:** de PNG van het plan met de symbolen als SVG-laag erover.
   - **Kringenlijst:** een tabel met kring, punt, type, ruimte, beveiliging en leiding.
   - **Bijlage:** de bevindingen en de afwijkingen met hun motivatie.
4. **Omzetten:** de server stuurt de HTML en de gebruikte afbeeldingen naar Gotenberg, met een timeout van 60 s. Lukt dat niet, dan volgt één nieuwe poging. Mislukt die ook, dan krijgt de gebruiker een 502 met een leesbare foutmelding, en wordt de fout gelogd met het project en het snapshot.
5. **Afronding:** de PDF wordt opgeslagen in R2 met een rij in `bestanden` en een rij in `exports`. De gebruiker krijgt een downloadlink die 15 minuten geldig is. Eerdere exports blijven downloadbaar vanuit het project.

## 8. Platform

- **Authenticatie:** e-mail en wachtwoord, plus een magic link. De eerste gebruiker maakt een organisatie aan en wordt `eigenaar`. Een eigenaar kan leden uitnodigen via e-mail.
- **Abonnement:**
  - één formule met een proefperiode van 30 dagen, via Mollie (eerste betaling en daarna een terugkerende domiciliëring);
  - de webhook van Mollie werkt `abonnementen` bij;
  - als het abonnement verloopt, blijven projecten zichtbaar en exporteerbaar, maar kunnen ze niet meer bewerkt worden.
- **Talen:** de interface en de berichten van de bevindingen bestaan in het Nederlands en het Frans. De taal van de PDF is in te stellen per project.
- **Hosting:** docker-compose met de web-app, Gotenberg en Postgres (of een beheerde Postgres), en R2 voor de bestanden. Er komt een dagelijkse back-up van Postgres.

## 9. Testen en kwaliteit

- **`model`:**
  - unittests voor elke documentoperatie;
  - property-based tests (fast-check) die nagaan dat de invarianten blijven gelden na willekeurige reeksen operaties;
  - migratietests.
- **`arei`:**
  - een builder-DSL voor testinstallaties, bv. `installatie().verdeelbord(b => b.kring(k => k.automaat(16).leiding(1.5).contactdozen(9)))`;
  - per regel minstens één geval dat slaagt en één dat faalt;
  - drie volledige referentie-installaties (appartement, rijwoning, woning met laadpaal en zonnepanelen) als regressietest;
  - een test die faalt als een regel in een gepubliceerde regelset een leeg `artikel` heeft of geen markering `nagekeken`.
- **`layout`, `symbols` en `render`:** snapshottests van de SVG en van de print-HTML.
- **`web`:**
  - API-tests met Vitest tegen een test-Postgres: toegangscontrole, 409, 422;
  - Playwright voor de flow "project aanmaken → kring via sjabloon → plan uploaden → punt plaatsen → exporteren".
- **Prestatie:** een benchmark controleert dat `controleer` voor een document met 2.000 nodes onder 20 ms blijft (§5.4).

## 10. Volgorde van bouwen

1. `model`: schema, operaties en invarianten.
2. `arei`: analyse, regelmechaniek en de eerste regels met voorlopige testwaarden, gemarkeerd als niet nagekeken.
3. `symbols` en `layout`: eendraadschema op het scherm.
4. Editor voor het eendraadschema met opslag, zonder authenticatie, met een lokale database.
5. Authenticatie, organisaties en projecten.
6. Situatieschema.
7. `render` en PDF-export.
8. Abonnementen en Mollie.
9. AREI-waarden laten nakijken en regelset `arei-2020@1` publiceren.
