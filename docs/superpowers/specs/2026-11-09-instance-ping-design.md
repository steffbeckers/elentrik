# Instance-ping: zelf gehoste kopieën melden zich

Status: ontwerp, wacht op goedkeuring van de gebruiker.

## Bedoeling

De repository is publiek en blijft dat: de gebruiker wil dat andere developers features kunnen
bijdragen. Tegelijk wil hij weten of iemand Elentrik zelf uitrolt en gebruikt zonder licentie of
betaling. Zonder `STRIPE_GEHEIME_SLEUTEL` zijn de abonnementen uit en gelden er geen limieten, dus een
zelf gehoste kopie geeft alles gratis.

De instance-ping maakt zulke kopieën zichtbaar. Een productiebuild buiten de officiële omgevingen meldt
zich één keer per dag bij `https://elentrik.app`. De officiële server bewaart die meldingen en toont ze
in het admin-dashboard.

De ping is **open en gedocumenteerd**, niet verborgen. Wie hem wil omzeilen, kan dat toch: de code is
publiek. Het doel is zicht en, waar nodig, bewijs, en geen technische blokkade. Verborgen verzamelen zou
botsen met de transparantieplicht van de GDPR (art. 13 en 14) en met de open houding van het project.

## Doelen

- Een zelf gehoste productie-installatie meldt zich automatisch, zonder dat iemand iets moet instellen.
- In het admin-dashboard op elentrik.app ziet een superuser welke installaties bestaan, op welke host ze
  draaien, welke versie ze hebben, of Stripe aan staat en hoeveel organisaties en gebruikers ze tellen.
- De ping is beschreven in de README en vermeld in de LICENSE, en hij is uit te schakelen.

## Niet-doelen

- Geen blokkade, licentiesleutel of functies die uitvallen zonder licentie.
- Geen persoonsgegevens van de gebruikers van een kopie: geen namen, geen e-mailadressen, geen
  projectinhoud, geen organisatienamen.
- Geen marketingsite op `elentrik.be`. De meldingen gaan naar `elentrik.app`.
- De aanpassing van de LICENSE voor bijdragers (een licentie die lokaal draaien en wijzigen toelaat)
  valt buiten dit ontwerp en gebeurt in een aparte sessie. Dit ontwerp voegt alleen een korte vermelding
  van de ping toe.

## Anti-doelen

Het is mislukt, ook als het technisch werkt, als:

- een developer die met `pnpm dev`, de tests of e2e werkt, zich meldt;
- de officiële productie of staging zich bij zichzelf meldt;
- een mislukte ping (geen netwerk, elentrik.app plat, time-out) een fout, vertraging of logspam geeft
  bij de zelf gehoste installatie;
- het ontvangende eindpunt op elentrik.app misbruikt kan worden om de database te vullen of de server te
  belasten;
- er iets verstuurd wordt dat niet in de README staat.

## Wanneer meldt een installatie zich

De ping is actief als alle voorwaarden kloppen:

1. `NODE_ENV === "production"` (een productiebuild; `pnpm dev` en Vitest vallen weg);
2. `ELENTRIK_OMGEVING` is leeg (de officiële productie en staging zetten `productie` of `staging`);
3. `ELENTRIK_INSTANCE_PING` is niet `uit`;
4. de geplande taken staan aan (`geplandeTakenAan()` in `server/taken/lock.ts`). Dat geldt voor de
   ping na het opstarten en voor de dagelijkse ping, zodat `ELENTRIK_GEPLANDE_TAKEN=uit` beide stopt.

De e2e-server en elke container die `deploy/nas/rooktest.sh` start, zetten daarnaast expliciet
`ELENTRIK_INSTANCE_PING=uit`. Die containers draaien het productie-image met `NODE_ENV=production` en
zonder `ELENTRIK_OMGEVING`, en mogen zich nooit bij elentrik.app melden. (Mijn keuze, na de controle
door de reviewer.)

