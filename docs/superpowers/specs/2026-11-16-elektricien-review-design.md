# Elektricien- en UX-review: ontwerp

Datum: 16 november 2026. Vraag van de gebruiker: de app nakijken en verbeteren met de blik van een ervaren elektricien die het AREI en UX/UI goed kent, de app gebruiksvriendelijker maken en productieve functies toevoegen. Tijdens de review kwamen drie aanvullingen: het klikgebied van de onderdelen in het eendraadschema is te klein en moet groter, goede ideeën van andere tools mogen als idee overgenomen worden (clean room blijft gelden), en het werk mag over meerdere subagents verdeeld worden.

## Wat de review vond

De review liep door een proefproject in de browser (nieuwe woning, vijf kringen via sjablonen) en door de code van `packages/arei`, `packages/model`, `packages/render` en de editor.

### Elektrisch (AREI Boek 1)

Bronnen: de toelichting van het sectorkenniscentrum bij de wijzigingen van 1 juni 2023 (onderafdeling 4.2.4.3) en bij de kabelberekening (onderafdeling 4.4.1.5, tabel 1). De regelset blijft voorlopig en niet gepubliceerd; elke nieuwe regel staat op `nagekeken: false`.

1. **De tabel beveiliging per doorsnede is fout en onvolledig.** `maxStroomPerDoorsnede` zegt 6 mm² → 32 A en 10 mm² → 40 A en stopt bij 10 mm². Tabel 1 geeft per doorsnede een waarde voor een smeltveiligheid en een hogere voor een automaat: 1,5 → 10/16 A, 2,5 → 16/20 A, 4 → 20/25 A, 6 → 32/40 A, 10 → 50/63 A, 16 → 63/80 A, 25 → 80/100 A, 35 → 100/125 A. Vandaag krijgt een automaat van 40 A op 6 mm² dus onterecht een fout, en een zekering van 16 A op 1,5 mm² onterecht geen.
2. **Een meervoudige contactdoos telt als meerdere.** De regel "maximaal 8 contactdozen per kring" telt de som van `aantal`. Het AREI telt enkelvoudige of meervoudige contactdozen: een dubbele doos is één. Vijf dubbele dozen geven nu een valse fout.
3. **Er is geen controle op het aantal kringen per differentieel.** Sinds 1 juni 2023 mogen achter elk differentieel van maximaal 30 mA hoogstens 8 eindstroombanen zitten. De editor stuurt de gebruiker er net naartoe: elk sjabloon kiest standaard het bestaande differentieel van 30 mA, dus een woning met twaalf kringen belandt ongemerkt achter één differentieel.
4. **Type AC wordt niet gemeld.** Het model laat klasse AC toe; dat type is niet meer toegelaten.
5. **De aardingsweerstand doet niets.** Bij een spreidingsweerstand boven 30 Ω gelden andere eisen: minstens twee differentiëlen van maximaal 30 mA met elk hoogstens 16 contactdozen, en de overige kringen achter maximaal 100 mA. De waarde staat al in Metingen maar geen regel gebruikt ze.
6. **Een laadpaal krijgt geen eigen controle** (differentieel van maximaal 30 mA, type B of type A met 6 mA DC-detectie; het veld `dcDetectie_mA` bestaat al).
7. **De aarding ontbreekt in een nieuw schema** en niets wijst erop. De onderdelen bestaan (aardingsonderbreker, aardelektrode) maar zitten achter "Meer…".
8. **Lengtes worden alleen voor de materiaallijst gebruikt.** Met tracélengte, doorsnede en beveiliging is de spanningsval van een kring te schatten (richtwaarden 3 % voor verlichting, 5 % voor de rest).

### Gebruiksgemak

