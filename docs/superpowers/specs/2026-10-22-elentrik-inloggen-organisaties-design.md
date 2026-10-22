# Elentrik: inloggen en organisaties (ontwerp)

- **Datum:** 2026-10-22
- **Status:** ter review
- **Bouwt voort op:**
  - de MVP-spec `docs/superpowers/specs/2026-10-17-elentrik-mvp-design.md` (§4.5, §8 en §10 stap 5);
  - de bestaande app `apps/web`: projecten, bestanden, exports en bedrijfsgegevens.
- **Beslist met de gebruiker:**
  - collega's en andere installateurs werken mee;
  - collega's van hetzelfde bedrijf zien en bewerken alle projecten van dat bedrijf;
  - uitnodigen gebeurt per e-mail;
  - één persoon kan in meerdere bedrijven zitten en daartussen wisselen;
  - je blijft weken ingelogd.
- **Mijn keuzes:** alle andere keuzes in dit document. Die zijn telkens als "mijn keuze" gemarkeerd.

## 1. Waarom

Elentrik werkt vandaag alleen lokaal, voor één persoon, zonder accounts. Om het online te zetten en te verkopen, zijn twee dingen nodig:
- personen moeten inloggen;
- het werk van verschillende bedrijven moet strikt gescheiden blijven.

Binnen een bedrijf werken collega's samen aan dezelfde projecten. Een zelfstandige die voor meerdere installateurs werkt, moet tussen die bedrijven kunnen wisselen.

## 2. Doelen, niet-doelen en anti-doelen

**Doelen:**

1. **Registreren en inloggen:**
   - met e-mail en wachtwoord, of met een inloglink per e-mail (magic link);
   - "Wachtwoord vergeten" werkt via e-mail;
   - een sessie blijft 30 dagen geldig en wordt bij elk gebruik verlengd (mijn keuze).
2. **Organisaties:**
   - Wie zich registreert, maakt meteen een organisatie aan en wordt er **eigenaar** van.
   - Een organisatie heeft een naam, en haar bedrijfsgegevens met logo (die bestaan al als één geheel en worden per organisatie).
3. **Leden:**
   - Een eigenaar nodigt een collega uit op e-mailadres. Die wordt **lid**, of eigenaar als de uitnodiging dat zegt (mijn keuze: de eigenaar kiest de rol).
   - De link in de e-mail leidt naar registreren of inloggen. Daarna volgt de aansluiting bij de organisatie.
   - Een eigenaar kan de rol van een lid wijzigen, iemand verwijderen en een openstaande uitnodiging intrekken.
   - Er blijft altijd minstens één eigenaar.
4. **Wisselen:**
   - Bovenaan staat een keuzelijst met de organisaties van de gebruiker.
   - De actieve organisatie hoort bij de sessie. Bij de volgende keer inloggen is de laatst gekozen organisatie actief.
5. **Afscherming:**
   - Elke API-route controleert of de gebruiker ingelogd is en lid is van de organisatie waartoe het gevraagde hoort: project, bestand, export, snapshot of bedrijfsgegevens.
   - Een project, bestand of export van een andere organisatie geeft **404** en niet 403. Zo lekt het bestaan ervan niet (mijn keuze).
   - Lijsten tonen alleen de projecten van de actieve organisatie.
6. **Rechten per rol** (mijn keuze):
   - **lid:** projecten aanmaken, bewerken, dupliceren, verwijderen en exporteren; de bedrijfsgegevens bekijken.
   - **eigenaar:** alles van een lid, plus de bedrijfsgegevens wijzigen, leden beheren, uitnodigen en de organisatie hernoemen.
7. **Overname van de bestaande lokale gegevens:**
   - De eerste gebruiker die zich registreert, krijgt in zijn nieuwe organisatie alle bestaande projecten, met hun bestanden, snapshots en exports.
   - Hij krijgt ook de bestaande bedrijfsgegevens.
   - Dat gebeurt één keer, in een migratie of bij de eerste registratie. Daarna zijn er geen projecten zonder organisatie meer.
8. **E-mail:**
   - Lokaal vangt Mailpit alle mails op. Het draait in Docker op `127.0.0.1`, en de mails zijn te bekijken in een webinterface.
   - Voor later is de SMTP-configuratie in te stellen via omgevingsvariabelen.
   - De mails zijn in het Nederlands: uitnodiging, inloglink en wachtwoord herstellen.
