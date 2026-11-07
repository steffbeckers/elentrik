# Elentrik: gratis versie, betalen per project en onderwijs (ontwerp)

- **Datum:** 2026-11-07
- **Status:** ontwerp, wacht op goedkeuring
- **Bouwt voort op:**
  - de abonnementenspec `docs/superpowers/specs/2026-10-23-elentrik-abonnementen-design.md` (Stripe, `bepaalToegang`, `vereisSchrijfrecht`, de webhook, de boekhouding);
  - de backlog `docs/backlog/2026-11-07-proefperiode-en-gratis-versie.md` (voorstellen A tot D).
- **Beslist met de gebruiker:**
  - **De proefperiode van 30 dagen verdwijnt.** In de plaats komt een gratis versie die niet afloopt.
  - **De gratis versie heeft per project een limiet:** maximaal 5 kringen en 1 situatieschema.
  - **Een gratis export krijgt altijd een watermerk,** ook als het project binnen de limiet blijft.
  - **Betalen per project:** een eenmalige betaling geeft één project vrij, zonder limieten en zonder watermerk, en dat voor altijd.
  - **Abonnement:** maand of jaar, zonder limieten en zonder watermerk, zoals nu. Het blijft naast betalen per project bestaan, voor wie veel tekent.
  - **Alleen de eigenaar** kan een project vrijgeven of een abonnement nemen. Een lid krijgt de melding dat hij het aan de eigenaar moet vragen.
  - **Na het einde van een abonnement:**
    - elk project dat tijdens het abonnement bewaard werd, blijft exporteerbaar zonder watermerk;
    - zo'n project wordt volledig alleen-lezen, ook als het binnen de limiet blijft. Opnieuw bewerken kan na de aankoop van het project of met een nieuw abonnement.
  - **Onderwijs:**
    - een school is een gewoon bedrijf met de status "onderwijs", die de beheerder zet;
    - de eigenaar, meestal de leerkracht, nodigt de studenten uit als leden;
    - er gelden geen limieten, maar elke export krijgt altijd een watermerk;
    - groepen, klassen en het werk van studenten bekijken: later.
  - **Zachte overgang:**
    - elk bestaand project wordt eenmalig gestempeld alsof het tijdens een abonnement bewaard werd;
    - een bedrijf met een lopende proefperiode behoudt die tot het einde ervan.

    Op elentrik.app staan vandaag de testaccounts van de gebruiker en één account van een collega.
- **Mijn keuzes:** alle andere keuzes in dit document, telkens gemarkeerd als "mijn keuze".

## 1. Waarom

De proefperiode van 30 dagen past slecht bij hoe installateurs en particulieren werken:

- **De officiële export is gratis.** Wie één dossier nodig heeft, maakt het in de proefperiode, exporteert het zonder enige markering en betaalt nooit.
- **De klok start bij de registratie.** Wie zich registreert om eens te kijken, heeft vaak pas weken later een echt dossier. Tegen dan is de proef voorbij.
- **Er is geen instap voor wie maar af en toe een dossier maakt.** Een abonnement is dan een grote stap.

Andere tools op de Belgische markt werken bijna allemaal met een gratis versie die niet afloopt, maar die beperkt is in omvang of een watermerk op de export zet. Velen bieden ook betalen per project aan.

**Wat de klant meemaakt:**

- **Dag 1:** registreren en meteen tekenen. Er is geen klok en er zijn geen betaalgegevens nodig.
- **Een klein project** (tot 5 kringen, 1 situatieschema): volledig tekenen. De PDF krijgt het watermerk "Gratis versie, geen officieel dossier".
- **Een echt dossier:**
  - bij de zesde kring of het tweede situatieschema verschijnt een venster;
  - de eigenaar geeft het project vrij voor een eenmalig bedrag, of neemt een abonnement;
  - na de betaling gaat hij verder waar hij was, zonder werk te verliezen.
- **Veel dossiers:** met een abonnement verdwijnen alle limieten en watermerken.
- **Na het opzeggen:**
  - wat tijdens het abonnement gemaakt is, blijft leesbaar en exporteerbaar zonder watermerk, maar niet bewerkbaar;
  - nieuwe gratis projecten maken blijft altijd mogelijk.

## 2. Doelen, niet-doelen en anti-goals

