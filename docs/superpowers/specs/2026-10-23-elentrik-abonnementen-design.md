# Elentrik: abonnementen met Stripe (ontwerp)

- **Datum:** 2026-10-23
- **Status:** ter review
- **Bouwt voort op:**
  - de MVP-spec `docs/superpowers/specs/2026-10-17-elentrik-mvp-design.md` (§8 "Abonnement" en §10 stap 8);
  - plan 6 `docs/superpowers/specs/2026-10-22-elentrik-inloggen-organisaties-design.md`: organisaties, rollen eigenaar en lid, `defineBeveiligdeHandler`, `vereisLid` en `vereisProjecttoegang`, en de header `x-elentrik-organisatie` (R10).
- **Beslist met de gebruiker:**
  - **Stripe in plaats van Mollie.** De gebruiker heeft al een Stripe-account. Dit vervangt "Mollie" in MVP-spec §8.
  - **Proefperiode:** 30 dagen gratis, alleen voor het eerste bedrijf dat iemand zelf aanmaakt.
  - **Formules:** maand en jaar. Het jaarabonnement krijgt korting.
  - **Vaste prijs per bedrijf,** niet afhankelijk van het aantal gebruikers.
  - **Ook particulieren** kunnen een account maken en betalen. Een particulier is een "bedrijf" van één persoon.
  - **Stripe Tax is verplicht.** Het btw-nummer is optioneel.
  - **Boekhouding:** elke betaalde Stripe-factuur gaat per e-mail naar de Dexxter-inbox van de gebruiker. Daar boekt de gebruiker ze in met een eigen nummer en verstuurt hij de officiële factuur, via Peppol voor bedrijven.
  - **Verlopen:** een bedrijf zonder actief abonnement kan nog zien en exporteren, maar niet bewerken (MVP-spec §8).
- **Mijn keuzes:** alle andere keuzes in dit document, telkens als "mijn keuze" gemarkeerd. §5b vat de beslissingen na de builder-check samen.

## 1. Waarom

Elentrik is een commercieel product. Na plan 6 kunnen bedrijven zich registreren en samenwerken; nu moeten ze ook kunnen betalen, zonder dat de gebruiker met iemand moet bellen.

Wat de klant meemaakt:
- **Dag 1:** een installateur of particulier registreert zich en kan meteen alles gebruiken, zonder betaalgegevens op te geven.
- **Tijdens de proefperiode:** de eigenaar ziet hoeveel dagen er nog over zijn. Hij kan op elk moment een maand- of jaarabonnement nemen; de resterende proefdagen gaan niet verloren.
- **Daarna:** Stripe int automatisch per maand of per jaar. De gebruiker krijgt elke betaalde factuur in Dexxter en stuurt de klant de officiële factuur vanuit Dexxter.
- **Als het misloopt:** mislukt een betaling, dan probeert Stripe het opnieuw. De eigenaar ziet een melding en kan zijn betaalmethode bijwerken. Is er na 14 dagen nog niet betaald, of is het abonnement beëindigd, of is de proefperiode voorbij zonder abonnement, dan blijven de projecten zichtbaar en exporteerbaar, maar niet meer bewerkbaar.

## 2. Doelen, niet-doelen en anti-doelen

**Doelen:**

1. **Proefperiode:**
   - Het **eerste** bedrijf dat iemand zelf aanmaakt, krijgt 30 dagen gratis vanaf de aanmaak.
   - Elk volgend bedrijf dat dezelfde persoon aanmaakt, heeft geen proefperiode en vraagt meteen een abonnement.
   - Lid worden via een uitnodiging telt niet mee.
   - Er is geen kaart of mandaat vooraf nodig (mijn keuze). De proefperiode leeft in de eigen database; Stripe komt pas in beeld bij het nemen van een abonnement.
