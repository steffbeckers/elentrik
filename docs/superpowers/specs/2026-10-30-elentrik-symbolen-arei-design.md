# Elentrik: symbolen volgens het AREI en het symbolenvenster (ontwerp)

- **Datum:** 2026-10-30
- **Status:** goedgekeurd
- **Bron:** AREI, Boek 1, Deel 2, hoofdstuk 2.13, tabel 2.23 "Grafische symbolen" (FOD Economie, `Symboles-nl.pdf`, blz. 40 tot 47). Verder in dit document "de tabel". Rubrieken worden aangeduid met hun letter: A Algemeenheden, B Elektrische toestellen, C Elektrische leidingen, D Beschermingstoestellen, E Schakelaars, F Contactdozen, G Gebruikstoestellen, H Bronnen.
- **Beslist met de gebruiker:**
  - elk symbool volgt de tabel ("alles moet volgens het AREI");
  - een symbolenvenster in de editor, alleen voor aangemelde gebruikers, met kaarten per onderdeel;
  - in dat venster zet je opties vrij aan en uit, zie je alle combinaties en kies je er een om te tekenen;
  - de opdeling in drie stappen (dit ontwerp is stap 1);
  - de differentieel volgens het voorbeeld uit de tabel (§6).
- **Mijn keuzes:** gemarkeerd met *(mijn keuze)*.

## 1. Waarom

Elentrik tekent een eendraadschema en een situatieschema voor de AREI-keuring. Een keurder en een elektricien lezen die tekeningen met de symbolen uit de tabel in hun hoofd. Een review van `packages/symbols` tegen de tabel toonde dat de meeste symbolen afwijken. Het lichtpunt is een ⊗ in plaats van een ×, de wisselschakelaar ziet eruit als een omschakelaar, de drukknop is een schakelaar met een streepje, en de toestellen dragen afkortingen in plaats van de pictogrammen uit de tabel. Een schema dat er "bijna AREI" uitziet, is voor een keurder een reden tot opmerkingen.

Daarnaast wil de gebruiker tijdens het tekenen één plek waar je alle symbolen en hun varianten ziet, met uitleg. Daar kies je ook meteen de juiste variant (bv. een contactdoos met randaarde en kinderbescherming) om toe te voegen. Voor de gebruiker zelf is dat ook de plek om na te kijken of elk symbool klopt.

Het geheel bestaat uit drie stappen, elk met een eigen ontwerp en eigen PR:
1. **Dit ontwerp:** de bestaande symbolen volgens de tabel, en het symbolenvenster.
2. **Later:** de symbolen uit de tabel die Elentrik nog niet kent (zie §7). Die vragen nieuwe velden of nodetypes in het model.
3. **Later:** symbolen aanvragen, tijdelijk een eigen afbeelding gebruiken, en symbolen beheren.

## 2. Doelen, niet-doelen en anti-doelen

**Doelen**
1. Elk symbool dat `tekenSymbool` vandaag tekent, ziet eruit zoals in de tabel (§3). Dat geldt in het eendraadschema, in het situatieschema en in de pdf, want die gebruiken allemaal `tekenSymbool`.
2. De labels van de beveiligingen volgen de notatie uit de tabel (§3.4).
3. Een symbolenvenster in de editor (§4):
   - kaarten per categorie;
   - per kaart het symbool, de uitleg en de AREI-verwijzing;
   - alle combinaties van de opties die het symbool veranderen;
   - opties vrij aan- en uitzetten met een live voorbeeld;
   - een knop die de gekozen variant het actieve onderdeel maakt.
4. Het onderdelenpaneel toont per knop een klein symbool van de variant die nu actief is.

**Niet-doelen**
- Nieuwe nodetypes of nieuwe modelvelden. Wandlichtpunt, autonome noodverlichting, tweepolige schakelaar, aarding, de plaatsing van een leiding enzovoort horen bij stap 2 (§7).
- Eigen afbeeldingen, aanvragen of beheer van symbolen (stap 3). Het venster mag die later wel kunnen opnemen. Een kaart is een eigen component, en de lijst met kaarten komt uit één bron (§4.1).
- Een publieke pagina of een pagina buiten de editor.
- Al geëxporteerde pdf's aanpassen. Die blijven zoals ze zijn; een nieuwe export gebruikt de nieuwe symbolen.

