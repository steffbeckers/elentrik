# Instance-ping

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

> De ping is nog in voorbereiding en zit nog niet in de code. Dit document beschrijft hoe hij zal werken.