9. **`auteur` van afwijkingen:**
   - Een afwijking op een bevinding houdt vandaag `door: "lokaal"` bij. Dat wordt de naam van de ingelogde gebruiker.
   - De TODO in de store hierover bestaat al.

**Niet-doelen** (later):
- inloggen met Google of Microsoft (SSO), en tweestapsverificatie;
- rechten per project, live samenwerken en een auditlog;
- abonnementen (Mollie);
- Elentrik echt online zetten met domein, HTTPS en hosting. Dit plan maakt het mogelijk, maar de server blijft op `127.0.0.1`;
- een organisatie verwijderen, en een account verwijderen of exporteren (GDPR-functies).

**Anti-doelen** (dan is het mislukt, ook als het technisch werkt):
- **Een gebruiker ziet of wijzigt iets van een andere organisatie**, ook niet via een geraden id, een download-URL, een export of een logo.
- **Werk verliezen door uitloggen of een verlopen sessie.** Een verlopen sessie tijdens het tekenen mag de bestaande autosave en het lokale concept niet breken. Na opnieuw inloggen staat het werk er nog.
- **Buitengesloten raken:** de laatste eigenaar kan zichzelf niet verwijderen of degraderen.
- **Wachtwoorden of tokens in logs, URL's na gebruik, of de database in leesbare vorm.**
- **De bestaande lokale gegevens van de gebruiker gaan verloren bij de overstap.**

## 3. Randvoorwaarden

- **Bibliotheek (MVP-spec):** Better Auth, met de plugins voor organisaties en magic link. Gebruik een exacte versie die minstens twee weken oud is. De tabellen staan in Drizzle op de bestaande Postgres.
- **Wachtwoorden** worden gehasht met de standaard van Better Auth. Minimumlengte: 10 tekens (mijn keuze).
- **Cookies** zijn `HttpOnly` en `SameSite=Lax`. `Secure` staat aan zodra de server over HTTPS draait, en is lokaal uit.
- **Inlogpogingen** worden beperkt met de rate limiting van Better Auth.
- **Bestaande afspraken blijven gelden:** alleen lokaal (`127.0.0.1`), eigen ontwikkeling, ondertekende commits met de Opus 5.5-trailer, UI-teksten in `nl.json`, en de pakketten zonder I/O.
- **Werkwijze:** de hoofdcheckout, een feature-branch, en altijd pushen naar een expliciete doelbranch.
- **Tests:**
  - Vitest-tests lopen tegen PGlite, met de Better Auth-tabellen gemigreerd.
  - Voor e2e logt een hulpfunctie in. De bestaande e2e-specs krijgen een ingelogde gebruiker in een eigen testorganisatie, zodat ze niets van de echte gegevens raken.

## 4. Ontwerp

### 4.1 Gegevens

- **Tabellen van Better Auth** voor gebruiker, sessie, account (wachtwoord), verificatie (magic link en herstel), organisatie, lidmaatschap (rol `eigenaar` of `lid`) en uitnodiging.
  - Gebruik de Nederlandse rolnamen of koppel ze daarop. De API en de UI tonen `eigenaar` en `lid`.
- **`projecten`** krijgt `organisatieId` (not null) na de overname.
- **`bedrijfsinstellingen`** wordt per organisatie, met de sleutel `organisatieId` in plaats van `id = 1`.
- **`bestanden`:**
  - plan- en exportbestanden behoren via hun project tot een organisatie;
  - een logo behoort via `organisatieId` tot een organisatie, met een nieuwe kolom, nullable voor plannen;
  - de opslagsleutel van een logo wordt `org/<organisatieId>/<bestandId>`. Bestaande logo's mogen hun oude sleutel houden.
- **`snapshots` en `exports`** zitten via hun project al vast aan een organisatie.

### 4.2 Server