**Anti-doelen** (dit zou mislukken, ook als het technisch werkt)
- Een symbool dat er "ongeveer" uitziet zoals de tabel, maar dat een keurder anders leest. Bij twijfel volgt de bouwer de tabel en vraagt hij het na (§6).
- Trager tekenen. Het venster is een extra weg. De knoppen in het onderdelenpaneel, de sneltoetsen en de + in het schema blijven werken zoals nu, en het venster is nooit verplicht.
- Een symbool dat breder wordt dan een kolom toelaat (`breedte <= KOLOM_BREEDTE_MM - 4`, nu 20 mm), of een tekst die niet rechtop staat.

## 3. De symbolen

### 3.1 Algemene regels

- **Richting.** Het schema groeit naar boven en de voeding komt van onder (`in` onderaan, `uit` bovenaan, beide op `x = breedte / 2`). Waar de tabel een toevoerleiding tekent (meestal van links), komt die in Elentrik van onder. Elk symbool wordt dus gedraaid zodat de toevoer van onder komt. De lijn loopt verder naar `uit` als er een volgende node volgt, zoals bij de meervoudige contactdoos in de tabel (F), waar de lijn door de bogen loopt.
- **Tekst.** Tekst staat altijd rechtop. Een letter uit de tabel (h, t, M, kWh) blijft een letter.
- **Maat.** Lijndikte en tekstgrootte blijven zoals nu (`LIJNDIKTE_MM`, `TEKSTGROOTTE_MM`). De bouwer kiest de afmetingen binnen de kolombreedte. Elk symbool blijft binnen zijn `maat`, zodat de bestaande tests (`buitenVak`, `raakt`, `nietRechtop`) blijven gelden.
- **Clean room.** Er wordt getekend naar de tabel, die een officiële regeltekst is. Er wordt niets overgenomen uit andere software.
- **Rollen.** De bestaande `data-rol`-attributen blijven waar het element blijft (bv. `randaarde`, `kinderbeveiliging`, `aantal`), zodat tests en de editor ze kunnen terugvinden. Nieuwe elementen krijgen een eigen rol (bv. `waterdicht` voor de letter h, `hendel-haak`).

### 3.2 Voeding (A, G)

| Type | Nu | Volgens de tabel |
|---|---|---|
| aansluiting | cirkel met de tekst "~" | Geen eigen symbool in de tabel. Een cirkel met het wisselstroomsymbool uit rubriek A (een sinus, getekend als pad, niet als tekst) *(mijn keuze)*. Het aantal fasen (1 of 3 vóór de sinus, A) wordt niet getoond: `tekenSymbool` krijgt alleen de node, niet het stroomtype van het document *(mijn keuze)*. |
| teller | rechthoek met "kWh" | De kWh-teller uit G: een rechthoek met een smalle band bovenaan (een horizontale lijn vlak onder de bovenrand) en "kWh" eronder. |

### 3.3 Verdeling en leiding (B, C)

| Type | Nu | Volgens de tabel |
|---|---|---|
| verdeelbord | rechthoek met een lijn in het bovenste deel | De algemene voorstelling uit B: een gewone rechthoek, zonder binnenlijn. De rail die de layout tekent, blijft (het voorbeeld met 5 leidingen in B toont net zo de leidingen die uit het bord vertrekken). |
| leiding | een lijn | Blijft een lijn (C, algemeen symbool). Plaatsing en het aantal geleiders als streepjes horen bij stap 2. Het label (`XVB 3G2,5`) blijft. |

### 3.4 Beveiliging (D)

| Type | Nu | Volgens de tabel |
|---|---|---|
| zekering | smalle rechthoek met een lijn erdoor | Klopt al. Blijft. |
| automaat | contact met een kruisje op het vaste contact, poolstreepjes | De automatische schakelaar uit D: een lijn van `in` naar het scharnierpunt, een schuin contact met een **zwart blokje** op het vrije uiteinde, een onderbreking, en de lijn van het vaste contact naar `uit`. Geen kruisje en geen poolstreepjes. In de tabel betekenen schuine streepjes op een lijn "aantal geleiders" (C), en het aantal polen is een kenmerk in de tekst (D). |
| differentieel | contact plus een rechthoekje met "ΔI" | Hetzelfde contact als de automaat, zoals het voorbeeld "Differentieelstroombeschermingsinrichting" in D. Het verschil zit in het label (hieronder). De gebruiker koos deze vorm boven de vorm met ringkern. Het rechthoekje met ΔI vervalt. |