**Doelen:**

1. Een gratis versie zonder tijdslimiet, met limieten per project en een watermerk op de export.
2. Een project vrijgeven met een eenmalige betaling via Stripe Checkout.
3. Een abonnement zonder limieten, met een stempel per project dat erna exporteerbaar blijft.
4. Een onderwijsstatus voor bedrijven, beheerd in het beheerscherm.
5. Een zachte overgang voor bestaande bedrijven en projecten.

**Niet-doelen:**

- klassen, groepen, opdrachten of een overzicht van het werk van studenten;
- verificatie van scholen (de beheerder beslist);
- een abonnement zonder automatische verlenging, of een gratis start voor jonge bedrijven (backlogvoorstel D, later);
- terugbetalingen of het intrekken van een aankoop in Elentrik (dat gebeurt in Stripe; zie §7);
- het watermerk onkraakbaar maken (het moet zichtbaar zijn, niet onverwijderbaar);
- bestaande PDF-exports achteraf veranderen;
- coupons of kortingen.

**Anti-doelen (het werkt technisch, maar het is toch fout):**

- Een klant verliest werk omdat hij een limiet raakt. De wijziging die de limiet overschrijdt, wordt niet weggegooid.
- Een betaald of gestempeld project krijgt toch een watermerk.
- Een dossier dat iemand vóór de overgang maakte, krijgt na de overgang plots een watermerk of wordt onbewerkbaar.
- Een project wordt twee keer betaald, of een betaald project blijft vergrendeld omdat de webhook laat of niet aankomt.
- Een gratis project gaat via de API, een sjabloon, een import of een kopie over de limiet.
- Een export van een onderwijsbedrijf verschijnt zonder watermerk.
- Een lid zonder eigenaarsrol start een betaling.
- Lokaal zonder Stripe raakt iemand geblokkeerd of krijgt hij een watermerk.

## 3. Randvoorwaarden

- **Bestaande stack:** Nuxt 4, Drizzle op PostgreSQL 16, Better Auth met de organization-plugin, en Stripe via de bestaande poort `server/abonnementen/stripe.ts`. Elke route loopt via `defineBeveiligdeHandler`.
- **De PDF-export loopt via de server** (`server/exports/repo.ts` → `printHtml` → Gotenberg). Het watermerk wordt daar bepaald, nooit door de client.
- **Het bestaande watermerk:** `PrintOpties.watermerk` in `packages/render/src/print/print-html.ts` bestaat al voor staging. Hergebruik dat.
- **Zonder `STRIPE_GEHEIME_SLEUTEL`** werkt alles zoals vandaag: geen limieten, geen watermerk (behalve dat van staging), alles bewerkbaar.
- **Talen:** alle nieuwe teksten in `nl.json`, `fr.json` en `en.json`, volgens `docs/vertalingen.md`. De watermerktekst volgt de taal van het dossier, net als de rest van de PDF.
- **Veiligheid:** de regels van de werkwijze blijven gelden. Tests praten nooit met de echte Stripe-API en raken nooit de database `elentrik`.

## 4. Ontwerp

### 4.1 Begrippen

- **Kring:** een node die een kringcode krijgt, dus van het type `automaat` of `zekering`, zoals `packages/model/src/referenties.ts` ze toekent (mijn keuze; zo telt ook de kringenlijst, en wie met zekeringen tekent, ontloopt de limiet niet).
- **Situatieschema:** een pagina in `document.situatie.paginas`, referentiebladen inbegrepen (mijn keuze; eenvoudig en voorspelbaar).
- **Limiet:** `GRATIS_MAX_KRINGEN` (standaard 5) en `GRATIS_MAX_SITUATIESCHEMAS` (standaard 1), als env-variabelen op de server (mijn keuze). De server geeft de waarden aan de client mee.
- **Gekocht project:** een project met `gekocht_op`.
- **Gestempeld project:** een project met `abonnement_stempel_op`. Het is bewaard terwijl het bedrijf volledige toegang had via een abonnement of een overgangsproef.

### 4.2 Gegevens

**Op `projecten`:**

| Kolom | Inhoud |
|---|---|
| `gekocht_op` | timestamptz, nullable. Gezet bij een geslaagde betaling voor dit project. |
| `abonnement_stempel_op` | timestamptz, nullable. Gezet bij het eerste bewaren (of aanmaken) terwijl het bedrijf een abonnement heeft. Wordt nooit gewist. |