1. **Selecteren vraagt mikken.** Alleen de getekende lijnen van een symbool zijn klikbaar; een klik net naast een automaat of leiding selecteert niets. (Door de gebruiker gemeld en in de review bevestigd.)
2. **Een nieuw project start leeg.** Een gewone woning opbouwen vraagt tien tot vijftien keer een sjabloon of onderdeel invoegen, terwijl de eerste opzet bijna altijd dezelfde is.
3. **Er zijn maar vijf sjablonen.** Vaatwasser, droogkast, oven, boiler, warmtepomp, laadpaal, zonnepanelen, keuken, buiten en aarding ontbreken.
4. **Kabeltype en doorsnede zijn vrije invoervelden** zonder voorstellen, net als de nominale stromen.
5. **De kringenlijst zegt niets over het bord zelf:** hoeveel modules, hoeveel kringen per differentieel, welke kast.
6. **Het aantal nog te plaatsen punten** staat alleen in de checklist, niet bij het tabblad Situatieschema.

## Doel, niet-doel, anti-doel

- **Doel:** een installateur tekent een gewone woning merkbaar sneller, en de bevindingen kloppen beter met het AREI zoals het sinds 2023 geldt.
- **Niet in dit plan:** fase per kring, openbare leeslink, schema-import uit scan, bulkbewerking, PDF-wijzigingen. Ze blijven in de backlog.
- **Anti-doel:** de indruk wekken dat nul bevindingen conformiteit betekent. De waarschuwingstekst en de voorlopige status blijven. Bestaande dossiers mogen niet stil van "volledig" naar "onvolledig" gaan door dit plan.

## Aanpakken

1. **Eén pakket rond de dagelijkse woning** (gekozen): raakvlakken, juiste en ruimere controles, meer sjablonen met een startwoning, bordoverzicht en invoerhulp. Alles zit in bestaande lagen (regels, sjablonen, afgeleide weergaven); het documentschema verandert niet, dus er is geen migratie en geen nieuwe clientcompatibiliteit nodig.
2. **Eerst de backlog van het marktonderzoek** (fase per kring, leeslink). Verworpen voor nu: het lost de gevonden fouten in de controles niet op, en beide raken het documentschema of de beveiliging en verdienen een eigen spec.
3. **Een wizard met ruimtes** (kamers kiezen, kringen genereren). Verworpen voor nu: veel groter, en een vaste startwoning die je daarna aanpast geeft het grootste deel van de winst.

Dit is mijn keuze, niet door de gebruiker bevestigd; de gebruiker vroeg zelfstandig door te werken met de aanbevolen keuzes.

## Ontwerp

### 1. Raakvlakken in het eendraadschema

`schemaStripSvg` (alleen de editor) zet in elke symboolgroep een onzichtbare rechthoek: het vak van het symbool, aan elke kant 1,5 mm ruimer en minstens 8 mm breed en hoog. Het situatieplan heeft zo'n raakvlak al. De afdruk (`schemaPaginaSvg`) verandert niet.

### 2. AREI-regels

