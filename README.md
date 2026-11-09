# Elentrik

Elentrik is een webapplicatie voor kleine Belgische elektro-installateurs. Je maakt er van een
residentiële elektrische installatie een volledig keuringsdossier mee: een eendraadschema, een
situatieschema, een kringenlijst en AREI-bevindingen, samen in één pdf.

- Productie: <https://elentrik.app>
- Staging: <https://staging.elentrik.app>

> **Let op:** de AREI-regels in Elentrik zijn nog niet gepubliceerd en niet door een expert
> nagekeken. Sommige parameters zijn voorlopig. De live bevindingen zijn een hulpmiddel en geen
> keuring, geen volledige toetsing aan het AREI en geen garantie dat een installatie de keuring
> doorstaat.

## Wat het doet

1. Je maakt een project en vult de gegevens van de installatie en de klant in.
2. Je bouwt de elektrische structuur op: verdeelborden, beveiligingen, kringen en punten.
   Sjablonen voor kringen besparen herhaald werk. Het eendraadschema schikt zichzelf automatisch.
3. Je plaatst de punten op een situatieschema: een geïmporteerde pdf of afbeelding, of een
   grondplan dat je zelf tekent in de ingebouwde 2D-editor.
4. Je leest de bevindingen na en motiveert waar nodig een afwijking.
5. Je exporteert het dossier als pdf, op A4 of A3, met de onderdelen die je kiest.

Daarnaast: een kringenlijst en een materiaallijst die uit het schema volgen, automatisch bewaren,
ongedaan maken en opnieuw doen, herstel van lokale concepten, conflictafhandeling, organisaties
met eigenaars en leden, uitnodigingen, bedrijfsgegevens en abonnementen via Stripe.

De interface bestaat in het Nederlands (`nl-BE`, standaard), het Frans (`fr-BE`) en het Engels
(`en-GB`). De taal van het dossier kies je per project, los van de taal van de interface.

## Opbouw van de repository

Een pnpm-monorepo in TypeScript.

| Map | Wat |
| --- | --- |
| `apps/web` | De webapplicatie: Nuxt 4, Vue, Nuxt UI, Pinia, Drizzle (PostgreSQL), Better Auth en Stripe. |
| `apps/plan-editor` | De 2D-grondplaneditor, gebouwd op OpenPlan3D (MIT, zie de README in die map) en in een iframe geladen. |
| `packages/model` | Het documentmodel van een installatie: bewerkingen, migraties en de materiaallijst. |
| `packages/arei` | De analyse van de installatie en de AREI-regelsets, met berichten in drie talen. |
| `packages/layout` | De automatische schikking en paginering van het eendraadschema. |
| `packages/symbols` | De elektrische symbolen als SVG. |
| `packages/render` | Het schema, het situatieschema, de kringenlijst en de printversie van het dossier. |
| `infra` | De Docker-diensten voor lokale ontwikkeling en de e2e-tests. |
| `docs` | Handleidingen, specificaties, plannen en de woordenlijst. |

## Lokaal aan de slag

Je hebt nodig: Node.js 24 of nieuwer, pnpm 12.15.0 (via Corepack, zie `packageManager` in
`package.json`) en Docker.

```sh
pnpm install
pnpm db:up                     # PostgreSQL, Gotenberg (pdf's) en Mailpit (mail), alleen op 127.0.0.1
cp apps/web/.env.example apps/web/.env
# Vul in apps/web/.env een eigen, lange willekeurige BETTER_AUTH_SECRET in (minstens 32 tekens).
pnpm db:migrate
pnpm dev                       # http://127.0.0.1:3000
```

- Registreren en inloggen doe je op `http://127.0.0.1:3000`. Bevestigingsmails komen in Mailpit
  op `http://127.0.0.1:8025`.
- Zonder Stripe-sleutels staan abonnementen uit en raakt lokaal gebruik nooit geblokkeerd.
- Lees vóór je eerste echte registratie [`docs/lokaal-en-online.md`](docs/lokaal-en-online.md):
  de eerste bevestigde gebruiker neemt alle bestaande projecten over.

## Testen

```sh
pnpm test:parallel             # unit- en integratietests (Vitest)
pnpm test:prestatie            # prestatietests, één bestand tegelijk
pnpm test                      # allebei
pnpm typecheck                 # alle pakketten
```

De end-to-end-tests (Playwright) draaien tegen een eigen server, een eigen database
(`elentrik_e2e`), een eigen Mailpit-inbox en een nep-Stripe. Ze raken de ontwikkeldatabase en de
ontwikkelbestanden nooit.

