# Elentrik: lokaal in gebruik nemen en online zetten

Praktische notities bij het inloggen en de organisaties (plan 6). Alles draait voorlopig op
`127.0.0.1`.

## De eerste echte registratie

De eerste gebruiker die zich registreert en zijn adres bevestigt, neemt alle bestaande gegevens
over: alle projecten zonder organisatie (met hun bestanden, snapshots en exports) en de bestaande
bedrijfsgegevens. Dat gebeurt één keer.

1. **Maak eerst een back-up.**
   - De database: `pg_dump` van de database `elentrik`, bijvoorbeeld
     `docker exec elentrik-postgres-1 pg_dump -U elentrik elentrik > elentrik-voor-registratie.sql`.
   - De bestanden: een kopie van de map `apps/web/.data/bestanden`.
2. **Registreer eerst je eigen account**, op `http://127.0.0.1:3000/registreren`, met de naam van
   je eigen bedrijf. Laat niemand anders zich eerder registreren: wie eerst bevestigt, krijgt de
   gegevens.
3. **De overname gebeurt bij de eerste bevestigde aanmelding**, dus wanneer je op de link in de
   bevestigingsmail klikt (in Mailpit op `http://127.0.0.1:8025`). Daarna staan je projecten en
   bedrijfsgegevens in je nieuwe organisatie.
4. **Draai Playwright niet tussen het registreren en het klikken op de link.** De e2e-tests maken
   de Mailpit-inbox leeg, en dan is je bevestigingsmail weg.
5. **Is de mail toch weg of verlopen** (de link is 24 uur geldig)? Probeer in te loggen en kies
   "Bevestigingsmail opnieuw sturen".

## Voor Elentrik online gaat

- **Adressen:** zet `BETTER_AUTH_URL` op de publieke URL (bijvoorbeeld `https://app.elentrik.be`).
  Zet ook `NUXT_AUTH_BASIS_URL` op dezelfde waarde: de basis-URL van de auth-client tijdens SSR
  wordt bij het bouwen vastgelegd, en die variabele overschrijft ze bij het starten.
- **Cookies:** `Secure` gaat vanzelf aan zodra `BETTER_AUTH_URL` met `https://` begint. Lokaal
  (http) staat het uit. Cookies blijven `HttpOnly` en `SameSite=Lax`.
- **Rate limiting achter een proxy:** de auth-route vervangt `x-forwarded-for` door het IP van de
  socket, zodat een client zijn IP niet kan kiezen. Achter een reverse proxy is dat IP altijd dat
  van de proxy: dan delen alle gebruikers één teller. Vóór het online gaan is een ontwerp nodig
  dat de proxy vertrouwt (alleen haar `x-forwarded-for`, en alleen van haar adres).
- **CSRF en de Origin-controle:** de eigen API-routes weigeren een wijzigend verzoek (POST, PUT,
  PATCH, DELETE) van een andere site met 403: op `Sec-Fetch-Site: cross-site`, en op elke
  `Origin` die niet de basis-URL is (ook als de browser het verzoek `same-site` noemt, zoals een
  andere lokale app op een andere poort). Better Auth controleert de `Origin` van zijn
  eigen routes tegen `trustedOrigins`. Beide volgen `BETTER_AUTH_URL`; wijst die naar `127.0.0.1`,
  dan geldt ook `localhost` op dezelfde poort. Een ander domein (bijvoorbeeld `www.` naast het
  hoofddomein) moet je dus expliciet toevoegen of vermijden.
- **Mail:** lokaal gaat alles naar Mailpit. Voor een echte mailserver:
  - `SMTP_HOST` en `SMTP_PORT`: de server en de poort;
  - `SMTP_GEBRUIKER` en `SMTP_WACHTWOORD`: de aanmelding (allebei nodig, anders geen aanmelding);
  - `SMTP_BEVEILIGD=true`: TLS vanaf het begin van de verbinding (meestal poort 465);
  - `SMTP_VAN`: de afzender.

  Die waarden staan alleen in `.env` en worden nooit gelogd.
- **Geheim:** `BETTER_AUTH_SECRET` is een eigen, lange willekeurige waarde (minstens 32 tekens),
  alleen in `.env` en nooit in de repo.