**Op `organization`:**

- **`onderwijs`:** boolean, standaard `false`.
  - Een bedrijf is niet tegelijk `vrijgesteld` en `onderwijs`: een check-constraint in de database dwingt dat af (mijn keuze).
  - Alleen de beheerder zet het, via het beheerscherm, met een auditregel zoals bij de vrijstelling.
- **`proef_einde`** blijft bestaan voor de overgang (§4.8). Nieuwe bedrijven krijgen `proef_einde = aanmaak`, dus geen proef. Daarmee vervallen:
  - de DB-default van +30 dagen;
  - `kenProefperiodeToe` en `user.proef_gebruikt`. De kolom mag blijven staan, maar wordt niet meer gelezen (mijn keuze: kolommen niet verwijderen in dezelfde release).

**Nieuwe tabel `projectaankopen`:**

| Kolom | Inhoud |
|---|---|
| `id` | |
| `organisatie_id` | |
| `project_id` | |
| `checkout_sessie` | uniek |
| `status` | `open`, `betaald`, `vervallen` of `mislukt` |
| `aangemaakt` | |
| `betaald_op` | |

Er is maximaal één `open` aankoop per project (een partiële unieke index). Een nieuwe aankoop laat de vorige open sessie eerst vervallen, net als bij het abonnement.

### 4.3 De toegangsbeslissing per project

Er komen twee pure functies in `server/abonnementen/toegang.ts`, naast `bepaalToegang`.

**`bepaalBedrijfsniveau(...)` → `"uit" | "vrijgesteld" | "onderwijs" | "abonnement" | "gratis"`**

1. Abonnementen uit: `uit`.
2. `vrijgesteld`: `vrijgesteld`.
3. `onderwijs`: `onderwijs`.
4. Het gevolgde abonnement is `active` of `trialing`, of `past_due` binnen 14 dagen, of de overgangsproef loopt (`nu < proef_einde`): `abonnement`.
5. Anders: `gratis`.

Een bedrijf staat zo nooit meer volledig op alleen-lezen. Een `past_due` die langer dan 14 dagen duurt, valt terug op `gratis`.

**`bepaalProjecttoegang(niveau, project)` → `{ bewerken, limiet, watermerk }`**

- `watermerk` is `null`, `"gratis"` of `"onderwijs"`.
- `limiet` is `true` als de server de limieten moet afdwingen bij het bewaren.

| Niveau | Project | bewerken | limiet | watermerk |
|---|---|---|---|---|
| `uit` of `vrijgesteld` | elk | ja | nee | geen |
| `onderwijs` | gekocht | ja | nee | geen |
| `onderwijs` | gestempeld, niet gekocht | **nee** | — | geen |
| `onderwijs` | anders | ja | nee | `onderwijs` |
| `abonnement` | elk | ja | nee | geen |
| `gratis` | gekocht | ja | nee | geen |
| `gratis` | gestempeld, niet gekocht | **nee** | — | geen |
| `gratis` | anders | ja | **ja** | `gratis` |

**Gekocht of gestempeld gaat vóór onderwijs** (mijn keuze). Dat kan alleen voorkomen bij een project van vóór de onderwijsstatus. Zo behoudt een eerder betaald of gestempeld dossier zijn export zonder watermerk, en kan een school een oud dossier niet ombouwen tot een nieuw dossier zonder watermerk. Bewaren onder niveau `onderwijs` stempelt nooit.

Een gratis project dat al boven de limiet zit, kan bijvoorbeeld bestaan na het intrekken van de status onderwijs of de vrijstelling. Zo'n project blijft bewerkbaar, maar het bewaren lukt alleen als het resultaat binnen de limiet valt. Wie kringen verwijdert, raakt er dus weer onder. Er komt geen aparte status "alleen-lezen boven de limiet" (mijn keuze).

### 4.4 Handhaving op de server

`vereisSchrijfrecht(organisatieId)` wordt vervangen door twee controles.

- **`vereisProjectBewerking(project, document?)`:**
  - 402 met `data.code = "PROJECT_ALLEEN_LEZEN"` als `bewerken` onwaar is;
  - 402 met `data.code = "PROJECT_LIMIET"` als `limiet` waar is en het nieuwe document over de limiet gaat. In `data` staan het aantal en het maximum per soort.
