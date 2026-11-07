# Backlog: de proefperiode herbekijken

Op 7 november 2026 is de proefperiode van Elentrik vergeleken met hoe vergelijkbare Belgische tools voor eendraadschema's en situatieplannen een gratis instap aanbieden. Dit document vat de vaststellingen samen in eigen woorden, zonder namen, teksten of schermontwerpen van andere software (clean room). Een wijziging volgt de gewone werkwijze: brainstorm, spec, plan.

## Hoe het vandaag werkt

Zie de abonnementenspec `docs/superpowers/specs/2026-10-23-elentrik-abonnementen-design.md`.

- Het eerste bedrijf dat iemand zelf aanmaakt, krijgt 30 dagen gratis, te rekenen vanaf de aanmaak. Er is geen betaalkaart nodig.
- Tijdens de proefperiode werkt alles, ook de PDF-export zonder enige markering.
- Na de proefperiode, zonder abonnement, kan je projecten nog lezen en exporteren, maar niet meer bewerken.
- Wie tijdens de proefperiode een abonnement neemt, betaalt pas vanaf het einde ervan.

## Wat de markt doet

De prijzen zijn ruwe bedragen, gevonden op 7 november 2026, exclusief btw tenzij anders vermeld. Ze zijn nog na te kijken.

- **Een proef die na een vaste tijd afloopt, is de uitzondering.** Maar één tool heeft er een, van 7 dagen. Die is waarschijnlijk ook beperkt tot één dossier en geeft een PDF met een watermerk.
- **Gratis versies lopen niet af.** De andere tools beperken de gratis versie op een van deze manieren:
  - in **hoeveelheid**: een maximum aantal kringen, schema's, pagina's of projecten in de cloud;
  - in **bruikbaarheid van de export**: een watermerk, of helemaal geen PDF zonder betaling.
- **Het watermerk op de gratis export is de norm.**
- **Betalen per project komt vaak voor,** ruwweg tussen €17 en €29. Na betaling blijft het project bewerkbaar en kan het opnieuw geëxporteerd worden. Sommige tools bieden ook een eenmalige levenslange licentie aan.
- **Abonnementen kosten** ruwweg tussen €12 en €45 per maand. Het jaarabonnement van de duurste tool komt neer op 8 keer de maandprijs.
- **Het onderwijs kan soms volledig gratis gebruik maken,** met alle functies. Zie backlogpunt 7 in `2026-11-07-functies-uit-marktonderzoek.md`.

## Vaststellingen voor Elentrik

1. **We geven de officiële export gratis weg (ernstig).** Een particulier of een installateur met één klus maakt het hele dossier in 30 dagen, exporteert het zonder watermerk en hoeft nooit te betalen. Na de proefperiode blijft exporteren ook mogelijk. De bestaande bescherming houdt alleen tegen dat iemand telkens een nieuw bedrijf aanmaakt.
2. **De klok loopt vanaf de registratie en niet vanaf het gebruik.** Wie zich registreert om eens te kijken, heeft vaak pas weken later een echt dossier. Tegen dan is de proefperiode bijna of helemaal voorbij.
3. **Er is geen instap voor wie maar af en toe een dossier maakt.** De spec sluit een eenmalige aankoop uit, maar de markt laat zien dat betalen per project gangbaar is.
4. **Wat al goed is, en verkoopargumenten oplevert:**
   - er is geen kaart vooraf nodig;
   - proefdagen gaan niet verloren als je vroeg een abonnement neemt;
   - projecten blijven leesbaar na het einde;
   - wie werkt terwijl de toegang vervalt, behoudt zijn werk als lokaal concept.

## Voorstel

### A. Watermerk op de export zonder betaling — M

- Zonder lopend abonnement, en tijdens de proefperiode, krijgt elke PDF-pagina een duidelijke markering: "Proefversie, geen officieel dossier".
- Met een abonnement, of voor een vrijgesteld bedrijf, verdwijnt de markering. Ook oudere projecten kunnen dan zonder markering opnieuw geëxporteerd worden.
- Hergebruik dezelfde markering voor het onderwijsaccount (backlogpunt 7).
- **Open vragen:**
  - Krijgt de schermweergave of de afdrukweergave ook de markering, of alleen de PDF?
  - Wat gebeurt er met PDF's die al zonder markering zijn geëxporteerd? Voorstel: niets, want ze bestaan al.
  - Hoe moeilijk moet het zijn om de markering te verwijderen? Ze hoeft niet onkraakbaar te zijn, wel duidelijk zichtbaar voor de keurder.

### B. Een gratis versie zonder tijdslimiet — M

- Met het watermerk uit A wordt onbeperkt gratis tekenen veilig. De gebruiker betaalt op het moment dat hij het dossier echt nodig heeft.
- Mogelijke vormen:
  - **Tekenen blijft altijd gratis.** De proefperiode van 30 dagen verdwijnt. Betalen geldt alleen voor de export zonder markering.
  - **Een beperkte gratis versie,** bijvoorbeeld één project of een maximum aantal kringen, met daarnaast een proefperiode waarin alles kan.
- **Open vragen:**
  - Welke vorm kiezen we?
  - Wat gebeurt er met bestaande bedrijven die nu op alleen-lezen staan?
  - Hoe past dit in de regels van `bepaalToegang` en `vereisSchrijfrecht`?

### C. Betalen per project — M/L

- Een eenmalige betaling haalt de markering weg voor één project. Daarna blijft het project bewerkbaar en kan het opnieuw geëxporteerd worden.
- Dit herziet het niet-doel "eenmalige aankoop" uit de abonnementenspec. Dat vraagt een expliciete beslissing.
- **Open vragen:**
  - Welke prijs?
  - Hoe registreren we een betaald project (Stripe Checkout in modus `payment`, plus een vlag op het project)?
  - Wordt een project zonder markering opnieuw betalend als het later naar een ander bedrijf verhuist of gedupliceerd wordt?

### D. Kleinere aanvullingen — S

- **Gratis start voor jonge bedrijven:** een langere proefperiode voor bedrijven jonger dan een jaar. Te controleren via de oprichtingsdatum in de KBO, samen met backlogpunt 3. Het beheerscherm kan een proefperiode nu al verlengen.
- **Een abonnement zonder automatische verlenging,** als keuze in Checkout.
- **Een herinnering per e-mail** enkele dagen voor het einde van de proefperiode. Nog na te gaan of die er al is: vandaag staat er alleen een banner in de app, in de laatste 7 dagen.
- **De proefbanner en de pagina `/abonnement`** zeggen duidelijk dat projecten en eerdere PDF's beschikbaar blijven.

## Voorgestelde volgorde

1. Een beslissing over B (welke gratis vorm) en C (betalen per project ja of nee). Die bepaalt de spec.
2. A, het watermerk, samen met de gekozen vorm van B, in één plan.
3. D, de kleine aanvullingen, waar ze passen.
4. C, als dat gekozen wordt, in een eigen plan, samen met het afstellen van de Stripe-prijzen.