2. **Abonnement nemen:**
   - Alleen een **eigenaar** kiest maandelijks of jaarlijks en wordt naar **Stripe Checkout** gestuurd (mijn keuze: de betaalpagina van Stripe zelf, geen eigen formulier).
   - De betaalmethodes zijn wat in het Stripe-dashboard aanstaat, bv. kaart, Bancontact of SEPA-domiciliëring (mijn keuze).
   - Checkout vraagt het factuuradres (verplicht) en het btw-nummer (optioneel, voor particulieren). Stripe Tax berekent de btw: 21 % in België, het tarief van het land voor EU-consumenten, en verlegd voor EU-bedrijven met een geldig btw-nummer.
   - Wie tijdens de proefperiode een abonnement neemt, betaalt pas vanaf het einde ervan (mijn keuze).
3. **Prijzen:**
   - De gebruiker legt de twee prijzen (terugkerend, in EUR, **exclusief btw**) zelf vast in het Stripe-dashboard. Elentrik kent alleen hun id's via env.
   - De abonnementspagina toont per formule het bedrag excl. btw en ter info incl. 21 % btw, bv. "€ 30 excl. btw (€ 36,30 incl. 21 % btw)". Het jaarabonnement toont ook de korting als percentage t.o.v. 12 × de maandprijs (mijn keuze).
   - Het echte btw-bedrag staat in Checkout.
4. **Beheren:** een eigenaar opent het **Stripe-klantenportaal** om van formule te wisselen, zijn betaalmethode bij te werken of op te zeggen (mijn keuze).
5. **Status voor iedereen:** elk lid ziet de status van het abonnement van zijn bedrijf. Alleen een eigenaar ziet de knoppen om te betalen of te beheren.
6. **Alleen-lezen:** zie §4.4. De server dwingt het af; de client toont het duidelijk.
7. **Doorsturen naar de boekhouding:**
   - Elke betaalde Stripe-factuur met een bedrag groter dan nul gaat als PDF-bijlage per e-mail naar het adres in `BOEKHOUDING_INBOX`, via de bestaande SMTP-configuratie.
   - Elke factuur wordt precies één keer doorgestuurd.
   - Zonder `BOEKHOUDING_INBOX` gebeurt er niets.
8. **Particulieren:** de registratie en "Nieuw bedrijf" vragen "Naam van je bedrijf of je eigen naam" (mijn formulering). Bedrijfsgegevens, logo en btw-nummer blijven optioneel.

**Niet-doelen:**
- prijs per gebruiker of per aantal projecten, coupons, doorverwijzingen, een gratis formule of een eenmalige aankoop;
- zelf facturen of creditnota's maken, of zelf via Peppol versturen: dat doet de gebruiker in Dexxter;
- een koppeling met de Dexxter-API (die is er niet publiek);
- een beheerscherm voor Elentrik zelf (dat doet het Stripe-dashboard);
- Mollie, of meerdere betaalproviders naast elkaar;
- Franse teksten;
- online zetten, want de app blijft lokaal (127.0.0.1).

**Anti-doelen (het werkt technisch, maar het is toch fout):**
- Een klant die betaald heeft, kan niet werken. Een vertraagde, gemiste of te laat aangekomen webhook mag geen betalende klant op alleen-lezen zetten.
- Een klant verliest werk. Wie tijdens het tekenen op alleen-lezen valt, behoudt zijn wijzigingen als lokaal concept (zoals bij een verlopen sessie in plan 6).
- Een organisatie betaalt dubbel.
- Iemand werkt onbeperkt gratis: door telkens een nieuw bedrijf aan te maken, door een mislukte eerste SEPA-betaling, of door een onbetaald abonnement dat eindeloos `past_due` blijft.
- Een lid zonder eigenaarsrol sluit een abonnement af, wijzigt het of zegt het op.
- Een vervalste of herhaalde webhook verandert iets.
- Een organisatie ziet of wijzigt het abonnement van een andere organisatie.
- Het Dexxter-adres, een Stripe-sleutel of een webhookgeheim komt in de repo, in een log of bij de client terecht. De repo is publiek.
- Een factuur komt twee keer of nooit in de boekhouding.
- Een automatische test praat met de echte Stripe-API of heeft echte sleutels nodig.

