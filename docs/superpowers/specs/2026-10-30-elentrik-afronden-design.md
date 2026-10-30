# Elentrik: afronden na plan 11 (ontwerp)

- **Datum:** 2026-10-30
- **Status:** ter goedkeuring
- **Bouwt voort op:**
  - plan 11 "verstevigen" (`docs/superpowers/specs/2026-10-30-elentrik-verstevigen-design.md`), live op staging en productie sinds 2026-10-30;
  - de lijst met geparkeerde opvolgpunten uit de plannen 3 tot en met 11.
- **Beslist met de gebruiker:**
  - de resterende opvolgpunten worden aangepakt ("Ga maar verder met die punten");
  - de gebruiker volgt mijn aanbevolen keuzes.
- **Mijn keuzes:**
  - de opdeling: dit plan (12) neemt de opvolgpunten uit plan 11 en de technische schuld;
  - de toegankelijkheid wordt plan 13, en de snelheid plan 14 (eerst meten);
  - alle andere keuzes in dit document.

## 1. Waarom

Plan 11 maakte de bestanden en de gebruikersfouten betrouwbaar. Bij de reviews bleven er een paar gaten over:
- een document kan nog naar een plan van een ander project verwijzen;
- een abonnee kan de NAS vullen door plannen te laten kopiëren;
- twee foutpaden van de inloglinks geven nog een kale fout.

Daarnaast is er technische schuld uit de vorige plannen die het onderhoud trager en de tests brozer maakt. Geen van beide vraagt een nieuwe functie.

## 2. Doelen, niet-doelen en anti-doelen

### A. Opvolgpunten uit plan 11

1. **Planverwijzingen bij het bewaren.**
   - `PUT /api/projecten/:id` controleert de `origineelBestandId` en `rasterBestandId` in het document die **nieuw** zijn, dus die niet al in het bewaarde document van dit project stonden (mijn keuze).
   - Zo'n nieuwe id moet een bestand van **dit** project zijn, van de soort `plan-origineel` of `plan-raster`. Anders volgt `422` met de nieuwe code `PLANBESTAND_ONBEKEND` (mijn keuze), en de editor toont de vertaalde melding.
   - Een id die al in het bewaarde document stond, blijft aanvaard, ook als hij naar een ander project of naar niets verwijst (een oude kopie, of een bestand dat niet gekopieerd kon worden). Zo wordt een bestaand project nooit geweigerd, en kan een document geen nieuwe verwijzing naar een vreemd bestand meer krijgen.
   - `dupliceer` en `uit-document` veranderen niet: zij kopiëren wat ze kunnen, en de rest blijft staan zoals in plan 11. Er komt geen controle op hun invoer.
2. **Opslaglimiet per bedrijf** (mijn keuze):
   - **De limiet:** standaard **5 GB** per bedrijf, in te stellen met `ELENTRIK_OPSLAG_PER_BEDRIJF_MB`.
   - **Wat telt mee:** de som van `bestanden.grootte` van de levende projecten van het bedrijf, plus zijn logo's. Projecten in de prullenbak tellen niet mee.
   - **Wat de limiet tegenhoudt:** een upload (plan of logo), `dupliceer` en `uit-document`, die de limiet zouden overschrijden, krijgen `413` met de nieuwe code `OPSLAG_VOL`. De editor toont de vertaalde melding.
   - **Wat de limiet niet tegenhoudt:** exports. Een PDF maken lukt altijd, maar telt wel mee.
   - De controle gebeurt vóór er iets geschreven wordt.
3. **Bevestiging van het e-mailadres.**
   - Faalt er iets na het klikken op de bevestigingslink (`/api/auth/verify-email`, met de sessiehook van de eerste aanmelding), dan volgt dezelfde 302 als bij de inloglink: naar `/inloggen?fout=INLOGLINK_MISLUKT`, in plaats van een kale 500.
   - De melding van plan 11 wordt hergebruikt (mijn keuze).
4. **Terug naar waar de link heen moest.**
   - Bij die foutredirect blijft de oorspronkelijke `callbackURL` bewaard, bv. een uitnodiging, als `/inloggen?fout=…&terug=<pad>`.
   - "Stuur een nieuwe link" stuurt de nieuwe link met die bestemming.
   - Alleen een relatief pad dat met één `/` begint, wordt aanvaard. Al de rest valt weg.
5. **Upload in een verwijderd project.** Een 404 bij het uploaden van een plan zet de editor in dezelfde toestand "verwijderd" als een 404 bij het bewaren (plan 11, punt 9), in plaats van een algemene foutmelding.
6. **Opruimtaak:**
   - **Opslagmap onbereikbaar:** is de opslagmap er niet, of is ze leeg terwijl er rijen in `bestanden` staan, dan doet de hele run niets en logt ze één waarschuwing met aantallen. Zo ontgrendelt stap 1 geen projecten omdat een niet-aangekoppeld volume de bestanden "ontbrekend" laat lijken.
   - **Lege mappen:** na het wissen van de bestanden verdwijnt ook een lege projectmap.
7. **Kopie na een conflict.** `bewaarAlsKopie` stuurt altijd de plan-id's van het lokale document mee, ook in het pad zonder lokale wijzigingen. Zo verdwijnt het kleine venster waarin een wijziging tijdens het dupliceren naar plannen van het origineel bleef verwijzen.
8. **Grootte van een JSON-body.**
   - `leesBody` weigert een verzoek zonder geldige `Content-Length` met `411 LENGTE_VEREIST`, en een body boven **10 MB** met `413` (mijn keuze voor de grens).
   - Het grootste echte document moet daar ruim onder blijven. De bouwer meet een groot testproject en noteert de grootte in het rapport.