- **Gebruikt door:**
  - `PUT /api/projecten/[id]` (met het nieuwe document);
  - `POST /api/projecten/[id]/bestanden` (zonder document: alleen `bewerken`).
- **Bij het aanmaken:**
  - `POST /api/projecten` en `POST /api/projecten/uit-document` controleren de limiet van het nieuwe document met het niveau van het bedrijf. Een nieuw project is nooit gekocht of gestempeld.
  - `POST /api/projecten/[id]/dupliceer` doet hetzelfde: een kopie start als nieuw project, zonder `gekocht_op` en zonder stempel.
  - Een nieuw project aanmaken is altijd toegestaan; alleen de inhoud wordt getoetst aan de limiet.
- **Stempelen:** valt het bewaren of aanmaken onder niveau `abonnement`, dan zet de server `abonnement_stempel_op = nu` als het nog leeg is, in dezelfde transactie.
- **Exporteren** (`POST /api/projecten/[id]/exports`) blijft altijd toegestaan. De server bepaalt het watermerk (§4.6).
- **Verwijderen** blijft altijd toegestaan, zoals nu.
- **Correcties door de beheerder** (`server/api/admin/projecten/[id]/document.put.ts`) volgen deze regels niet (mijn keuze). Support kan een project boven de limiet of een alleen-lezen project corrigeren. Een correctie stempelt nooit en verandert `gekocht_op` niet. De controles horen dus in de klantroutes, niet in de gedeelde `bewaarProject`.

### 4.5 Betalen per project

**`POST /api/projecten/[id]/vrijgeven`** (alleen een eigenaar, met `x-elentrik-organisatie`):

- **Weigeringen:**
  - het project is al gekocht: 409 `PROJECT_AL_GEKOCHT`;
  - het bedrijf is `onderwijs` of `vrijgesteld`, of abonnementen staan uit: 409 `VRIJGEVEN_NIET_NODIG` (mijn keuze: er valt niets vrij te geven);
  - het bedrijf heeft niveau `abonnement` (een lopend abonnement, een `past_due` binnen 14 dagen of de overgangsproef): ook 409 `VRIJGEVEN_NIET_NODIG` (beslist met de gebruiker). Na het einde van het abonnement kan de eigenaar het alleen-lezen project kopen. De UI toont tijdens een abonnement nergens een knop om vrij te geven.
- **Werkwijze,** onder een advisory lock per project:
  - laat een open aankoopsessie eerst vervallen;
  - maakt zo nodig de Stripe-klant van het bedrijf aan, met een rij in `abonnementen` (zonder abonnement), zodat de webhook de klant herkent;
  - maakt een Checkout-sessie in modus `payment` met de prijs `STRIPE_PRIJS_PROJECT` (eenmalig, excl. btw);
  - de sessie heeft `automatic_tax`, een verplicht factuuradres, een optioneel btw-nummer en `invoice_creation` aan;
  - metadata: `organisatieId`, `projectId` en `soort = "project"`.
- **Terugkeer:** `success_url` is `/projecten/{id}?vrijgave={CHECKOUT_SESSION_ID}` en `cancel_url` is `/projecten/{id}`.
- Bewaart de aankoop als `open` en geeft `{ url }` terug.

**Betaling verwerken:**

- **De webhook verwerkt:**
  - `checkout.session.completed` met `payment_status = paid`;
  - `checkout.session.async_payment_succeeded` (Bancontact of SEPA kan uitgesteld zijn).

  Beide zetten de aankoop op `betaald` en `projecten.gekocht_op`, als de metadata `soort = "project"` heeft.