## 3. Randvoorwaarden

- **Bestaande stack:** Nuxt 4, Drizzle op PostgreSQL 16 en Better Auth 1.7.7 met de organization-plugin. Elke route loopt via `defineBeveiligdeHandler`.
- **Stripe-SDK:** de officiële `stripe`-npm-library, met een exact vastgepinde versie en API-versie (mijn keuze).
  - Vanaf API-versie 2025-03-31 ("basil") staat `current_period_end` op de subscription items. Het abonnement van een factuur zit dan in `invoice.parent.subscription_details.subscription`. De bouwer leest die velden voor de vastgepinde versie.
  - **Geen** `@better-auth/stripe` (mijn keuze). Die koppelt de proefperiode aan Checkout en opent een brede API-oppervlakte die plan 6 net afschermde (R7).
- **Configuratie via env** (namen zijn mijn keuze):
  - `STRIPE_GEHEIME_SLEUTEL`, in test `sk_test_…`;
  - `STRIPE_WEBHOOK_GEHEIM`;
  - `STRIPE_PRIJS_MAAND` en `STRIPE_PRIJS_JAAR`;
  - `BOEKHOUDING_INBOX`, optioneel.

  Ze staan zonder waarden in `.env.example`, en worden nooit gelogd, nooit naar de client gestuurd en nooit gecommit.
- **Zonder Stripe-configuratie staan abonnementen uit** (mijn keuze). Ontbreekt `STRIPE_GEHEIME_SLEUTEL`, dan werkt de app zoals vandaag:
  - geen proefperiode en geen alleen-lezen;
  - de abonnementspagina zegt "Betalen is nog niet ingesteld";
  - lokaal gebruik zonder Stripe raakt nooit geblokkeerd.
- **Lokaal:**
  - Webhooks komen binnen via `stripe listen --forward-to http://127.0.0.1:3000/api/stripe/webhook`.
  - Na de terugkeer uit Checkout synchroniseert Elentrik ook zelf (§4.2).
  - Lokaal komt de boekhoudmail in Mailpit, tenzij de gebruiker SMTP anders instelt.
- **Veiligheid:** de gebruiker zet zijn testsleutels en het Dexxter-adres zelf in `.env`. De regels van plan 6 voor de database `elentrik` en `.data/bestanden` blijven gelden.
- **Taal:** de UI-teksten in het Nederlands, via de bestaande vertaalbestanden.

## 4. Ontwerp

### 4.1 Gegevens

**Nieuwe tabel `abonnementen`:** één rij per organisatie die ooit naar Checkout ging.

| Kolom | Inhoud |
|---|---|
| `organisatie_id` | uniek |
| `stripe_klant_id` | uniek |
| `stripe_abonnement_id` | nullable; het abonnement dat Elentrik volgt (§4.2) |
| `status` | de Stripe-status zoals ze is |
| `formule` | `maand` of `jaar`, afgeleid van de prijs |
| `periode_einde` | |
| `opgezegd_op_periode_einde` | |
| `achterstallig_sinds` | nullable; het moment waarop Elentrik voor het eerst `past_due` zag. Wordt gewist bij een andere status. |
| `open_checkout_sessie` | nullable; de laatst geopende Checkout-sessie, om ze te kunnen laten vervallen |
| `aangemaakt` | |
| `bijgewerkt` | |

**Op `organization`:**
- **`proef_einde`** (timestamptz, niet null):
  - Bij het aanmaken: `now() + 30 dagen` als de aanmaker nog geen proefperiode gebruikte, anders `now()`.
  - Dat geldt voor **beide** aanmaakpaden: de registratie (`server/organisaties/registratie.ts` en de overname) en `/organization/create` via Better Auth (`NieuwBedrijfFormulier`).
  - De DB-default is `now() + interval '30 days'`, als vangnet.
  - De migratie zet bestaande organisaties op het moment van de migratie + 30 dagen, niet op `created_at` + 30 (mijn keuze).