**Labels** (`beveiligingLabel` in `packages/layout/src/labels.ts`), naar de voorbeelden in D *(mijn keuze voor de precieze vorm)*:
- **automaat:** de curve en de stroom aaneen, zoals "C20" in D. Bij meer dan één pool volgt het aantal polen: "C20 2P". Bij één pool staat er geen aanduiding.
- **differentieel:** "In/ΔIn A type X", zoals "40/0.3A type A" in D, met de stroom in A. Bij 30 mA wordt dat "40/0,03A type A". Het decimaalteken is een komma, zoals nu bij de doorsnede. Het aantal polen volgt op dezelfde manier als bij de automaat ("40/0,03A type A 4P").
- **zekering:** blijft "16 A". Het model kent geen zekeringtype (gG), dus dat ontbreekt.

Een label moet in de kolom passen. Is het te breed, dan breekt de layout het af zoals nu (de bestaande labeltests gelden).

### 3.5 Punten (E, F, G)

**Contactdoos** (F). De voeding komt van onder en raakt de boog aan de **bolle** kant. De boog opent dus naar boven, naar `uit`. De lijn loopt door de boog verder naar `uit`.
- **randaarde** (contact voor beschermingsgeleider): een horizontale streep die de boog aan de bolle kant raakt, iets breder dan de boog.
- **kinderbeveiliging:** aan beide uiteinden van de boog een kort horizontaal streepje naar buiten.
- **waterdicht** (half-waterdicht, waterdicht of hermetisch): de letter **h** rechts naast de boog. De gevulde driehoek vervalt.
- **aantal > 1:** de tweede vorm uit F, één boog met een klein schuin streepje en het getal ernaast. Dat geldt voor elk aantal, ook voor 2 en 3, zodat de maat vast blijft *(mijn keuze)*. De tekst "3×" links vervalt.
- Opties combineren vrij, zoals in F ("met beschermingsgeleider en met kinderbescherming").

**Lichtpunt** (G). De tabel tekent een lichtpunt als een **×** aan het einde van de toevoerleiding, zonder cirkel; de ⊗ is in de tabel een verklikker- of signalisatielamp. De lijn loopt van `in` naar het midden van het kruis en verder naar `uit`.
- **standaard:** ×.
- **tl:** het fluorescentieverlichtingstoestel uit G, een lijnstuk met korte dwarse streepjes aan beide uiteinden. Het lijnstuk ligt dwars op de leiding, en de leiding raakt het in het midden *(mijn keuze voor de ligging)*.
- **spot:** de projector uit G, een ⊗ met een boog aan de kant van de voeding. Zonder pijlen, want het model kent geen bundelsoort.
- **noodverlichting:** het veiligheidsverlichtingstoestel uit G, een × met een gevulde stip in het midden.
- **led:** staat niet in de tabel. Een × met de tekst "LED" ernaast *(mijn keuze)*.
- **aantal > 1:** de tekst "n×" blijft. De tabel heeft geen aantal voor lichtpunten (alleen "drie fluorescentiebuizen", stap 2).

**Schakelaar** (E). Een kleine cirkel met een hendel. De lijn komt van `in` naar de cirkel en loopt van de cirkel verder naar `uit`. De hendel wijst van de voeding weg, schuin naar rechtsboven, zoals in de tabel *(mijn keuze voor de richting; nu wijst hij naar rechtsonder)*. Een **haak** is een kort streepje aan het uiteinde van een hendel, haaks erop en naar buiten gericht, zoals bij de wisselschakelaar in E.
- **enkel:** het algemene symbool, één hendel zonder haak.
- **dubbel:** de dubbele schakelaar (serieschakelaar), die twee kringen afzonderlijk bedient vanop één plaats. In de tabel is dat de "eenpolige omschakelaar (dubbele aansteking)". Twee hendels in een V, beide aan de kant van `uit`, elk met een haak.
- **wissel:** de eenpolige wisselschakelaar, twee hendels in tegengestelde richting door de cirkel (rechtsboven en linksonder), elk met een haak.
- **kruis:** de kruisschakelaar, vier hendels in een X, elk met een haak.
- **dimmer:** één hendel met een klein open driehoekje (vlagje) op het uiteinde, zoals in E.
- **drukknop:** de drukknop uit E, een cirkel met een kleinere cirkel erin, **zonder hendel**. De lijn loopt van `in` naar de buitenste cirkel en van de buitenste cirkel naar `uit`.
- **waterdicht:** de letter **h** rechts naast het symbool, zoals bij de contactdoos *(mijn keuze; de tabel geeft geen aparte waterdichte schakelaar)*. De gevulde driehoek vervalt.