- **Mislukt of vervallen:** `checkout.session.async_payment_failed` en `checkout.session.expired` zetten de aankoop op `mislukt` of `vervallen`.
- **Na de terugkeer:** `POST /api/projecten/[id]/vrijgave/synchroniseer { sessie }` haalt de sessie op bij Stripe. Ze moet bij deze organisatie en dit project horen, anders volgt 404. Daarna verwerkt de route ze zoals de webhook. Een trage webhook vergrendelt een betaald project dus niet.
- **Herhalingen:** de bestaande `stripe_events`-tabel maakt de verwerking idempotent.
- **Boekhouding:** met `invoice_creation` maakt Stripe een factuur. Het bestaande `invoice.paid`-pad stuurt ze door naar `BOEKHOUDING_INBOX`. De bouwer controleert dat dit pad ook facturen zonder abonnement aankan.
- **Prijs:** `GET /api/abonnement` geeft naast `maand` en `jaar` ook `project` terug, met dezelfde cache. Zonder `STRIPE_PRIJS_PROJECT` is `project` null en toont de UI geen knop om vrij te geven (mijn keuze: de env-variabele is optioneel, zodat bestaande installaties niet breken).

### 4.6 Watermerk

- `maakExport` bepaalt `watermerk` uit `bepaalProjecttoegang`, op het moment van de export. Het project en het bedrijf worden in dezelfde leesactie opgehaald.
- **De teksten** komen in `TEKSTEN` van `@elentrik/render`, in de drie dossiertalen (mijn formulering; de bouwer mag de Franse en Engelse vertaling verfijnen):
  - `gratis`: titel "Gratis versie", ondertitel "Geen officieel dossier";
  - `onderwijs`: titel "Onderwijsversie", ondertitel "Geen officieel dossier".
- **Samen met staging:** heeft een export zowel een watermerk van de versie als van staging, dan wint dat van de versie (mijn keuze: er komt maar één watermerk op een pagina).
- **Het afdrukvoorbeeld** in de editor (`AfdrukVoorbeeld.vue`) toont hetzelfde watermerk. De client krijgt het uit de projecttoegang (§4.7). Dat is alleen weergave; de server blijft de bron.
- Eerdere exports blijven zoals ze zijn.

### 4.7 Client

**De projecttoegang naar de client:**

- `GET /api/projecten/[id]` geeft `toegang: { bewerken, limiet, watermerk, gekocht, gestempeld }` mee, plus de limieten.
- De projectlijst geeft per project `bewerken` en een label mee.

**Editor:**

- **Teller:** een gratis project met limiet toont in de editor "3 van 5 kringen" en "1 van 1 situatieschema". De plaats in de UI is de keuze van de bouwer, maar de teller staat altijd in beeld.
- **Bewaking vóór een wijziging:** een pure functie `telVoorLimiet(document)` telt het aantal kringen en situatieschema's. Ze staat in `@elentrik/model` of in `apps/web/shared/` en wordt gedeeld door de server en de client. Vóór elke operatie die het aantal verhoogt, controleert de editor het resultaat:
  - een kring toevoegen of dupliceren;
  - een sjabloon invoegen;
  - plakken;
  - een situatieschema toevoegen of een plan importeren.

  Gaat het resultaat over de limiet, dan wordt de operatie niet uitgevoerd en verschijnt het limietvenster.
- **Het limietvenster:**
  - voor een eigenaar: "Dit project gaat over de gratis limiet", met de prijs per project en twee knoppen: "Dit project vrijgeven" (naar Checkout) en "Een abonnement nemen" (naar `/abonnement`);
  - voor een lid: dezelfde uitleg met "Vraag de eigenaar van je bedrijf om dit project vrij te geven", zonder betaalknoppen;
  - zonder projectprijs: alleen de abonnementsknop.
- **Werk bewaren:** vóór de doorverwijzing naar Checkout bewaart de editor het project zoals het nu is (binnen de limiet). De geweigerde operatie wordt niet automatisch opnieuw uitgevoerd; na de terugkeer staat het project vrij en doet de gebruiker de actie opnieuw (mijn keuze, eenvoudiger en voorspelbaar).
- **Een 402 van de server** (`PROJECT_LIMIET` of `PROJECT_ALLEEN_LEZEN`, bv. als een ander venster sneller was): de wijziging blijft bewaard als lokaal concept, zoals bij de huidige 402. Het passende venster of de melding volgt.
- **Een project dat niet bewerkbaar is** (gestempeld na het abonnement), opent alleen-lezen. Een balk legt uit: "Dit project is gemaakt tijdens je abonnement. Je kan het bekijken en exporteren. Om te bewerken geef je het vrij of neem je opnieuw een abonnement." Een eigenaar krijgt de knoppen erbij.
- **Na de terugkeer** met `?vrijgave=`: de editor roept de synchronisatie aan, laadt het project opnieuw en toont "Dit project is vrijgegeven".

