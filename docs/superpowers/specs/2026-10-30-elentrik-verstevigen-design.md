# Elentrik: verstevigen na de livegang (ontwerp)

- **Datum:** 2026-10-30
- **Status:** goedgekeurd
- **Bouwt voort op:**
  - de opvolgpunten die tijdens de plannen 3 tot en met 10 bewust geparkeerd werden;
  - de live-omgevingen op `elentrik.app` en `staging.elentrik.app`.
- **Beslist met de gebruiker:** groep 1 (bestanden en beveiliging) en groep 2 (fouten die een gebruiker kan tegenkomen) uit de lijst met opvolgpunten.
- **Mijn keuzes:** alle andere keuzes in dit document.

## 1. Waarom

Elentrik draait nu met echte gegevens. Een paar plekken waren bewust geparkeerd "tot vóór online":
- een NAS die vol kan lopen door een te grote upload;
- bestanden van verwijderde projecten die nog bereikbaar zijn;
- bestanden die nooit opgeruimd worden.

Daarnaast zijn er kleine fouten waar een installateur in zijn dagelijks werk tegenaan kan lopen. Geen van beide groepen vraagt een nieuwe functie; ze maken het bestaande betrouwbaar.

## 2. Doelen, niet-doelen en anti-doelen

### Groep 1: bestanden en beveiliging

1. **Geen uploads zonder lengte.** Een upload (plan of logo) zonder geldige `Content-Length` krijgt `411` met de code `LENGTE_VEREIST`; boven de limiet blijft het `413` zoals nu (mijn keuze). Browsers sturen bij `FormData` altijd een lengte mee, dus de app merkt hier niets van. Zo kan een gestreamde upload de NAS niet vullen.
2. **Bestanden van een verwijderd project zijn weg.**
   - `GET /api/bestanden/:id` geeft voor een bestand van een verwijderd project dezelfde 404 als voor een onbekend bestand (`nietGevondenFout`).
   - Dat geldt ook voor export-PDF's van dat project.
3. **Een index op `bestanden.project_id`** (migratie 0009).
4. **Opruimen, één keer per dag** (mijn keuze: om 04:00 Europe/Brussels, als Nitro-taak met een advisory lock, uitgeschakeld met `ELENTRIK_GEPLANDE_TAKEN=uit`, en standaard aan alleen in productie, zoals de inhaaltaak):
   - **Projecten in de prullenbak:**
     - een project dat **meer dan 30 dagen** geleden verwijderd werd, wordt definitief gewist;
     - dat omvat de projectrij, de snapshots, de exports, de bestandsrijen en de bestanden op schijf (mijn keuze voor 30 dagen; er is geen herstelknop, dus dit is de bewaartermijn).
   - **Verweesde planbestanden:** een `plan-origineel` of `plan-raster` ouder dan **30 dagen**, waarnaar niets meer verwijst (bv. een plan dat werd vervangen of verwijderd). Dat is ruimer dan de 7 dagen van de andere bestanden (mijn keuze): een plan dat alleen in een lokaal concept in de browser staat, en nog niet op de server bewaard is, mag een maand wachten, gelijk aan de bewaartijd van de prullenbak. Logo's en bestanden op schijf zonder rij blijven op 7 dagen.
   - **Oude logo's:** een `logo` ouder dan 7 dagen dat niet het huidige logo van zijn organisatie is.
   - **Bestanden op schijf zonder rij:** een bestand in de opslagmap ouder dan 7 dagen dat in geen enkele rij voorkomt.
   - **Wat "verwijst ernaar" is:** de scan is globaal (mijn keuze). Een bestand-id in het huidige document van elk project (ook in de prullenbak), in elke snapshot, in de bedrijfsgegevens, in het logo van een organisatie of in een export telt als gebruik. Bij twijfel blijft een bestand staan.
   - **Een project met bestanden die elders nog gebruikt worden:** gebruikt een ander project, een snapshot of een export van een ander project nog een bestand van een project in de prullenbak (een kopie van vroeger, van voor kopiëren de bestanden meenam), dan wordt dat project overgeslagen en geteld als `geblokkeerd` (mijn keuze). Een verwijzing naar een bestand dat niet meer op schijf staat, blokkeert niet.
   - **Rem op de bestanden zonder rij:** de taak wist niets als de tabel `bestanden` leeg is, of als ze meer dan de helft van de oude bestanden en meer dan 10 bestanden zou wissen (mijn keuze): dat wijst op een verkeerde combinatie van database en opslagmap, bv. midden in een herstel. Er komt dan een waarschuwing met aantallen. Metadata van de NAS (namen die met `@` of `.` beginnen, zoals `@eaDir`) telt niet als bestand.
   - **Volgorde en logboek:** eerst de rij, dan het bestand (een half mislukte run laat hoogstens een bestand op schijf achter, dat de volgende run opruimt). De taak logt alleen aantallen.
5. **Sessietokens in de database:**
   - Uitzoeken in Better Auth 1.7.7 of het sessiecookie ondertekend is (token plus een HMAC met `BETTER_AUTH_SECRET`), zodat een token uit een gelekte database zonder het geheim geen geldig cookie oplevert.
   - Klopt dat, dan is het risico aanvaard. Het komt met één feitelijke zin in `docs/lokaal-en-online.md` (bij beveiliging), samen met de raad om back-ups versleuteld te bewaren.
   - Klopt het niet, dan stelt de bouwer een mitigatie voor in het rapport, en beslist de controller.