- **`vrijgesteld`** (boolean, standaard `false`): geeft altijd schrijfrecht zonder abonnement, bv. voor het eigen bedrijf van de gebruiker of een testpartner. Alleen via SQL te zetten (mijn keuze).

**Op `user`:**
- **`proef_gebruikt`** (boolean, standaard `false`, `input: false` in Better Auth): wordt `true` wanneer de gebruiker zijn eerste bedrijf aanmaakt.
- De migratie zet het op `true` voor elke gebruiker die vandaag eigenaar is van een organisatie (mijn keuze).

**Twee hulptabellen:**
- **`stripe_events`:** de id's van volledig verwerkte Stripe-events, met tijdstip.
- **`doorgestuurde_facturen`:** het Stripe-factuur-id, het tijdstip en het factuurnummer, zodat elke factuur maar één keer naar de boekhouding gaat.

### 4.2 Server

**Stripe-poort.** Een kleine interface in `server/abonnementen/`, met precies de aanroepen die we gebruiken:
- klant maken of bijwerken;
- een Checkout-sessie maken, ophalen of laten vervallen;
- een portaalsessie maken;
- de abonnementen van een klant oplijsten;
- een abonnement ophalen of meteen beëindigen;
- een factuur ophalen, en de PDF ervan downloaden;
- een prijs ophalen;
- de handtekening van een webhook controleren.

De implementatie gebruikt de Stripe-SDK. Tests gebruiken een nep-implementatie.

**Toegangsbeslissing, één pure functie:**

`bepaalToegang({ nu, ingeschakeld, proefEinde, vrijgesteld, abonnement }) → { schrijven, reden }`

De regels, in volgorde:
1. Abonnementen uit: schrijven.
2. `vrijgesteld`: schrijven.
3. Een gevolgd abonnement met status `active` of `trialing`: schrijven.
4. `past_due` en `nu < achterstallig_sinds + 14 dagen`: schrijven, met als reden "betaling mislukt".
5. `nu < proefEinde`: schrijven, met als reden de proefperiode.
6. Anders: alleen-lezen. De reden is "proefperiode voorbij", "betaling mislukt" of "abonnement beëindigd".

`incomplete`, `incomplete_expired`, `unpaid`, `canceled` en `paused` geven zelf geen schrijfrecht; regel 5 kan nog wel gelden. Een opgezegd abonnement blijft `active` tot het periode-einde.

**Welk abonnement Elentrik volgt.** Bij elke synchronisatie lijst Elentrik alle abonnementen van de klant op en kiest het "levendigste". De volgorde is:

`active > trialing > past_due > unpaid > paused > incomplete > canceled > incomplete_expired`

Bij gelijke status wint het nieuwste. Zijn er twee of meer met `active`, `trialing` of `past_due`, dan wordt er een waarschuwing gelogd ("dubbel abonnement", met alleen de organisatie-id). Terugbetalen doet de gebruiker in Stripe (mijn keuze).

Zo zet een laat event van een oud abonnement een betalende klant niet op alleen-lezen.

**`vereisSchrijfrecht(event, organisatieId)`** roept `bepaalToegang` aan. Zonder schrijfrecht volgt **402** met `data.code = "ABONNEMENT_VEREIST"` en `data.reden`, en verandert er niets.
- **Geblokkeerd:** project aanmaken, opslaan (PUT), dupliceren en een bestand uploaden.
- **Niet geblokkeerd** (mijn keuze): lezen, exporteren, een project verwijderen, bedrijfsgegevens en logo, de naam, leden, uitnodigingen en wisselen van organisatie.

**Routes.** Allemaal via `defineBeveiligdeHandler`. De wijzigende routes van eigenaars sturen `x-elentrik-organisatie` mee.

