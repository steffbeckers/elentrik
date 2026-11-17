# Privacy: de instance-ping

Deze tekst is bedoeld om in een privacyverklaring op te nemen. Ze moet nog juridisch worden nagekeken.
Wat er technisch gebeurt, staat in [`docs/instance-ping.md`](instance-ping.md).

- **Verwerkingsverantwoordelijke:** Steff Beckers, steff@steffbeckers.com.
- **Doel:** licentiehandhaving. Zien welke kopieën van Elentrik buiten de officiële omgevingen draaien.
- **Grondslag:** gerechtvaardigd belang (art. 6.1.f AVG), namelijk het beschermen van de licentie op de software.
- **Gegevens:** een willekeurige instance-id, de hostnaam, de versie, of abonnementen aan staan, het
  aantal organisaties en het aantal gebruikers, plus het IP-adres van de laatste melding, het tijdstip
  van de eerste en de laatste melding en een teller van het aantal meldingen. Geen namen,
  e-mailadressen of projectgegevens. Een kopie zonder geldige `BETTER_AUTH_URL` stuurt niets.
- **Bewaartermijn:** 12 maanden na de laatste melding. Daarna worden de gegevens verwijderd.
- **Ontvangers:** de gegevens lopen via de hosting (de server van Steff Beckers) en Cloudflare (tunnel),
  die ze als verwerkers doorgeven aan de server. Ze worden niet met anderen gedeeld.
- **Rechten en bezwaar:** u kunt de melding uitzetten met `ELENTRIK_INSTANCE_PING=uit`. U kunt ook
  mailen naar steff@steffbeckers.com om inzage, verwijdering of bezwaar te vragen.