- **Contextfunctie** `vereisLid(event, { rol? })`. Die geeft `{ gebruiker, organisatieId, rol }` terug, of gooit 401 als niemand ingelogd is, en 403 als de vereiste rol ontbreekt.
- **Toegang per route:**
  - Projectroutes zoeken het project op met `id` **en** `organisatieId`. Komt er niets terug, dan volgt 404.
  - `GET /api/bestanden/:id` controleert via het project, of via de logo-organisatie, of het bestand bij de actieve organisatie van de gebruiker hoort. Zo niet, dan volgt 404.
  - De routes voor bedrijfsgegevens werken op de actieve organisatie. Schrijven mag alleen een eigenaar.
- **Nieuwe routes:**
  - de routes van Better Auth zelf, onder `/api/auth/*`;
  - een samenvatting van de huidige gebruiker en zijn organisaties;
  - de actieve organisatie wisselen;
  - leden en uitnodigingen beheren.
- **Overname:**
  - Een eenmalige stap koppelt alle projecten zonder `organisatieId` en de bestaande bedrijfsgegevens aan de eerste organisatie die aangemaakt wordt.
  - Dat gebeurt idempotent en in één transactie.
- **E-mail:**
  - Een kleine verzendmodule met een injecteerbare transport, zodat tests geen echte mail versturen.
  - Lokaal gebruikt ze SMTP naar Mailpit op `127.0.0.1:1025`, met de webinterface op `127.0.0.1:8025`.

### 4.3 Client

- **Pagina's:**
  - `/inloggen` (wachtwoord, of "stuur me een inloglink");
  - `/registreren` (naam, e-mail, wachtwoord, naam van het bedrijf);
  - `/wachtwoord-vergeten` en `/wachtwoord-herstellen`;
  - `/uitnodiging/:token`;
  - `/organisatie` (leden, uitnodigingen, rollen; het beheer alleen voor een eigenaar);
  - de bestaande `/instellingen` voor de bedrijfsgegevens, alleen-lezen voor een lid.
- **Route-middleware:** zonder sessie volgt een doorverwijzing naar `/inloggen`, met een terugkeer-URL.
- **Bovenbalk** van de projectenlijst en de editor: de organisatiekeuze, de naam van de gebruiker en "Uitloggen".
- **Verlopen sessie in de editor:**
  - Autosave krijgt een 401. De status wordt "lokaal" (het werk staat in het concept), met een melding "Je bent uitgelogd. Log opnieuw in om op te slaan." en een knop die inloggen opent in een nieuw tabblad of een dialoog.
  - Na inloggen werkt "Opnieuw proberen" weer. Er gaat niets verloren.
- **Wisselen van organisatie** terwijl een project open is: Elentrik slaat eerst op (`nuOpslaan`). Daarna volgt de projectenlijst van de nieuwe organisatie.

## 5. Kwaliteit en tests

- **Server, met PGlite:**
  - voor elke bestaande en nieuwe route: zonder sessie volgt 401;
  - een project, bestand, export of logo van een andere organisatie geeft 404;
  - een lid dat de bedrijfsgegevens wil wijzigen, krijgt 403;
  - de laatste eigenaar kan niet weg;
  - de overname is idempotent;
  - een uitnodiging kan maar één keer gebruikt worden en verloopt (mijn keuze: na 7 dagen).
- **Een tabel van routes en verwachte toegang**, als één test die alle API-routes overloopt. Een nieuwe route zonder controle doet die test falen.
- **E2E:**
  - registreren, en de overname van bestaande projecten;
  - uitloggen en weer inloggen met een wachtwoord en met een magic link (de link komt uit de Mailpit-API);
  - een collega uitnodigen, die zich via de link registreert en het project ziet;
  - een tweede organisatie aanmaken en wisselen, waarna de projecten gescheiden zijn;
  - een verlopen sessie tijdens het tekenen, opnieuw inloggen, en het werk is bewaard.
- **Alle bestaande e2e-specs** draaien als ingelogde testgebruiker in een eigen testorganisatie.

## 5b. Beslissingen na de builder-check (mijn keuzes)

1. **Toegang op lidmaatschap, niet alleen op de actieve organisatie.**
   - Een project, bestand of export dat je op id opvraagt, is toegankelijk als je lid bent van de organisatie waartoe het hoort.
   - De **lijsten** tonen alleen de actieve organisatie.
   - Opent iemand een project uit een andere organisatie waarvan hij lid is (via een bladwijzer of een tweede tabblad), dan maakt de editor die organisatie actief en toont hij een korte melding. Zo krijgt autosave in een tweede tabblad geen 404 na een wissel.
   - Bij elk verzoek controleert de server het lidmaatschap opnieuw. Hij vertrouwt niet blind op de actieve organisatie in de sessie.