- **`GET /api/abonnement`** (elk lid):
  - Geeft `{ ingeschakeld, schrijven, reden, proefEinde, status, formule, periodeEinde, opgezegd, prijzen }`.
  - `prijzen` is `{ maand, jaar }`, elk met bedrag excl. btw, munt en interval, opgehaald bij Stripe en 10 minuten gecachet. Het is `null` als Stripe niet antwoordt.
  - Nooit Stripe-id's.
- **`POST /api/abonnement/checkout { formule }`** (alleen een eigenaar):
  - **Blokkering:** onder een advisory lock per organisatie. Heeft het gevolgde abonnement de status `trialing`, `active`, `past_due`, `unpaid`, `incomplete` of `paused`, dan volgt 409 `ABONNEMENT_BESTAAT`; de UI stuurt de eigenaar naar het portaal.
  - **Vorige sessie:** staat er nog een `open_checkout_sessie` open, dan laat Elentrik die eerst vervallen.
  - **Klant:** maakt zo nodig de Stripe-klant, met metadata `organisatieId` en het e-mailadres van de eigenaar.
  - **Checkout-sessie** in modus `subscription`, met:
    - `automatic_tax` aan;
    - `tax_id_collection` aan, niet verplicht;
    - het factuuradres verplicht;
    - `customer_update` op `{ address: "auto", name: "auto" }`;
    - de metadata `organisatieId` op de sessie en op het abonnement.
  - **Proefperiode:** ligt `proef_einde` meer dan 48 uur in de toekomst, dan krijgt het abonnement `trial_end = proef_einde`; anders start het meteen. Stripe eist die marge.
  - **Terugkeer:** `success_url` is `/abonnement?terug={CHECKOUT_SESSION_ID}` en `cancel_url` is `/abonnement`.
  - Bewaart `open_checkout_sessie` en geeft `{ url }` terug.
- **`POST /api/abonnement/portaal`** (alleen een eigenaar, alleen met een Stripe-klant): een portaalsessie met `return_url` `/abonnement`. Geeft `{ url }` terug.
- **`POST /api/abonnement/synchroniseer { sessie }`** (alleen een eigenaar):
  - Haalt de Checkout-sessie op en controleert dat ze bij de klant van deze organisatie hoort (anders 404).
  - Synchroniseert dan zoals de webhook.
  - Zo ziet de klant zijn status meteen na de terugkeer, ook zonder webhook.
- **`POST /api/stripe/webhook`** (publiek: `{ publiek: true }`, met naam in `PUBLIEKE_ROUTES`):
  - Leest de **ruwe** body en controleert de handtekening met `STRIPE_WEBHOOK_GEHEIM`. Ongeldig: 400, en er verandert niets.
  - Een event-id dat al in `stripe_events` staat, krijgt 200 zonder verdere actie.
  - **Synchronisatie** bij `checkout.session.completed`, `customer.subscription.created`, `.updated` en `.deleted`, en `invoice.paid` en `invoice.payment_failed`. Elentrik leest daarbij de toestand bij Stripe (de abonnementen van de klant oplijsten) en schrijft het gevolgde abonnement weg. Stripe is de bron van waarheid; dat lost volgorde en herhaling op.
  - **Mislukte eerste betaling:** bij `checkout.session.async_payment_failed`, en bij `invoice.payment_failed` met `billing_reason = subscription_create`, beëindigt Elentrik dat abonnement meteen. Een SEPA-abonnement is in Stripe al `active` terwijl de betaling nog loopt; zonder deze stap zou een mislukte eerste betaling gratis gebruik tot de volgende verlenging geven.
  - **Doorsturen naar de boekhouding:** bij `invoice.paid` met `amount_paid > 0` en een ingestelde `BOEKHOUDING_INBOX`:
    - de PDF downloaden;
    - mailen met als onderwerp "Stripe-factuur {nummer}" en de PDF als bijlage;
    - het factuur-id vastleggen in `doorgestuurde_facturen`. Een factuur die er al in staat, wordt overgeslagen.
  - **Afronding:** het event komt pas in `stripe_events` als alles gelukt is. Bij een fout (Stripe of SMTP onbereikbaar) volgt 500, zodat Stripe het event opnieuw stuurt; de stappen zijn idempotent.
  - Een onbekende klant of een onbekend event-type: 200, genegeerd, en gelogd zonder inhoud.
  - De CSRF-check uit plan 6 laat de webhook door, want Stripe stuurt geen `Origin`. Een test pint dat vast.