Een productiebuild die lokaal op `127.0.0.1` of `localhost` draait, meldt zich wel. Wie een build lokaal
test, is ook een uitrol. **Keuze van de bouwer bevestigen:** lokale hosts uitsluiten maakt het omzeilen
triviaal (alleen een andere `BETTER_AUTH_URL`) en levert weinig op. Daarom geen uitzondering.

## Wanneer wordt er verstuurd

- Eén keer kort na het opstarten. Een vertraging van ongeveer een minuut, zodat de database en de
  migraties klaar zijn.
- Daarna één keer per dag via de bestaande geplande taken van Nitro (`scheduledTasks` in
  `apps/web/nuxt.config.ts`), als een nieuwe taak `instance:ping`.
- De geplande taken draaien standaard alleen in productie. `ELENTRIK_GEPLANDE_TAKEN=uit` schakelt alle
  taken uit, dus ook de ping. Dat is aanvaardbaar en wordt zo gedocumenteerd.
- Met een time-out van 10 seconden. Een fout wordt hooguit één keer per proces als waarschuwing gelogd
  en verder genegeerd. Er is geen nieuwe poging buiten de dagelijkse taak.

## Wat er verstuurd wordt

Een `POST` naar `https://elentrik.app/api/instances`, met JSON:

| Veld | Inhoud |
| --- | --- |
| `instanceId` | Een willekeurige UUID, één keer aangemaakt en bewaard in de database van de installatie. |
| `host` | De hostnaam uit `BETTER_AUTH_URL`, zonder schema, poort of pad. |
| `versie` | De commit van de build als die bekend is (zie hieronder), anders `"onbekend"`. |
| `abonnementenAan` | `true` als `STRIPE_GEHEIME_SLEUTEL` gezet is. |
| `aantalOrganisaties` | Het aantal rijen in `organization`. |
| `aantalGebruikers` | Het aantal rijen in `user`. |

Het adres van het eindpunt staat in de code als constante. Een variabele `ELENTRIK_INSTANCE_PING_URL`
mag het overschrijven, alleen voor tests.

**Versie:** de app kent zijn commit nu niet tijdens het draaien. Het image krijgt al het label
`org.opencontainers.image.revision` in `.github/workflows/web-image.yml`. De bouwer geeft dezelfde commit
mee als build-argument en omgevingsvariabele (bv. `ELENTRIK_REVISIE`) in de Dockerfile. Wie zelf bouwt
zonder dat argument, stuurt `"onbekend"`.

**Instance-ID:** een nieuwe tabel van één rij in de database van de installatie (bv. `instance` met
`id` en `aangemaakt_op`), aangemaakt bij de eerste ping. Bewaren in de database en niet in een bestand,
zodat de ID een herstart en een nieuw image overleeft.

## Ontvangen op elentrik.app

- Het eindpunt `POST /api/instances` neemt alleen meldingen aan als `ELENTRIK_OMGEVING=productie`. Op
  staging, lokaal en in e2e antwoordt het `404`, zodat kopieën die naar zichzelf wijzen niets opslaan.
  **Bouwer, bevestigen:** een zelf gehoste kopie draait zonder `ELENTRIK_OMGEVING` en heeft het eindpunt
  dus niet actief.
- Er is geen aanmelding nodig. Het eindpunt valt buiten de CSRF-controle en de controle van de
  clientversie die voor de gewone API gelden. De bouwer kijkt na hoe `server/middleware/clientversie.ts`
  en de CSRF-hulp met zo'n route omgaan.
- Validatie: `instanceId` is een UUID, `host` is een geldige hostnaam van hoogstens 253 tekens, `versie`
  hoogstens 64 tekens, de aantallen zijn gehele getallen van 0 tot 10 miljoen. Bij ongeldige invoer
  antwoordt het `400` en wordt er niets opgeslagen. Het lichaam is hoogstens 2 kB.
- Limiet: hoogstens 10 meldingen per IP per uur, in het geheugen, met het IP zoals `server/net.ts` het
  bepaalt achter de Cloudflare Tunnel. IPv6-adressen tellen per /64. Daarboven `429`.