**Projectlijst:** een klein label per project: "Gratis", "Vrijgegeven" of "Alleen-lezen". Bij `uit`, `vrijgesteld`, `abonnement` en `onderwijs` is er geen label (mijn keuze: alleen tonen wat afwijkt).

**`/abonnement`:**

- Drie blokken: Gratis (de limieten en het watermerk), Per project (de prijs, uitgelegd vanuit de editor) en Abonnement (maand en jaar, zoals nu).
- Een onderwijsbedrijf ziet alleen "Onderwijsaccount: geen limieten, exports met watermerk", zonder kaarten (mijn keuze).
- De statusregels over de proefperiode verdwijnen, behalve tijdens de overgangsproef.

**Banner:**

- de proefbanner blijft alleen tijdens de overgangsproef;
- de banner voor een mislukte betaling blijft;
- de banner "alleen-lezen voor het hele bedrijf" verdwijnt.

### 4.8 Overgang (migratie)

- **Elk bestaand, niet-verwijderd project met een organisatie** krijgt `abonnement_stempel_op = moment van de migratie`.
- **Bestaande bedrijven** behouden `proef_einde`. Wie nog in de proef zit, telt tot dat moment als niveau `abonnement`, met stempels op wat bewaard wordt. Daarna gelden de nieuwe regels.
- **Nieuwe bedrijven** krijgen `proef_einde = now()`, als default en in beide aanmaakpaden.
- **Het verlengen van de proef in het beheerscherm** blijft bestaan (mijn keuze). Het werkt als "tijdelijke volledige toegang" en is handig voor een demo of een partner. De labels in het beheerscherm worden daaraan aangepast.

### 4.9 Beheerscherm

- **Bij een bedrijf:** een actie "Onderwijs aan/uit", naar het voorbeeld van de vrijstelling: met bevestiging, met een auditregel, en met dezelfde waarschuwing over lopende Stripe-abonnementen.
- **Bij een project:** `gekocht_op` en `abonnement_stempel_op` worden getoond, en de aankopen staan in de lijst.
- **De groepen in de filter worden:** `uit`, `vrijgesteld`, `onderwijs`, `abonnement`, `betalingsgratie`, `proef` (overgang) en `gratis`.

## 5. Testen

- **Unit:**
  - `bepaalBedrijfsniveau` en `bepaalProjecttoegang`: elke rij van de tabel in §4.3;
  - `telVoorLimiet`;
  - de stempel bij bewaren en aanmaken;
  - de kopie zonder `gekocht_op` en zonder stempel;
  - de idempotentie van de webhook voor een aankoop.
- **API, met de nep-Stripe:**
  - vrijgeven als eigenaar, en 403 als lid;
  - 409 bij een al gekocht project;
  - synchronisatie na de terugkeer;
  - een uitgestelde betaling;
  - 402 bij een PUT over de limiet;
  - een export met en zonder watermerk.
- **E2E:**
  - een gratis project tot de limiet, het venster, betalen via de nep-Stripe, en daarna verder tekenen;
  - een gestempeld project na het opzeggen: alleen-lezen, en een export zonder watermerk;
  - een onderwijsbedrijf: geen limiet, wel een watermerk.
- **Migratie:** bestaande projecten zijn gestempeld en een lopende proef blijft lopen.

## 6. Wat aan de bouwer blijft

- de exacte plaats en vorm van de teller, het limietvenster en de labels, binnen Nuxt UI en de bestaande stijl;
- de verfijning van de Franse en Engelse teksten;
- hoe de editor operaties onderschept: één centraal punt in de store heeft de voorkeur boven een controle per knop;
- de volgorde van de migratiestappen, zolang §4.8 klopt.

## 7. Open punten voor later

- Een terugbetaling in Stripe trekt de vrijgave in Elentrik niet in. Is dat nodig, dan zet de beheerder `gekocht_op` handmatig terug. Een beheeractie daarvoor komt later.
- Backlogvoorstel D: een abonnement zonder automatische verlenging, een gratis start voor jonge bedrijven en een herinneringsmail.
- Onderwijs: klassen, het werk van studenten bekijken, en een einddatum per schooljaar.