- **`GET /api/mij`** krijgt per organisatie `toegang: { schrijven, reden, proefEinde }` (mijn keuze).

### 4.3 Client

- **Pagina `/abonnement`**, met een link in het gebruikersmenu:
  - **Iedereen** ziet de status: proefperiode met de resterende dagen; actief met formule en volgende verlenging; opgezegd met de einddatum; betaling mislukt; verlopen; of "geen proefperiode" bij een tweede eigen bedrijf.
  - **Een eigenaar zonder lopend abonnement** ziet twee kaarten, Maandelijks en Jaarlijks, met de prijzen zoals in §2.3. Jaarlijks heeft de badge "−N %"; elke kaart heeft een knop "Kies" die naar Checkout gaat.
  - **Een eigenaar met een abonnement** ziet de knop "Abonnement beheren", naar het portaal. Bij `unpaid` of `past_due` heet die knop "Betaling regelen".
  - **Een lid** ziet: "Vraag een eigenaar van je bedrijf om het abonnement te regelen."
  - **Terug uit Checkout** (`?terug=`): de pagina roept `synchroniseer` aan, toont de nieuwe status en haalt `terug` uit de URL.
  - **Abonnementen uit:** "Betalen is nog niet ingesteld."
- **Banners** bovenaan de app (mijn keuze):
  - **Proefperiode, laatste 7 dagen:** voor eigenaars "Nog N dagen gratis. Kies een abonnement".
  - **Betaling mislukt** (binnen de 14 dagen): voor eigenaars "Je laatste betaling is mislukt. Regel je betaling vóór {datum}".
  - **Alleen-lezen:** voor iedereen "Je bedrijf heeft geen actief abonnement. Je kan projecten bekijken en exporteren, maar niet bewerken". Eigenaars krijgen een knop naar `/abonnement`.
- **Alleen-lezen in de app:**
  - De projectenlijst verbergt "Nieuw project" en "Dupliceren".
  - De editor opent in een **alleen-lezenmodus**:
    - Selecteren, zoomen, navigeren, de kringenlijst en het exportdialoogvenster werken.
    - Alles wat het document wijzigt, doet niets en is uitgeschakeld in de UI. Dat zijn toevoegen, wijzigen, verwijderen, slepen (ook op het situatieschema), sjablonen, plakken, ongedaan maken en de sneltoetsen die wijzigen.
    - Het eigenschappenpaneel is alleen-lezen.
- **402 tijdens het werken:**
  - Krijgt autosave een 402 `ABONNEMENT_VEREIST`, dan gaat de editor naar de status `alleen-lezen`. Het niet-opgeslagen document blijft als lokaal concept bewaard, net zoals bij `afgemeld`. Er is geen automatische herhaling.
  - Na betaling biedt de editor dat concept aan met het bestaande conceptmechanisme.
- **Registratie en "Nieuw bedrijf":** het veld heet "Naam van je bedrijf of je eigen naam". Bij "Nieuw bedrijf" staat, als de gebruiker zijn proefperiode al gebruikte: "Dit bedrijf heeft geen gratis proefperiode; je kiest meteen een abonnement."

### 4.4 Wat "alleen-lezen" precies betekent

| Actie | Schrijven (proef / actief / max. 14 dagen achterstallig) | Alleen-lezen |
|---|---|---|
| Projecten bekijken, kringenlijst, situatieschema bekijken | ✓ | ✓ |
| PDF exporteren, eerdere exports downloaden | ✓ | ✓ |
| Project verwijderen | ✓ | ✓ |
| Bedrijfsgegevens, leden, uitnodigingen, organisatie wisselen, abonnement | ✓ | ✓ |
| Project aanmaken, dupliceren, opslaan, plan uploaden | ✓ | ✗ (402) |