- Plafond voor nieuwe installaties (mijn keuze, na de controle door de reviewer): hoogstens 100 nieuwe
  `instanceId`'s per kalenderdag, geteld in de database (`eerste_melding_op`), zodat een herstart het
  plafond niet wist. Een melding voor een bestaande `instanceId` wordt altijd bijgewerkt. Een nieuwe
  boven het plafond wordt niet opgeslagen. Het antwoord blijft `204`, en de server logt één waarschuwing
  per dag dat het plafond bereikt is.
- Opslag in een nieuwe tabel `instance_meldingen`, één rij per `instanceId` (upsert):
  - `instance_id` (primaire sleutel), `host`, `versie`, `abonnementen_aan`, `aantal_organisaties`,
    `aantal_gebruikers`;
  - `eerste_melding_op`, `laatste_melding_op`, `aantal_meldingen`;
  - `laatste_ip`: het IP van de laatste melding. **Mijn keuze:** het IP helpt een kopie te
    identificeren en is daarom de moeite waard. Het wordt in de README vermeld.
- Het antwoord is `204` zonder inhoud. De verzender doet niets met het antwoord.

## Weergave in het admin-dashboard

Een nieuwe pagina **Installaties** in `/admin`, alleen voor superusers, met dezelfde bescherming als de
andere admin-pagina's (`server/admin/toegang.ts`):

- een tabel met host, versie, Stripe aan of uit, organisaties, gebruikers, eerste melding, laatste
  melding en IP, standaard gesorteerd op de laatste melding, nieuwste eerst;
- een installatie zonder melding in de laatste 7 dagen wordt als "stil" gemarkeerd;
- alleen lezen, geen bewerkingen. Verwijderen kan later.

De vormgeving volgt de bestaande admin-pagina's en `DESIGN.md`. De labels komen in de drie talen van de
interface.

## Documentatie

- **README:** een sectie "Instance-ping" met wanneer hij verstuurt, het volledige veld per veld,
  dat elentrik.app het IP bewaart, waarom (licentiehandhaving) en hoe je hem uitzet
  (`ELENTRIK_INSTANCE_PING=uit`).
- **`apps/web/.env.example`:** de variabele `ELENTRIK_INSTANCE_PING`, uitgecommentarieerd, met uitleg.
- **LICENSE:** één alinea dat een uitgerolde kopie zich meldt bij elentrik.app, met een verwijzing naar
  de README. Verder blijft de LICENSE ongewijzigd. De grotere aanpassing komt in een aparte sessie.
- **Privacytekst:** een korte tekst in `docs/` die de gebruiker later in een privacyverklaring kan
  opnemen: verwerkingsverantwoordelijke, doel (licentiehandhaving), grondslag (gerechtvaardigd belang),
  gegevens, bewaartermijn (**mijn keuze:** 12 maanden na de laatste melding) en hoe je bezwaar maakt.
  De dagelijkse opruimtaak verwijdert meldingen ouder dan die termijn.

## Tests

- Unit: de voorwaarden van "wanneer meldt een installatie zich", het opbouwen van de inhoud
  (host uit `BETTER_AUTH_URL`) en de validatie van het eindpunt.
- Integratie: het eindpunt slaat op en werkt bij met een upsert, weigert buiten productie, weigert
  ongeldige invoer en past de limiet toe. Altijd op de testdatabase, nooit op de echte DB `elentrik`.
- Verzender: met een lokale nep-server via `ELENTRIK_INSTANCE_PING_URL`; een time-out of fout geeft
  geen uitzondering.
- e2e: de admin-pagina toont een melding die de test zelf in `elentrik_e2e` zet.

## Aan de bouwer overgelaten

- de exacte namen van bestanden, taken, tabellen en kolommen, binnen de conventies van de repo;
- hoe de opstartvertraging gebouwd wordt (Nitro-plugin met timer of een taak);
- de opmaak van de admin-pagina binnen de bestaande stijl.