| Regel | Ernst | Inhoud |
|---|---|---|
| `arei.kring.doorsnede-beveiliging` (aangepast) | fout | Tabel 1 met aparte grens voor zekering en automaat, tot 35 mm². |
| `arei.kring.max-contactdozen` (aangepast) | fout | Telt contactdoos-onderdelen, niet de som van `aantal`. |
| `arei.differentieel.max-stroombanen` | fout bij context nieuw, anders waarschuwing | Meer dan 8 kringen achter een differentieel van maximaal 30 mA dat niet het algemene is. |
| `arei.differentieel.type-ac` | fout bij nieuw, anders waarschuwing | Klasse AC. |
| `arei.aarding.spreidingsweerstand` | fout bij nieuw, anders waarschuwing | Alleen als de ingevulde aardingsweerstand boven 30 Ω ligt: minder dan twee differentiëlen ≤ 30 mA, meer dan 16 contactdozen (een vast toestel telt als één) achter één ervan, of een kring zonder differentieel ≤ 100 mA naast het algemene. |
| `arei.laadpaal.differentieel` | fout / waarschuwing | Geen differentieel ≤ 30 mA: fout. Wel, maar geen type B en geen DC-detectie ≤ 6 mA: waarschuwing. |
| `arei.verlichting.min-kringen` | waarschuwing | Er zijn lichtpunten maar ze zitten allemaal op één kring. Uit vakkennis, nog te toetsen aan de tekst. |
| `arei.contactdoos.uitvoering` | waarschuwing, alleen bij nieuw | Contactdoos zonder randaarde of zonder kinderbeveiliging. |
| `arei.aarding.niet-getekend` | info | Er zijn kringen maar geen aardingsonderbreker of geen aardelektrode in het schema. |
| `arei.kring.spanningsval` | info | Alleen als elke leiding van de kring een lengte heeft: ΔU = k · L · In · ρ / S met ρ = 0,0225 Ω·mm²/m, k = 2 (tweepolig) of √3 (drie- of vierpolig), tegenover 230 V of 400 V. Boven 3 % (kring met alleen verlichting) of 5 % volgt de melding, met de berekende waarde. Een richtwaarde, geen AREI-eis. |

De regel over de aardingsweerstand beoordeelt de meting niet (geen "goed" of "slecht"); hij past de eisen toe die van die waarde afhangen. Dat schuift wel op tegenover de eerdere keuze "metingen worden alleen geregistreerd" en staat daarom apart in de PR.

De aarding komt als info-bevinding en niet in de dossierchecklist, zodat geen bestaand dossier zijn status "volledig" verliest.

### 3. Sjablonen en startwoning

- Nieuwe sjablonen: vaatwasser, droogkast, oven, boiler, warmtepomp, laadpaal, zonnepanelen, keuken (contactdozen werkblad), buiten (waterdichte contactdozen en een lichtpunt), aarding. Waarden als voorinstelling, zoals de bestaande.
- **Startwoning:** één actie die in een schema zonder kringen een gewone woning zet, als één stap voor ongedaan maken: aarding; een differentieel van 30 mA met twee kringen verlichting, twee kringen contactdozen en de keuken; een tweede van 30 mA met badkamer, wasmachine, droogkast en vaatwasser; kookplaat en oven rechtstreeks op het bord. Geen enkele bevinding met ernst fout in de context nieuw. De gratis limiet blijft gelden via de bestaande limietcontrole.
- **Slimme bestemming:** staat het voorgestelde differentieel van 30 mA al op 8 kringen, dan stelt het invoegvenster een nieuw differentieel voor, en de keuzelijst toont de bezetting ("6 van 8 kringen").
- Het paneel groepeert de sjablonen (Kringen, Toestellen, Installatie) zodat de lijst overzichtelijk blijft.

### 4. Bordoverzicht en invoerhulp

- **Bordoverzicht** boven de kringenlijst, per verdeelbord: aantal kringen, modules (één per pool van elke automaat, zekering en differentieel in dat bord), een voorstel voor de kast (rijen van 18 modules met ongeveer 20 % reserve) en per differentieel de bezetting. Indicatief; staat erbij.
- **Voorstellen** bij kabeltype, doorsnede, nominale stroom en gevoeligheid; vrije invoer blijft mogelijk.
- **Teller** bij het tabblad Situatieschema: het aantal onderdelen dat nog niet op een plan staat.

## Beperkingen

- Clean room: eigen tekst, eigen code, geen namen van andere tools.
- Elke nieuwe tekst in nl, fr en en; AREI-berichten in `packages/arei/src/berichten`, schermtekst in `apps/web/i18n/locales`.
- Geen wijziging aan het documentschema, de PDF of de server.
- Tests draaien nooit tegen de echte database.

## Overgelaten aan de bouwer

De precieze vorm van het bordoverzicht en van de sjablonengroepen, de bewoording van de berichten binnen de woordenlijst van `docs/vertalingen.md`, en de keuze van het invoercomponent voor de voorstellen.