```sh
docker compose -f infra/docker-compose.yml up -d postgres-e2e mailpit-e2e
pnpm --filter @elentrik/web exec playwright test
```

## Werkwijze

- `develop` is de standaardbranch. Werk op een featurebranch vanaf `develop` en open een PR naar
  `develop`. Daarna gaat `develop` via een PR naar `staging` (staging.elentrik.app) en `staging`
  via een PR naar `main` (elentrik.app).
- Merge elke PR met **"Create a merge commit"**, ook de promoties, zodat de drie branches niet
  uit elkaar lopen.
- De CI (`.github/workflows/web-image.yml`) draait de tests en de typecheck voor `develop` en bouwt
  het Docker-image voor `staging` en `main`.
- Nieuwe teksten voor gebruikers komen altijd in de drie talen. De afgesproken termen staan in
  [`docs/vertalingen.md`](docs/vertalingen.md); pariteitstests bewaken de vertaalbestanden.
- Code, symbolen, vertalingen en teksten zijn eigen werk. Neem niets over uit andere software.

## Documentatie

- [`PRODUCT.md`](PRODUCT.md): doel, gebruikers, scope en grenzen van het product.
- [`DESIGN.md`](DESIGN.md): de visuele richtlijnen.
- [`docs/lokaal-en-online.md`](docs/lokaal-en-online.md): lokaal gebruik, talen, abonnementen en
  Stripe, en de e2e-opstelling.
- [`docs/admin-beheer.md`](docs/admin-beheer.md): het superuserdashboard en systeembeheer.
- [`docs/vertalingen.md`](docs/vertalingen.md): de woordenlijst in drie talen.
- [`docs/superpowers`](docs/superpowers): ontwerpspecificaties en implementatieplannen.
- [`docs/backlog`](docs/backlog): ideeën voor later.

## Bijdragen

Bijdragen zijn welkom. Lees eerst [`CONTRIBUTING.md`](CONTRIBUTING.md): hoe je lokaal opzet, hoe je
een pull request maakt, de clean-room-regel en de [CLA](CLA.md) die je één keer tekent.

## Instance-ping

Een productieversie van Elentrik die buiten de officiële omgevingen draait, meldt zich bij
<https://elentrik.app>: kort na het opstarten en daarna één keer per dag. Zo is zichtbaar welke
installaties zonder licentie draaien. De ping is open en gedocumenteerd, niet verborgen.

| Veld | Inhoud |
| --- | --- |
| `instanceId` | Een willekeurige id, één keer aangemaakt en bewaard in de database van de installatie. |
| `host` | De hostnaam uit `BETTER_AUTH_URL`, zonder schema, poort of pad. |
| `versie` | De commit van de build, of `"onbekend"`. |
| `abonnementenAan` | Of `STRIPE_GEHEIME_SLEUTEL` gezet is. |
| `aantalOrganisaties` | Het aantal organisaties. |
| `aantalGebruikers` | Het aantal gebruikers. |

Er gaan geen namen, e-mailadressen of projectgegevens mee. elentrik.app bewaart daarnaast het IP-adres
van de melding. `pnpm dev`, de tests en de e2e-tests melden zich niet. Uitzetten kan met
`ELENTRIK_INSTANCE_PING=uit`; dat geeft geen rechten bovenop de licentie.

> De ping is nog in voorbereiding en zit nog niet in de code. Deze sectie beschrijft hoe hij zal werken.

## Licentie

Elentrik valt onder de **Elentrik Bronlicentie** (zie [`LICENSE`](LICENSE)). De Nederlandse tekst is
bindend; er staat een Engelse vertaling naast.

- **Mag:** de code bekijken, lokaal draaien, wijzigen en testen om bij te dragen, en je wijzigingen
  voorleggen via een pull request.
- **Mag niet zonder schriftelijke toestemming:** Elentrik in productie gebruiken (ook voor je eigen
  bedrijf), het als dienst aanbieden of zelf hosten, het doorverkopen, of er een concurrerend product
  mee maken.

Elentrik in productie gebruiken doe je via <https://elentrik.app>. Voor een andere licentie:
<steff@steffbeckers.com>.

Software van derden valt onder haar eigen licentie: de afhankelijkheden in de `package.json`-bestanden
en de code van OpenPlan3D in `apps/plan-editor/vendor/openplan3d` (MIT).