De hendels mogen de lijn naar `in` en naar `uit` niet raken, op de cirkel na. De bouwer kiest de hoeken en de lengtes zodat dat lukt. Een tweede hendel aan dezelfde kant valt minstens 30° naast de lijn.

**Toestel** (G, H). Een vierkant zoals het "vast elektrisch huishoudtoestel, algemeen symbool" uit G. De toevoer komt van onder en de lijn loopt van de bovenrand naar `uit`. In het vierkant staat het pictogram uit de tabel:

| soort | pictogram in het vierkant |
|---|---|
| andere | leeg (het algemene symbool) |
| wasmachine | een cirkel met een gevulde stip erin |
| droogkast | ∞ bovenaan, een gevulde stip eronder |
| vaatwasser | de twee diagonalen met een cirkel in het midden |
| kookplaat | drie gevulde stippen (twee boven, één rechtsonder) |
| oven | een band bovenaan (zoals bij de teller) en een gevulde stip in het midden |
| boiler | geen vierkant: een cirkel met verticale arcering (G, "Boiler") |
| laadpaal | de laadinrichting voor elektrische wegvoertuigen uit G, vereenvoudigd: een rechthoekige zuil met een schermpje bovenaan, een voet, en rechts een kabel met stekker. Het blijft binnen de maat van een toestel *(mijn keuze voor de vereenvoudiging)*. |
| omvormer | de omvormer DC → AC uit H: een vierkant met een diagonaal van linksonder naar rechtsboven, linksboven het gelijkstroomteken (volle lijn boven een stippellijn), rechtsonder het wisselstroomteken (sinus) |
| warmtepomp | staat niet in de tabel: het algemene vierkant met de tekst "WP" *(mijn keuze)* |

`TOESTEL_AFKORTINGEN` blijft bestaan zolang iets anders het gebruikt (bv. het situatieschema of de editor). Anders vervalt het, behalve voor de warmtepomp.

### 3.6 Gevolgen

- **Geen migratie.** Een symbool volgt uit de node, dus bestaande projecten tonen de nieuwe symbolen vanzelf, zowel in het schema als op het situatieschema.
- **Snapshots.** De snapshots in `packages/symbols` en `packages/render` veranderen bewust en worden opnieuw opgenomen. De bouwer kijkt elk verschil na.
- **Situatieschema.** Het situatieschema gebruikt dezelfde symbolen op een andere schaal (`SYMBOOL_DELER`). De bouwer kijkt na of de nieuwe symbolen daar leesbaar blijven, vooral de kleine details (haak, h, voetjes).

## 4. Het symbolenvenster

### 4.1 Eén bron voor de kaarten

Er komt één beschrijving van alle kaarten, puur en zonder Vue, zodat de editor en de tests ze delen. Per kaart:
- het nodetype en de categorie;
- of het onderdeel te kiezen is;
- de vertaalsleutels voor naam en uitleg;
- de AREI-verwijzing (de rubriek uit de tabel);
- de **visuele velden**: de velden die het symbool veranderen, met hun mogelijke waarden.

| categorie | kaart | kiesbaar | visuele velden en combinaties |
|---|---|---|---|
| Punten | contactdoos | ja | randaarde × kinderbeveiliging × waterdicht = 8 combinaties; aantal apart (niet in het raster) |
| Punten | lichtpunt | ja | soort: 5 |
| Punten | schakelaar | ja | soort (6) × waterdicht (2) = 12 |
| Punten | toestel | ja | soort: 10 |
| Leidingen en borden | leiding | ja | geen |
| Leidingen en borden | verdeelbord (onderbord) | ja | geen |
| Beveiliging | differentieel | ja | geen (de polen staan in het label) |
| Beveiliging | zekering | ja | geen |
| Beveiliging | automaat | nee: komt automatisch met een nieuwe kring | geen |
| Voeding | aansluiting, teller | nee: staan in elk schema | geen |

De velden die alleen het label veranderen (stroom, curve, kabeltype, …) staan niet in het venster. Die vul je in het eigenschappenpaneel in. Een test controleert dat elk nodetype precies één kaart heeft. Die test faalt bij een nieuw nodetype zonder kaart, zoals `alle-types.test.ts` nu doet voor symbolen.