2. **Lokale concepten (IndexedDB) per gebruiker.**
   - De sleutel wordt `concept:<userId>:<projectId>:<instantie>`. Een gebruiker krijgt alleen zijn eigen concepten aangeboden.
   - **Uitloggen** gaat eerst door `nuOpslaan`. Lukt dat niet, dan volgt een bevestiging: "Er zijn wijzigingen die nog niet op de server staan. Ze blijven lokaal bewaard voor dit account."
   - Concepten van een uitgelogde gebruiker blijven staan, zodat er geen werk verloren gaat. Ze worden nooit aan een andere gebruiker getoond.
   - Oude concepten zonder gebruiker in de sleutel worden de eerste keer aan de eerste ingelogde gebruiker aangeboden. Dat sluit aan bij de overname.
3. **Overname en testisolatie.**
   - De overname blijft zoals afgesproken: de eerste gebruiker die zich registreert, krijgt de bestaande projecten en bedrijfsgegevens. Dat gebeurt in dezelfde transactie als zijn registratie, en alleen als er nog projecten zonder organisatie zijn.
   - `projecten.organisatieId` blijft daarom nullable in de database. De code dwingt af dat er na de overname geen projecten zonder organisatie meer zijn.
     - Een project zonder organisatie is voor niemand zichtbaar.
     - Een nieuw project krijgt altijd de actieve organisatie.
   - **E2E- en Vitest-tests raken de echte gegevens nooit.**
     - Playwright draait tegen een aparte database `elentrik_e2e`, met een eigen map voor bestanden. De Docker-init maakt die aan, en de webserver van Playwright krijgt een eigen `DATABASE_URL` met `reuseExistingServer: false`.
     - De e2e-test van de overname zaait zelf bestaande projecten in die aparte database.
     - De oude hulpfunctie die de bedrijfsgegevens met `id = 1` snapshot en herstelt, vervalt.
4. **E-mailverificatie en registratiepaden.**
   - Registreren met wachtwoord vereist een bevestiging van het e-mailadres via een link, voor je kan inloggen. Een magic link bevestigt het adres meteen.
   - Een **uitnodiging** aanvaarden kan alleen met een account waarvan het e-mailadres gelijk is aan dat van de uitnodiging en bevestigd is.
   - Wie zich via `/uitnodiging/:token` registreert, maakt geen eigen organisatie aan. Hij komt in de organisatie van de uitnodiging, en zijn adres geldt meteen als bevestigd, want de link kwam via dat adres.
   - Een **magic link** voor een onbekend adres maakt geen account aan. Het scherm toont dezelfde neutrale melding ("Als dit adres bekend is, ontvang je een link"), zodat niemand kan nagaan welke adressen bestaan.
5. **Geen organisatie meer.**
   - Een lid kan een organisatie zelf verlaten, behalve de laatste eigenaar.
   - Een gebruiker zonder organisatie krijgt na inloggen het scherm "Maak een bedrijf aan of vraag een uitnodiging". Hij wordt niet uitgelogd.
   - Wordt iemand verwijderd uit de organisatie die in zijn sessie actief is, dan krijgt zijn volgende verzoek 404 of 403. De client gaat dan naar een andere organisatie van die gebruiker, of naar het scherm hierboven.
6. **Namen.**
   - De bedrijfsnaam bij registratie wordt de naam van de organisatie. Ze vult ook `installateur.naam` in de bedrijfsgegevens in, als die nog leeg is.
   - Bij de overname blijven de bestaande bedrijfsgegevens ongewijzigd.

## 6. Wat aan de bouwer overblijft

- de exacte Better Auth-configuratie en hoe de plugin-tabellen in het Drizzle-schema komen (gegenereerd of handgeschreven);
- de vormgeving van de inlog- en organisatiepagina's binnen Nuxt UI;
- of de overname in een SQL-migratie of in code bij de eerste registratie gebeurt, zolang ze idempotent en transactioneel is.
