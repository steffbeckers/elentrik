# Bijdragen aan Elentrik

Bedankt dat je wilt bijdragen. Elentrik is een commercieel product op <https://elentrik.app>, met een
publieke repository. Je mag de code bekijken, lokaal draaien, wijzigen en testen om bij te dragen. In
productie gebruiken of zelf hosten mag niet zonder schriftelijke toestemming. Zie [`LICENSE`](LICENSE).

*English speakers: see [In English](#in-english) at the bottom.*

## Voor je begint

1. **Lees de [`LICENSE`](LICENSE) en de [`CLA.md`](CLA.md).** Met de CLA geef je de rechthebbende een
   ruime licentie op je bijdragen, zodat die ze commercieel kan gebruiken en later onder een andere
   licentie kan verspreiden. Je blijft eigenaar van je auteursrecht.
2. **Teken de CLA één keer** door in je eerste pull request deze zin als opmerking te plaatsen:

   > Ik heb de CLA gelezen en ga ermee akkoord.

   Zonder die opmerking kan je pull request niet gemerged worden.
3. **Open voor een grotere wijziging eerst een issue**, zodat we de aanpak kunnen afstemmen voor je er
   veel tijd in steekt.

## Clean room: alleen eigen werk

Neem **geen code, symbolen, teksten, vertalingen of ontwerpen over uit andere software**, ook niet uit
andere programma's voor elektrische schema's, en ook niet "even ter inspiratie" met kleine
aanpassingen. Alles in Elentrik is eigen werk. Vermeld ook geen namen van concurrerende producten in de
code of de documentatie.

Een nieuwe open-sourceafhankelijkheid mag wel, als haar licentie dat toelaat. Vermeld ze met haar
licentie in je pull request.

## Lokaal opzetten

Je hebt nodig: Node.js 24 of nieuwer, pnpm 12.15.0 (via Corepack) en Docker.

```sh
pnpm install
pnpm db:up
cp apps/web/.env.example apps/web/.env
# Vul in apps/web/.env een eigen, lange willekeurige BETTER_AUTH_SECRET in (minstens 32 tekens).
pnpm db:migrate
pnpm dev                       # http://127.0.0.1:3000, mail in Mailpit op http://127.0.0.1:8025
```

De opbouw van de repository staat in de [`README.md`](README.md).

## Een wijziging maken

- Maak een branch vanaf `develop` en open je pull request naar `develop`.
- Houd een pull request klein en gericht op één wijziging.
- Schrijf commitberichten in het Engels, in de vorm `type(scope): beschrijving`, bijvoorbeeld
  `feat(web): ...`, `fix(arei): ...` of `docs: ...`.
- **Nieuwe teksten voor gebruikers** komen altijd in de drie talen: Nederlands, Frans (Belgisch, met
  "vous") en Engels (Brits). Gebruik de termen uit [`docs/vertalingen.md`](docs/vertalingen.md). De
  pariteitstests falen als een taal ontbreekt.
- Behoud de Belgische technische notatie op schema's, in alle talen.
- Voeg tests toe voor nieuw gedrag en voor een opgeloste fout.
- Tests raken nooit de ontwikkeldatabase `elentrik` of `apps/web/.data/bestanden`. De e2e-tests
  gebruiken alleen `elentrik_e2e`.

## Controleren voor je een pull request opent

```sh
pnpm test:parallel
pnpm typecheck
```

Raakt je wijziging de interface, draai dan ook de e2e-tests:

```sh
docker compose -f infra/docker-compose.yml up -d postgres-e2e mailpit-e2e
pnpm --filter @elentrik/web exec playwright test
```

De CI draait de tests en de typecheck voor elke pull request naar `develop`.

## Na je pull request

De rechthebbende leest elke pull request na en beslist of die wordt opgenomen. Een pull request wordt
gemerged met een merge commit. Er is geen verplichting om een bijdrage op te nemen, en er is geen
vergoeding voor bijdragen.

## Vragen

Open een issue, of mail naar <steff@steffbeckers.com>, ook voor een licentie om Elentrik in productie te
gebruiken.

---

## In English

Elentrik is a commercial product at <https://elentrik.app> with a public repository. You may view, run
locally, modify and test the code in order to contribute. Using it in production or hosting it yourself
is not allowed without written permission. Only the Dutch text of the [`LICENSE`](LICENSE) is binding;
an English translation is included in the same file.

1. **Read the [`LICENSE`](LICENSE) and the [`CLA.md`](CLA.md)** (both include an English translation).
   With the CLA you grant the licensor a broad license on your contributions, so they can be used
   commercially and later distributed under a different license. You keep your copyright.
2. **Sign the CLA once** by posting this sentence as a comment in your first pull request:

   > I have read the CLA and I agree to it.

3. **Clean room:** do not copy code, symbols, texts, translations or designs from other software. All
   of Elentrik is original work. Open-source dependencies are fine if their license allows it; list them
   with their license in the pull request.
4. **Set up and check** as described above: branch from `develop`, open the pull request against
   `develop`, run `pnpm test:parallel` and `pnpm typecheck`. New user-facing text must be added in Dutch,
   Belgian French and British English.
5. For a larger change, open an issue first. Questions: open an issue or email
   <steff@steffbeckers.com>.