### 4.2 Openen en opbouw

- **Openen.** In het onderdelenpaneel, onder de onderdelen, komt een knop "Alle symbolen". *(Mijn keuze:)* er komt ook een sneltoets, een vrije toets die de bouwer kiest en in de sneltoetsenlijst opneemt. Het venster is groot, over de editor heen (de bestaande modale component van de app).
- **Bovenaan** staat een zoekveld. Het zoekt in de naam, in de uitleg en in de namen van de varianten, in de huidige taal.
- **Links** staan de kaarten, gegroepeerd per categorie (tabel in §4.1). Een kaart toont:
  - het symbool in de standaardvariant (`STANDAARD` uit het model);
  - de naam en één zin uitleg;
  - de AREI-verwijzing, bv. "AREI tabel 2.23, F. Contactdozen".

  Een kaart die niet te kiezen is, toont waarom (bv. "Komt automatisch met een nieuwe kring").
- **Rechts** staat de geopende kaart:
  - een groot voorbeeld dat live meetekent;
  - per visueel veld een bediening: een schakelaar voor ja of nee, een keuze voor een soort;
  - voor de contactdoos en het lichtpunt ook het aantal *(mijn keuze: beide hebben `aantal` in het model)*;
  - daaronder een **raster met alle combinaties** van de visuele velden (§4.1), elk als klein symbool met een korte naam (bv. "randaarde, kinderbescherming"). Een klik op een combinatie zet de bediening op die waarden. De combinatie die bij de bediening hoort, is gemarkeerd.
- **Kiezen.** De knop "Kiezen en tekenen" maakt die variant het actieve onderdeel en sluit het venster. Daarna voeg je toe met de + in het schema of met Enter bij een selectie, zo vaak als je wil, zoals nu. Een dubbelklik op een combinatie in het raster doet hetzelfde *(mijn keuze)*.
- **Alleen-lezen.** Is de editor alleen-lezen, dan kan je het venster openen en alles bekijken, maar is kiezen uitgeschakeld, zoals de knoppen in het onderdelenpaneel nu.
- **Toegankelijkheid.** Het venster is met het toetsenbord te bedienen. Elke combinatie is een knop met een tekstlabel, zodat het niet alleen visueel is.

### 4.3 De gekozen variant in de editor

- **Voorinstelling.** De editor-store kent nu `onderdeel` en `toestelsoort`. Dat wordt `onderdeel` plus een **voorinstelling** per onderdeel: de waarden van de visuele velden, en het aantal bij de contactdoos. De bestaande `toestelsoort` wordt een deel van die voorinstelling. De keuzelijst "Toestelsoort" in het onderdelenpaneel blijft werken en werkt dezelfde voorinstelling bij.
- **Toevoegen.** Bij het toevoegen wordt de voorinstelling over `STANDAARD[onderdeel]` gelegd. `voegToe`, `magToevoegen` en de toevoeglogica in het model krijgen de voorinstelling in plaats van alleen de toestelsoort. De bestaande regels (wat waar mag) veranderen niet. Een voorinstelling bevat alleen visuele velden, dus ze kan nooit een structuurveld overschrijven.
- **Onthouden.** De voorinstelling per onderdeel blijft bewaard zolang de editor open is, niet over sessies heen *(mijn keuze)*. Kies je het onderdeel opnieuw met zijn knop of sneltoets, dan blijft de laatst gekozen variant actief *(mijn keuze; zo werkt de toestelsoort nu ook)*. Een kleine knop "standaard" naast de actieve variant zet ze terug.
- **Onderdelenpaneel.** Elke knop krijgt links een klein symbool van de huidige voorinstelling van dat onderdeel. Wijkt de voorinstelling af van de standaard, dan staat er een korte tekst onder (bv. "waterdicht").

### 4.4 Teksten

Alle nieuwe teksten komen in nl, fr en en (de pariteitstest):
- categorieën;
- naam en uitleg per kaart;
- namen van de varianten;
- de AREI-verwijzing;
- knoppen en meldingen.

De Franse AREI heet RGIE. De verwijzing wordt daar "RGIE tableau 2.23", met de Franse rubrieknamen uit de officiële Franse tekst. Waar er geen officiële Engelse tekst is, vertaalt de bouwer de rubrieknamen zelf, volgens `docs/vertalingen.md`. Namen van opties die al in de vertaalbestanden staan (bv. `velden.soort.opties.wissel`), worden hergebruikt.