### 4.5 Stripe-dashboard (handmatig, door de gebruiker)

Code legt deze instellingen niet vast. `docs/lokaal-en-online.md` krijgt een checklist (mijn keuze):
- **Stripe Tax:** aan, met het Belgische vestigingsadres en de registratie.
- **Prijzen:** twee terugkerende prijzen, maand en jaar, in EUR en exclusief btw (tax behavior "exclusive").
- **Factuurnummering:** een eigen voorvoegsel, bv. `ELK-`, doorlopend over het hele account.
- **Klantmails:** Stripe stuurt de klant **geen** facturen, want de officiële factuur komt uit Dexxter. Betalingsbewijzen naar keuze van de gebruiker.
- **Mislukte betalingen:** Smart Retries aan. Na de laatste mislukte poging wordt het abonnement **opgezegd**.
- **Klantenportaal:**
  - wisselen tussen de twee prijzen toegelaten, met de standaard verrekening (prorating) van Stripe;
  - opzeggen op het **einde van de periode**;
  - betaalmethode bijwerken toegelaten;
  - de factuurgeschiedenis **uit**, omdat de officiële facturen uit Dexxter komen;
  - de standaardconfiguratie bewaard, ook in testmodus (anders faalt het portaal).
- **Webhook-endpoint** (later online) met de events uit §4.2. Lokaal gaat dit via `stripe listen`.

Elentrik vangt de belangrijkste misconfiguraties zelf op: de grens van 14 dagen bij `past_due`, het levendigste abonnement volgen, en de 409 bij een bestaand abonnement.

## 5. Kwaliteit en tests

- **`bepaalToegang`:** unittests voor elke regel en elke grens:
  - `proefEinde` exact;
  - `achterstallig_sinds` + 14 dagen exact;
  - elke Stripe-status;
  - `vrijgesteld`;
  - abonnementen uit.
- **Het levendigste abonnement kiezen:** unittests voor de volgorde, gelijke statussen en de waarschuwing bij een dubbel abonnement.
- **Proefperiode bij aanmaken:**
  - de eerste eigen organisatie krijgt 30 dagen, de tweede 0, via beide aanmaakpaden;
  - een uitnodiging aanvaarden verandert `proef_gebruikt` niet;
  - de migratie van bestaande organisaties en gebruikers.
- **API-tests (PGlite) met de nep-Stripe-poort:**
  - checkout, portaal en synchroniseer alleen voor een eigenaar: een lid krijgt 403, een andere organisatie 404;
  - `ABONNEMENT_BESTAAT` voor elke blokkerende status;
  - twee gelijktijdige checkouts: één klant, en de eerste sessie vervalt;
  - `trial_end` bij de grens van 48 uur;
  - `automatic_tax`, `tax_id_collection` en het factuuradres staan in de Checkout-aanroep;
  - `synchroniseer` weigert de sessie van een andere organisatie;
  - **402** op aanmaken, PUT, dupliceren en uploaden voor een verlopen organisatie, en **geen** 402 op export, verwijderen en de beheerroutes;
  - abonnementen uit: nooit 402.
- **Webhook:**
  - handtekeningen gemaakt met de offline testhelper van de SDK (`generateTestHeaderString`);
  - een ongeldige handtekening geeft 400;
  - een herhaald event verandert niets;
  - events in de verkeerde volgorde: het levendigste abonnement wint;
  - een mislukte eerste betaling beëindigt het abonnement;
  - een onbekende klant wordt genegeerd;
  - een request zonder Origin passeert de CSRF-check;
  - een SMTP-fout geeft 500 en markeert het event niet als verwerkt.