### Groep 2: fouten die een gebruiker kan tegenkomen

6. **Instellingen na een bedrijfswissel.** Het formulier van de bedrijfsgegevens onthoudt voor welk bedrijf het geladen werd, en stuurt dat bedrijf mee bij het bewaren. Een tweede klik terwijl er nog bewaard wordt, doet niets. Zo komen gegevens van bedrijf A nooit in bedrijf B terecht.
7. **Werfadres leegmaken.** Maakt de gebruiker alle velden van het werfadres leeg, dan wordt het werfadres ook echt leeg, in plaats van stil het oude te houden.
8. **Exportconflict.**
   - De conflictmelding bij een export spreekt niet meer van "lokale wijzigingen" als die er niet zijn.
   - De optie "kopie" bewaart een kopie van de **actuele** versie op de server, niet van de verouderde.
9. **Project elders verwijderd.** Krijgt automatisch bewaren een 404 (het project is intussen verwijderd), dan toont de editor een duidelijke melding: "Dit project werd verwijderd." Hij biedt twee keuzes aan: "Bewaar als nieuw project" (met de huidige wijzigingen) of "Terug naar de projecten". Hij blijft niet hangen op "fout".
   - Dupliceren van een project en "Bewaar als nieuw project" kopiëren de planbestanden naar het nieuwe project (eigen bestanden, de id's in het document herschreven), zodat een kopie nooit van het origineel afhangt (mijn keuze). Een kopie van vóór deze aanpak krijgt bij het dupliceren alsnog eigen bestanden.
10. **Fout tijdens het inloggen met een link.** Faalt er iets na het klikken op een inloglink, dan komt de gebruiker op `/inloggen` met een vertaalde melding en de knop "Stuur een nieuwe link", in plaats van op een kale 500.
11. **Alleen-lezen (geen abonnement):**
    - de projectgegevens zijn te bekijken in een alleen-lezenversie van de dialoog;
    - een 402 bij het uploaden van een plan toont de vertaalde alleen-lezenmelding, niet de algemene fout;
    - staat er een bewerkingsdialoog open op het moment dat de editor alleen-lezen wordt, dan meldt die dialoog waarom bewaren niet meer kan, in plaats van stil te sluiten.
12. **Vrijgesteld bedrijf.** Een eigenaar van een vrijgesteld bedrijf ziet op `/abonnement` geen "Kies"-kaarten meer, alleen de status "Je bedrijf hoeft niet te betalen".
13. **Geen losse Stripe-klant.** Voordat Checkout een klant aanmaakt, zoekt hij eerst een bestaande Stripe-klant met `metadata.organisatieId` van dit bedrijf. Daarnaast gebruikt hij een idempotency key per organisatie. Een mislukte Checkout laat zo geen tweede klant achter (mijn keuze).

Alle nieuwe teksten komen in nl, fr en en (de pariteitstest).

**Niet-doelen**
- Een herstelknop voor verwijderde projecten.
- De toegankelijkheid, de snelheid en de technische schuld uit groepen 3 tot 5.
- Een migratie naar een andere versie van Better Auth.

**Anti-doelen**
- De opruimtaak wist iets dat nog gebruikt wordt: een plan in het huidige document of in een snapshot, een export, of het huidige logo.
- De opruimtaak wist iets op staging en productie tegelijk via een gedeelde map. Elke omgeving ruimt alleen haar eigen database en haar eigen opslagmap op.
- Een gewone upload vanuit de app wordt geweigerd.
- Een 404 voor een verwijderd project is te onderscheiden van een onbekend project.

## 3. Randvoorwaarden

- Alles uit de vorige plannen blijft gelden:
  - de toegangscontrole via `defineBeveiligdeHandler`;
  - `nietGevondenFout` voor isolatie;
  - de foutcodes in `FOUTCODES`;
  - de vertalingen in drie talen;
  - de tests nooit tegen de echte database.
- **Migratie 0009** wordt bij de volgende `bijwerken.sh` vanzelf uitgevoerd (eerst staging, dan productie).
- **De opruimtaak** is in een unittest volledig te sturen (klok, opslag en database injecteerbaar). Op de NAS logt ze alleen aantallen.

## 4. Wat aan de bouwer overblijft

- de exacte opdeling in modules;
- hoe het formulier het geladen bedrijf bijhoudt;
- de vorm van de meldingen, binnen Nuxt UI;
- de query's van de opruimtaak, zolang de anti-doelen getest zijn.

## 5. Kwaliteit en tests

Elk punt krijgt een test die eerst faalt. In het bijzonder:
- **Opruimtaak:** een plan in een snapshot blijft staan; het huidige logo blijft staan; een project van 29 dagen blijft staan, een van 31 dagen niet; een bestand op schijf zonder rij en jonger dan 7 dagen blijft staan; een tweede gelijktijdige run doet niets.
- **Upload:** zonder `Content-Length` volgt 411; een gewone upload via de app werkt (Playwright).
- **Download:** het bestand van een verwijderd project geeft dezelfde 404 als een onbekend bestand.
- **De punten 6 tot en met 13:** een unittest of componenttest per punt. Waar het om een volledige stroom gaat (punt 9, project elders verwijderd), komt er een Playwright-test.