## 5. Testen en controle

- **Symbolen.**
  - Per symbool en per variant controleren tests met `data-rol` dat de onderdelen uit §3 aanwezig zijn, of juist ontbreken: geen kruisje meer bij de automaat, geen hendel bij de drukknop, een h bij waterdicht, enzovoort.
  - De bestaande vormtests blijven gelden: binnen de maat, goedgevormd, tekst rechtop en kolombreedte.
- **Labels.** De nieuwe notatie wordt getest, met één en meer polen en met 30 en 300 mA.
- **Venster.**
  - Unit-tests op de bron uit §4.1: elk type heeft één kaart, en de combinaties zijn volledig (8, 12, 5, 10).
  - Een e2e-test:
    1. venster openen;
    2. een contactdoos met randaarde en kinderbescherming kiezen via de combinaties;
    3. "Kiezen en tekenen";
    4. toevoegen met de +;
    5. de nieuwe node heeft die waarden.
  - Een tweede e2e-test controleert dat de sneltoets en het venster in alleen-lezen geen wijziging toelaten.
- **Visuele controle door de gebruiker.** Vóór de PR maakt de bouwer een overzicht met elk symbool en elke variant naast de overeenkomstige rij uit de tabel, en legt hij dat aan de gebruiker voor. Dat kan een schermafdruk van het venster zijn. De gebruiker keurt het visueel goed. Een test kan niet zien of een symbool "zoals het AREI" leest.
- E2e en tests raken nooit de echte database (zoals altijd).

## 6. Beslist na de review

1. **Differentieel.** De tabel toont twee vormen: het voorbeeld "Differentieelstroombeschermingsinrichting" (het automaatcontact met een label) en de algemene vorm met een ringkern rond de geleider. De gebruiker koos het voorbeeld (§3.4).
2. **Richting van de contactdoos.** De gebruiker koos de richting van de tabel: de bolle kant naar de voeding (§3.5).

## 7. Stap 2 (niet in dit ontwerp, ter oriëntatie)

Symbolen uit de tabel die Elentrik nog niet kent:
- **Verlichting (G):**
  - wandlichtpunt;
  - autonome veiligheidsverlichting;
  - verlichtingstoestel met ingebouwde schakelaar;
  - meerdere fluorescentiebuizen;
  - projector met bundelsoort.
- **Schakelaars (E):**
  - twee- en driepolige schakelaar;
  - schakelaar met verklikkerlamp;
  - schakelaar met signalisatielamp;
  - trekschakelaar;
  - schakelaar met vertraagde opening;
  - drukknop met verklikkerlamp;
  - drukknop met afgeschermde toegang;
  - tijdschakelaar en schakelklok;
  - impulsschakelaar;
  - thermostaat;
  - bewegingssensor.
- **Contactdozen (F):**
  - met schakelaar;
  - met vergrendelingschakelaar;
  - met beschermingstransformator;
  - datacontactdoos.
- **Toestellen (G):**
  - microgolf, koelkast, diepvriezer;
  - verwarmingstoestel (met of zonder accumulatie of ventilator);
  - boiler met accumulatie;
  - ventilator, motor;
  - bel, zoemer, hoorn, sirene;
  - deurslot.
- **Aarding en verdeling (B, D):**
  - aardelektrode;
  - aardingsonderbreker;
  - doos en aftakdoos;
  - aftakkast.
- **Leidingen (C):**
  - plaatsing (in of op de wand, in een buis, ondergronds, luchtleiding), waarvoor het model al `plaatsing` heeft;
  - het aantal geleiders als streepjes.
- **Bronnen (H):**
  - transformator;
  - fotovoltaïsch paneel;
  - gelijkrichter;
  - hakker.
- **Domotica (J).**

## 8. Wat aan de bouwer is

- De exacte maten, hoeken en posities binnen de regels van §3.1.
- De bestandsindeling van de bron uit §4.1, en waar die staat. Die is puur en zonder Vue, bijvoorbeeld in `apps/web/app/editor/`. In `packages/symbols` mag ook, als ze daar zonder vertalingen kan.
- De keuze van de sneltoets voor het venster.
- De opmaak van het venster, binnen de bestaande Nuxt UI-componenten van de app en het gekozen ontwerp (kaarten links, geopende kaart rechts).