- **Doorsturen:**
  - `invoice.paid` stuurt één mail naar `BOEKHOUDING_INBOX` met de PDF als bijlage (via Mailpit of een nep-transport);
  - hetzelfde event twee keer, of `invoice.paid` voor dezelfde factuur in twee events: één mail;
  - een factuur van €0: geen mail;
  - zonder `BOEKHOUDING_INBOX`: geen mail;
  - het adres verschijnt in geen enkel log.
- **Routetabel:** de nieuwe routes staan in de route- en statische test van plan 6, en de webhook staat in `PUBLIEKE_ROUTES`.
- **Client:**
  - de alleen-lezenmodus blokkeert elke wijzigende operatie, ook via sneltoetsen;
  - een 402 tijdens autosave bewaart het concept en zet de status op `alleen-lezen`.
- **Playwright** (tegen `elentrik_e2e`, zonder echte Stripe):
  - een organisatie met `proef_einde` in het verleden ziet de banner, opent een project alleen-lezen en kan exporteren;
  - een eigenaar ziet de twee formules met de prijzen;
  - "Kies" leidt naar de URL van de nep-Stripe.

  Er mag geen test-hook in de productiecode zitten die met een gewone env-variabele echte betalingen omzeilt (§6).
- **Handmatige test** door de gebruiker, in Stripe-testmodus met `stripe listen`, beschreven in `docs/lokaal-en-online.md`:
  - een abonnement nemen met de testkaart 4242…, en controleren dat de factuur in Mailpit (of in Dexxter) aankomt;
  - een mislukte betaling;
  - wisselen en opzeggen via het portaal;
  - een verlopen proefperiode via een SQL-update van `proef_einde`.

## 5b. Beslissingen na de builder-check (mijn keuzes)

1. **Dubbel betalen voorkomen:**
   - een open Checkout-sessie laten vervallen vóór een nieuwe;
   - 409 ook bij `unpaid`, met een doorverwijzing naar het portaal;
   - altijd het levendigste abonnement volgen, met een waarschuwing in het log;
   - terugbetalen doet de gebruiker in Stripe.
2. **Btw:** Stripe Tax is verplicht (beslist met de gebruiker). `STRIPE_AUTOMATISCHE_BTW` vervalt. Het btw-nummer is optioneel.
3. **Mislukte eerste betaling (SEPA):** het abonnement wordt meteen beëindigd. Regel 4 van de eerste versie (`incomplete` < 7 dagen) vervalt, want hij berustte op een verkeerde aanname.
4. **Stripe-dashboard:** handmatig ingesteld volgens de checklist in §4.5. Elentrik vangt `past_due` zelf af na 14 dagen.
5. **Proefperiode:** alleen voor het eerste eigen bedrijf, via `user.proef_gebruikt` (beslist met de gebruiker).
6. **Bestaande organisaties:** de migratie geeft ze 30 dagen vanaf het moment van de migratie. `proef_einde` wordt in code gezet op beide aanmaakpaden, met een DB-default als vangnet.
7. **`paused`:** komt met onze Checkout-instellingen niet voor. Gebeurt het toch, dan geeft het geen schrijfrecht en blokkeert het een nieuwe Checkout (naar het portaal).

## 6. Wat aan de bouwer overblijft

- de opdeling in bestanden en de naam van de nep-poort;
- hoe de e2e-server een nep-Stripe krijgt. Bv. een lokale nep-HTTP-server waar de SDK via host en poort naartoe wijst, alleen als de e2e-guard uit plan 6 actief is, of een andere veilige manier;
- de Drizzle-definities en de migratienummers (volgend op 0006);
- hoe `proef_einde` op het Better Auth-pad gezet wordt (organization-hook of databaseHook), zolang beide paden getest zijn;
- de vormgeving van de kaarten en banners, binnen Nuxt UI;
- de Stripe-API-versie en de exacte SDK-versie (de laatste stabiele van minstens twee weken oud), en de velden die daarbij horen (§3);
- de logregels, zonder sleutels, adressen of persoonsgegevens.
