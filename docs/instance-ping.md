# Instance-ping

Een productieversie van Elentrik die buiten de officiële omgevingen draait, meldt zich bij
<https://elentrik.app>: kort na het opstarten en daarna één keer per dag. Zo is zichtbaar welke
installaties zonder licentie draaien. De ping is open en gedocumenteerd, niet verborgen.

## Wanneer de ping verstuurt

Alleen als alle vier de voorwaarden kloppen:

1. Het is een productiebuild (`NODE_ENV=production`).
2. `ELENTRIK_OMGEVING` is niet gezet. De officiële omgevingen (productie en staging) sturen dus niets.
3. `ELENTRIK_INSTANCE_PING` is niet `uit`.
4. De geplande taken staan aan. `ELENTRIK_GEPLANDE_TAKEN=uit` zet de ping dus ook uit.

De eerste melding gaat 60 seconden na het opstarten weg. Daarna volgt elke dag om 03:30 (de tijdzone
van de container) de taak `instance:ping`. `pnpm dev`, de tests en de e2e-tests melden zich nooit.

## Wat er verstuurd wordt

| Veld | Inhoud |
| --- | --- |
| `instanceId` | Een willekeurige id, één keer aangemaakt en bewaard in de database van de installatie. |
| `host` | De hostnaam uit `BETTER_AUTH_URL`, zonder schema, poort of pad. |
| `versie` | De commit van de build (`ELENTRIK_REVISIE`, door de Dockerfile gezet), of `"onbekend"`. |
| `abonnementenAan` | Of `STRIPE_GEHEIME_SLEUTEL` gezet is. |
| `aantalOrganisaties` | Het aantal organisaties. |
| `aantalGebruikers` | Het aantal gebruikers. |

Er gaan geen namen, e-mailadressen of projectgegevens mee. De melding is een korte POST met
JSON naar `https://elentrik.app/api/instances`. Een mislukte melding geeft hooguit één waarschuwing in
het log en nooit een fout in de app.

## Wat elentrik.app bewaart

elentrik.app bewaart de zes velden en daarnaast het IP-adres van de laatste melding. Een rij blijft
12 maanden na de laatste melding staan en wordt daarna automatisch verwijderd.

## Waarom

Het doel is licentiehandhaving: zien welke kopieën van Elentrik buiten de officiële omgevingen
draaien. De gegevens worden niet gedeeld met anderen en niet voor iets anders gebruikt. Zie ook de
[privacytekst](privacy-instance-ping.md).

## Uitzetten

Zet `ELENTRIK_INSTANCE_PING=uit` in de omgeving van de server (op de NAS in `.env`, zie
[`docs/online.md`](online.md)). Ook `ELENTRIK_GEPLANDE_TAKEN=uit` zet de ping uit, maar dat zet
alle geplande taken uit. Uitzetten geeft geen rechten bovenop wat de licentie toestaat.
