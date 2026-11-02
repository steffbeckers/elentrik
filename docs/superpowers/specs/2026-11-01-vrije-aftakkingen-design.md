# Vrij opbouwbare aftakkingen in het eendraadschema

Status: goedgekeurd en geïmplementeerd op 2026-11-01; tests, browsertest en PDF-export gecontroleerd.

## Doel en bevestigde vraag

De gebruiker wil een eendraadschema kunnen tekenen zoals op de aangeleverde
afbeelding: een verticale kringleiding met horizontale aftakkingen waarop een
schakelaar en lamp, of twee wisselschakelaars en een lamp, naast elkaar staan.
De gebruiker heeft gekozen voor **vrij opbouwen met losse schakelaars en lampen**.

De onderstaande bediening, nummering en technische afbakening zijn opgenomen
in het door de gebruiker goedgekeurde ontwerp.

## Benaderingen

1. Vrij opbouwen: aftakkingen maken en afzonderlijke symbolen eraan toevoegen.
   Dit geeft de gewenste vrijheid, maar vraagt uitbreiding van model, bediening
   en automatische opmaak. Door de gebruiker gekozen.
2. Vaste combinaties: voorgedefinieerde schakelaar/lamp- en wisselschakelingen.
   Dit gaat sneller bij herhaald invoegen, maar beperkt afwijkende combinaties.
3. Beide: vrije opbouw met snelkoppelingen voor combinaties. Dit kan later op
   dezelfde basis, maar valt buiten deze eerste uitvoering.

## Bediening en zichtbaar resultaat

- Selecteer een kringleiding en kies **Aftakking toevoegen**. Het gekozen losse
  onderdeel wordt het eerste symbool van de nieuwe aftakking. Voor deze
  uitbreiding zijn dat schakelaars of lichtpunten.
- De kringleiding loopt verticaal; de eerste aftakking staat onderaan, de
  volgende erboven. Een aftakking loopt van links naar rechts.
- Een plus aan het rechteruiteinde voegt het gekozen onderdeel aan die
  aftakking toe. Een afzonderlijke actie aan de kringleiding maakt een nieuwe
  aftakking. Beide acties moeten duidelijk te onderscheiden zijn, met
  toegankelijke namen en toetsenbordbediening.
- De bestaande symboolkeuze bepaalt de schakelaarsoort: enkel, wissel, kruis,
  dimmer enzovoort. Twee wisselschakelaars zijn twee afzonderlijke symbolen.
- Een lichtpunt kan via de bestaande eigenschap `aantal` bijvoorbeeld twee
  lampen voorstellen. Afzonderlijke lichtpunten op dezelfde aftakking zijn
  eveneens mogelijk en blijven afzonderlijk selecteerbaar.
- Een aftakking met alleen een schakelaar is toegestaan tijdens het tekenen,
  zoals de bovenste aftakking in het voorbeeld.
- Elk symbool behoudt zijn eigenschappenpaneel. Toevoegen, wijzigen en
  verwijderen gebruiken de bestaande opslag en undo/redo.

## Nummering en betekenis

Eén expliciete aftakking krijgt één puntreferentie, bijvoorbeeld A1. De volgende
aftakkingen krijgen A2 en A3. In het eendraadschema verschijnt die referentie
eenmaal, bij het begin van de aftakking. Alle schakelaars en lichtpunten van die
aftakking delen die referentie op het situatieschema en in de kringenlijst.

De onderdelen behouden elk hun eigen node-id, plaatsing, selectie en
controlebevindingen. Fysieke aantallen lampen en schakelaars blijven afzonderlijk
meetellen; gedeelde nummering mag die tellingen niet reduceren. De kringenlijst
behoudt haar afzonderlijke rijen per onderdeel, met dezelfde puntreferentie voor
onderdelen van dezelfde aftakking.

Dit is een eendraadsweergave van de samenhang. Het is geen simulatie of schema
van afzonderlijke fase-, nul- of wisseldraden. Nieuwe regels die de werking van
een wissel- of kruisschakeling beoordelen vallen buiten deze uitbreiding.

## Integratie en grenzen

De bestaande boom ondersteunt meerdere kinderen en ketens van schakelaars en
lichtpunten. `voegOnderdeelToe` biedt momenteel alleen kring- en railuiteinden;
`maakStrook` zet alle ketens verticaal en splitst kinderen over kolommen.
`leidAnalyseAf` nummert momenteel elk individueel punt.

De nieuwe aftakkingen moeten expliciet in het document herkenbaar zijn, zodat
hun horizontale opmaak en gezamenlijke nummering betrouwbaar bewaard blijven.
De precieze representatie en benodigde schemaversie/migratie zijn aan de bouwer.
Bestaande documenten blijven leesbaar en behouden hun huidige indeling en
nummering; bestaande ketens worden niet stilzwijgend tot aftakkingen omgevormd.
Een nieuwe aftakking mag aan een bestaande kringleiding worden toegevoegd.

Een aftakking is voor deze uitvoering één horizontale reeks schakelaars en
lichtpunten. Vertakken binnen een aftakking, vrije lijntekening en het omzetten
van bestaande verticale ketens vallen buiten de eerste uitvoering. Verwijderen
van een tussensymbool verbindt de resterende reeks weer door; verwijderen van
de volledige aftakking ruimt ook bijhorende situatieplaatsingen op. Verwijderen
van het laatste symbool laat geen onzichtbare genummerde aftakking achter.

De layout reserveert ruimte voor de volledige breedte en hoogte van de
aftakkingen, inclusief nummers, aantallen en aanknopingspunten. Symbolen en
teksten moeten leesbaar blijven; alleen het roteren van de huidige SVG met
meedraaiende tekst is onvoldoende. Selectiekaders en plusknoppen volgen de
daadwerkelijke positie. Lange aftakkingen gebruiken de bestaande paginering en
vervolgmarkeringen, zonder symbolen door te snijden.

Canvas en PDF gebruiken dezelfde opmaak. Losse situatieplaatsingen behouden
hun eigen rotatie en positie. Nieuwe UI-teksten volgen de bestaande Nederlandse,
Franse en Engelse vertalingen. Alleen-lezen verhindert alle nieuwe mutaties.

## Controleerbare acceptatiecriteria

1. Bouw vrij een aftakking met een enkelvoudige schakelaar en een lichtpunt met
   aantal 2; ze staan horizontaal en delen één puntnummer.
2. Bouw op dezelfde kringleiding een tweede aftakking met twee
   wisselschakelaars en één lamp; alle drie staan op dezelfde horizontale lijn.
3. Voeg een derde aftakking met alleen een schakelaar toe. De drie aftakkingen
   staan van onder naar boven en hebben opeenvolgende puntnummers.
4. Selecteer en bewerk elk afzonderlijk symbool; voeg nog een onderdeel toe aan
   een bestaande aftakking zonder daardoor een nieuwe aftakking te maken.
5. Verwijder een tussensymbool, een hele aftakking en het laatste symbool van
   een aftakking. Undo/redo herstelt structuur, nummering en situatieplaatsingen.
6. Opslaan en opnieuw openen bewaart alle aftakkingen. Bestaande documenten
   behouden hun oude opmaak en referenties.
7. Situatieschema, kringenlijst en PDF tonen consistente referenties en fysieke
   aantallen. Brede of veelvuldige aftakkingen overlappen aangrenzende kringen
   niet; PDF-paginering behoudt alle symbolen en verbindingen.
8. Model-, analyse-, symbolen-, layout- en editorintegratietests dekken deze
   gevallen; relevante bestaande tests en typecontrole blijven slagen.