### B. Technische schuld

9. **Gedeelde types en fouten:**
   - het type `Mij` staat één keer in `shared/`, en server en client gebruiken het allebei;
   - de lokale `fout()`-hulpen in `server/abonnementen/beheer.ts` en `server/organisaties/leden.ts` maken plaats voor `maakFout`;
   - de `APIError`'s van Better Auth die de gebruiker kan tegenkomen (organisaties, uitnodigingen, leden), krijgen een foutcode uit `FOUTCODES` met een vertaling, in plaats van de algemene fout.
10. **Adresvelden.**
    - De dode prop `verplicht` van `AdresVelden.vue` verdwijnt.
    - `instellingen.vue` gebruikt `AdresVelden` voor het adres van het bedrijf, met dezelfde validatie als nu.
11. **E2E-hygiëne:**
    - **Opruimhulp:** een hulp wist wat een spec aanmaakte echt uit `elentrik_e2e` en uit de e2e-opslagmap: projecten, snapshots, exports, bestanden, organisaties en gebruikers. Elke spec gebruikt hem in `afterAll`, ook als een test faalde.
    - **Tweede organisatie:** de tweede organisatie die een spec aanmaakt, blijft niet achter.
    - **Onafhankelijke specs:** de `talen`-specs hangen niet meer van elkaar af.
    - **Geen Pinia-internals:** `abonnement.spec.ts` leest geen `$pinia._s` meer, maar zet de toestand via de API of de database van e2e.
12. **Tests:**
    - de statische routetest negeert commentaar;
    - `VERTAALDE_PARAMETERS` wordt afgeleid of door een test bewaakt, in plaats van met de hand bijgehouden;
    - de taalscan verbiedt ook `MB` en elke hardgecodeerde Intl-locale, niet alleen `nl-BE`;
    - er komt een test voor `428` bij `POST /exports` zonder `If-Match`.
13. **Gotenberg.** `--api-timeout` gaat naar **55 s** (mijn keuze), zodat de app de foutmelding van Gotenberg krijgt vóór haar eigen time-out van 60 s afloopt.
14. **Kleine teksten.** `inloggen.nieuweLink` in fr en en volgt de woordenlijst ("lien de connexion", "sign-in link").
15. **Configuratie en CI:**
    - de controle op plaatshouders weigert alleen nog de exacte plaatshouders uit `.env.voorbeeld`, niet elk wachtwoord dat met `<` begint;
    - de GitHub Actions zijn vastgepind op een commit-SHA, met de versie in commentaar;
    - de root-`package.json` krijgt `packageManager` met dezelfde pnpm-versie als de Dockerfile en de workflow.

Alle nieuwe teksten komen in nl, fr en en (de pariteitstest), volgens `docs/vertalingen.md`.

**Niet-doelen**
- De toegankelijkheid (plan 13) en de snelheid (plan 14).
- Een pagina die het opslaggebruik toont, of een knop om de prullenbak te legen.
- Wijzigingen in `docs/online.md`: die alleen bij een feitelijke fout. Dat de noodstop ook het opruimen stillegt, maakt de bestaande zinnen niet fout.
- Een Docker-build op elke PR: dat zijn juist de runs die we net verminderd hebben.
- Een andere versie van Better Auth.

**Anti-doelen**
- Een bestaand, geldig project dat bij het automatisch bewaren geweigerd wordt.
- Een upload onder de limiet die als "opslag vol" geweigerd wordt.
- Een e2e-opruiming die iets in de echte database `elentrik` of in `apps/web/.data/bestanden` raakt.
- De opruimtaak die iets wist dat nog gebruikt wordt.
- Een `terug`-parameter die naar een ander domein leidt (open redirect).

## 3. Randvoorwaarden

- Alles uit de vorige plannen blijft gelden: `defineBeveiligdeHandler`, `nietGevondenFout`, `FOUTCODES`, drie talen, en tests nooit tegen de echte database.
- PR's naar `develop` worden gemerged met "Create a merge commit".
- De e2e-specs draaien alleen tegen `elentrik_e2e` en de e2e-opslagmap.

## 4. Wat aan de bouwer overblijft

- waar de opslagtelling leeft, en of er een index of een kolom bij moet (een query op `bestanden` met een join op `projecten` volstaat waarschijnlijk);
- welke `APIError`'s van Better Auth een eigen code krijgen; de bouwer somt ze op in het rapport;
- hoe `VERTAALDE_PARAMETERS` afgeleid of bewaakt wordt;
- de vorm van de meldingen, binnen Nuxt UI.

## 5. Kwaliteit en tests

Elk punt krijgt een test die eerst faalt. In het bijzonder:
- **Bewaren:**
  - een nieuwe plan-id van een ander project geeft 422 `PLANBESTAND_ONBEKEND`;
  - een normaal document en een project na "Bewaar als nieuw project" worden gewoon bewaard;
  - een id die al in het bewaarde document stond en naar een ander project of naar niets wijst, wordt ook gewoon bewaard.
- **Opslaglimiet:** net onder de limiet lukt, erover lukt niet; dit geldt voor upload, dupliceer en uit-document; projecten in de prullenbak tellen niet mee; een export lukt altijd.
- **Inloglinks:** een fout na de bevestigingslink geeft een 302; `terug=//evil.example` of `terug=https://…` valt weg.
- **Opruimtaak:** een ontbrekende opslagmap doet niets en ontgrendelt niets; een lege projectmap verdwijnt.
- **E2E:** na een volledige Playwright-run bevat `elentrik_e2e` geen projecten, organisaties of bestanden meer van de specs, behalve de vaste testgebruikers.
