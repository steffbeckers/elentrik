# Elentrik online zetten op de NAS

Stap voor stap: Elentrik draait in Docker op je Synology DS918+, is alleen bereikbaar via je bestaande
Cloudflare Tunnel op `https://elentrik.app`, en verstuurt mail via Microsoft 365 (Microsoft Graph).
Lokaal werken blijft zoals het was: zie `docs/lokaal-en-online.md`.

Elke naam, elk pad en elke poort hieronder komt uit de bestanden in de repo:
`deploy/nas/compose.yaml`, `deploy/nas/.env.voorbeeld`, `deploy/nas/backup.sh`,
`deploy/nas/rooktest.sh`, `apps/web/Dockerfile`, `apps/web/docker/` en `.github/workflows/web-image.yml`.
Namen van knoppen en menu's in Cloudflare, Microsoft, Synology, GitHub en Stripe veranderen af en toe;
waar ik niet zeker ben van de exacte naam, staat er "(de naam kan per versie licht verschillen)".

Alles tussen `<punthaken>` is een plaatshouder die jij invult. Zet echte waarden (wachtwoorden, sleutels,
tenant-ID, client-ID, e-mailadressen van klanten of de boekhouding) nooit in de repo, in een screenshot of
in een chatbericht.

## Hoe het in elkaar zit

```
bezoeker -> Cloudflare -> tunnel (cloudflared) -> elentrik-web:3000
                                                    |-> postgres   (database)
                                                    |-> gotenberg  (pdf's)
                                                    '-> bestanden  (map op de NAS)
```

- Vier containers in een compose-project: `web` (container `elentrik-web`), `postgres`, `gotenberg` en
  `backup`. Ze delen het Docker-netwerk `elentrik` (subnet `172.30.70.0/24`).
- **Er wordt geen enkele poort gepubliceerd.** De enige weg naar binnen is de tunnel.
- De gegevens staan in mappen op de NAS onder `ELENTRIK_DATA` (standaard `/volume1/docker/elentrik`):
  `postgres/`, `bestanden/` en `backups/`.
- Het image komt van GitHub: `ghcr.io/steffbeckers/elentrik-web`, met de tags `latest` en `sha-<korte commit>`.
  GitHub Actions bouwt het bij elke push naar `main`, nadat de tests en de typecheck slaagden.

### Voor je begint

- DSM 7.2 of nieuwer met **Container Manager** (het compose-project gebruikt `depends_on` met
  gezondheidscontroles; oudere Docker-pakketten kunnen dat niet).
- Een SSH-aanmelding op de NAS met `sudo`-rechten (DSM: Configuratiescherm, Terminal en SNMP, SSH aanzetten;
  de naam kan per versie licht verschillen). Alle `docker`-commando's hieronder draai je met `sudo`.
- De branch met deze handleiding is in `main` gemerged en de workflow `web-image` is groen geweest, zodat het
  image bestaat. Zie "Na de eerste build: het package publiek zetten" in sectie 3.
- Eigenaar van het domein `elentrik.app`, beheerder van de Microsoft 365-tenant, en beheerder van het
  Cloudflare-account.

Volgorde: 1 Cloudflare (domein), 2 Microsoft 365, 3 de NAS, daarna de tunnelroute (sectie 1, stap 4) en het
eerste account (sectie 4).

---

## 1. Cloudflare

### Stap 1. Het domein in Cloudflare

1. In het Cloudflare-dashboard: **Add a domain** (de naam kan per versie licht verschillen), vul
   `elentrik.app` in en kies het gratis plan.
2. Cloudflare toont twee nameservers. Zet die bij de registrar van `elentrik.app` en wacht tot Cloudflare het
   domein als **Active** toont.

### Stap 2. SSL op "Full"

Domein `elentrik.app`, **SSL/TLS** (Overview), encryptiemodus **Full**. Het verkeer tussen Cloudflare en de
NAS loopt door de tunnel en is niet afhankelijk van deze instelling, maar zo kun je later ook records
buiten de tunnel toevoegen zonder verrassingen. Zet daarna eventueel **Always Use HTTPS** aan
(SSL/TLS, Edge Certificates).

### Stap 3. De public hostname op de bestaande tunnel

1. Ga naar **Zero Trust** (de Cloudflare One-pagina), dan **Networks**, **Tunnels** (de naam kan per versie
   licht verschillen).
2. Kies je bestaande tunnel, dan **Edit** of **Configure**, tabblad **Public Hostname** (soms **Published
   application routes**).
3. Voeg een hostname toe:
   - Subdomain: leeg laten
   - Domain: `elentrik.app`
   - Path: leeg laten
   - Service type: **HTTP**
   - URL: `elentrik-web:3000` (dat is `http://elentrik-web:3000`; `elentrik-web` is de containernaam uit
     `compose.yaml`)
4. Opslaan. Cloudflare maakt zelf het DNS-record `elentrik.app` aan. Bestaat er al een record met die naam,
   dan weigert Cloudflare het: verwijder het oude record eerst.

Voeg **geen** tweede hostname (zoals `www.elentrik.app`) toe die naar dezelfde dienst wijst: Elentrik
accepteert wijzigende verzoeken alleen met de oorsprong `https://elentrik.app` (CSRF-controle). Wil je
`www` laten werken, maak dan in Cloudflare een omleiding (Redirect Rule) naar `https://elentrik.app`.

### Stap 4. `cloudflared` lid maken van het netwerk `elentrik`

Dit kan pas nadat het compose-project uit sectie 3 voor het eerst gestart is, want dan pas bestaat het
netwerk `elentrik`. Zoek eerst de naam van je tunnelcontainer:

```
sudo docker ps --format '{{.Names}}\t{{.Image}}' | grep -i cloudflared
```

Koppel hem dan aan het netwerk:

```
sudo docker network connect elentrik <naam-van-de-cloudflared-container>
```

Controleer: `sudo docker network inspect elentrik --format '{{range .Containers}}{{.Name}} {{end}}'` toont
onder meer `elentrik-web` en je tunnelcontainer.

**Belangrijk, en waarom:**

- **Koppel alleen `cloudflared` en de containers van Elentrik aan dit netwerk.** Elentrik gelooft de header
  `CF-Connecting-IP` als IP-adres van de bezoeker voor elk verzoek dat uit het subnet `172.30.70.0/24`
  komt (`ELENTRIK_VERTROUWD_PROXYNET`). Een andere container op dat netwerk kan die header zelf zetten,
  de limieten op inlogpogingen omzeilen en rechtstreeks bij Postgres en Gotenberg.
- **Het netwerk hoort bij het compose-project.** `docker compose down` en "Opnieuw bouwen" in Container
  Manager mislukken met "active endpoints" zolang `cloudflared` aan het netwerk hangt. Gebruik dus bij een
  update `pull` + `up -d` (sectie 7), of koppel `cloudflared` eerst los en daarna weer aan:
  `sudo docker network disconnect elentrik <naam-van-de-cloudflared-container>`.
- **De koppeling blijft bij een herstart van de container, maar niet als `cloudflared` opnieuw aangemaakt
  wordt** (nieuwe image, recreate). Dan geeft Cloudflare een 502 tot je het commando opnieuw uitvoert. Wil je
  dat blijvend, zet dan in het compose-bestand van `cloudflared` zelf:

  ```yaml
  services:
    cloudflared:
      networks: [elentrik]
  networks:
    elentrik:
      external: true
  ```

  (Dat netwerk moet dan bestaan voordat `cloudflared` start.)

---

## 2. Microsoft 365: domein, mailbox en Graph

Elentrik verstuurt mail (bevestiging, inloglink, wachtwoordherstel, uitnodigingen, facturen voor de
boekhouding) via de Microsoft Graph-API met een app-registratie en de mailbox `noreply@elentrik.app`.

### Stap 1. Het domein toevoegen

1. **Microsoft 365-beheercentrum** (admin.microsoft.com), **Instellingen**, **Domeinen**, **Domein
   toevoegen** (de naam kan per versie licht verschillen). Vul `elentrik.app` in.
2. Het beheercentrum toont een verificatierecord (TXT). Maak dat aan in Cloudflare (domein `elentrik.app`,
   **DNS**, **Records**), verifieer, en kies "Ik beheer de DNS zelf" als het om de rest van de records vraagt.

### Stap 2. De DNS-records in Cloudflare

Het beheercentrum toont de exacte records; **neem die waarden over, niet de voorbeelden hieronder**. Zet elk
CNAME-record van Microsoft op **DNS only** (grijze wolk), niet op Proxied.

| Doel | Type | Naam | Waarde (typisch) |
| --- | --- | --- | --- |
| Ontvangen van mail (alleen als je antwoorden of bounces wilt ontvangen) | MX | `@` | `elentrik-app.mail.protection.outlook.com`, prioriteit 0 |
| SPF | TXT | `@` | `v=spf1 include:spf.protection.outlook.com -all` |
| DKIM (twee records) | CNAME | `selector1._domainkey` en `selector2._domainkey` | de waarden uit het beheercentrum of Defender |
| DMARC | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<rapportadres>` |

- Heb je al een SPF-record op `@`? Voeg `include:spf.protection.outlook.com` toe aan dat ene record; een
  domein mag maar een SPF-record hebben.
- **DKIM aanzetten:** na het aanmaken van de CNAME's zet je DKIM voor `elentrik.app` aan in het
  Microsoft Defender-portaal (security.microsoft.com, **E-mail en samenwerking**, **Beleid en regels**,
  **Bedreigingsbeleid**, **Verificatie van e-mail**, tabblad DKIM; de naam kan per versie licht verschillen),
  of in Exchange Online PowerShell met `Set-DkimSigningConfig -Identity elentrik.app -Enabled $true`.
- **DMARC:** begin met `p=none` en kijk een tijd naar de rapporten. Pas daarna naar `p=quarantine`.
- Zonder MX-record komen antwoorden op mails van Elentrik nergens aan. Met het MX-record landen ze in de
  gedeelde mailbox hieronder: geef iemand toegang.

### Stap 3. De gedeelde mailbox `noreply@elentrik.app`

1. Beheercentrum, **Teams en groepen**, **Gedeelde mailboxen**, **Een gedeelde mailbox toevoegen** (de naam
   kan per versie licht verschillen).
2. Naam bijvoorbeeld "Elentrik noreply", e-mailadres `noreply` met het domein `elentrik.app`.

Een gedeelde mailbox heeft geen eigen licentie nodig. Dit adres wordt `MAIL_AFZENDER`.

### Stap 4. De app-registratie in Entra ID

1. **Microsoft Entra-beheercentrum** (entra.microsoft.com), **Entra ID**, **App-registraties**, **Nieuwe
   registratie**. Naam bijvoorbeeld "Elentrik mail", ondersteunde accounttypen: **alleen deze
   organisatiemap (één tenant)**, geen omleidings-URI. Registreren.
2. Op de overzichtspagina staan:
   - **Application (client) ID** (de client-ID): dit wordt `GRAPH_CLIENT_ID`;
   - **Directory (tenant) ID** (de tenant-ID): dit wordt `GRAPH_TENANT_ID`.
3. **Certificaten en geheimen**, **Nieuw clientgeheim**. Kies de langste geldigheid die het scherm toelaat
   (maximaal 24 maanden). **Kopieer meteen de kolom "Waarde"** (niet "Geheime ID"); later is hij niet meer te
   zien. Deze waarde wordt `GRAPH_CLIENT_GEHEIM`.
4. **Zet de vervaldatum van het geheim in je agenda**, met een herinnering minstens twee weken vooraf en
   de titel "Elentrik: Graph-geheim vernieuwen". Verloopt het geheim, dan stopt alle mail van Elentrik
   (de bevestigingsmail bij registreren, wachtwoordherstel, facturen voor de boekhouding). Vernieuwen = een
   nieuw geheim aanmaken, `GRAPH_CLIENT_GEHEIM` in `.env` vervangen en `docker compose up -d` draaien; het
   oude geheim kun je daarna verwijderen.
5. **API-machtigingen**, **Een machtiging toevoegen**, **Microsoft Graph**, **Toepassingsmachtigingen**
   (Application permissions, dus niet "Gedelegeerd"), zoek `Mail.Send` en voeg toe.
6. Klik **Beheerderstoestemming verlenen voor <jouw tenant>** (Grant admin consent) en bevestig. De status
   moet "Verleend" tonen.

### Stap 5. Beperken tot die ene mailbox

Op dit punt mag de app, met `Mail.Send` als toepassingsmachtiging, **in naam van elke mailbox in de tenant**
mailen. Beperk dat tot `noreply@elentrik.app`. Microsoft beschrijft hiervoor twee wegen; kies de eerste.

**Weg A: RBAC for Applications in Exchange Online (de nieuwere weg).** Controleer de exacte cmdlets en
parameters altijd tegen Microsoft Learn ("Role Based Access Control for Applications in Exchange Online"),
want ze zijn recent en kunnen veranderen. Het idee, in Exchange Online PowerShell
(`Install-Module ExchangeOnlineManagement`, dan `Connect-ExchangeOnline`):

```powershell
# 1. De app als service principal bekendmaken aan Exchange. De object-ID haal je uit
#    Entra ID, Bedrijfstoepassingen, "Elentrik mail" (niet de object-ID van de app-registratie).
New-ServicePrincipal -AppId <client-id> -ObjectId <object-id-van-de-bedrijfstoepassing> -DisplayName "Elentrik mail"

# 2. Een bereik dat alleen deze mailbox omvat.
New-ManagementScope -Name "Elentrik-noreply" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'noreply@elentrik.app'"

# 3. De rol "Application Mail.Send" aan de app geven, beperkt tot dat bereik.
New-ManagementRoleAssignment -App <client-id-of-service-principal-id> -Role "Application Mail.Send" -CustomResourceScope "Elentrik-noreply"

# 4. Controleren (de cmdlet-naam hoort bij RBAC for Applications; controleer hem in de Microsoft-documentatie).
Test-ServicePrincipalAuthorization -Identity <client-id> -Resource noreply@elentrik.app
```

Lees in de Microsoft-documentatie na hoe een breed verleende Entra-toestemming (stap 4.6) zich verhoudt tot
de Exchange-roltoewijzing. Een `Mail.Send` die tenantbreed verleend blijft, kan de beperking tenietdoen. Dan
trek je die Entra-toestemming in (API-machtigingen, de machtiging verwijderen) en laat je alleen de
Exchange-roltoewijzing werken. Of dat nodig is, bepaalt de test hieronder.

**Weg B: de oudere application access policy** (werkt mét de Entra-toestemming; Microsoft raadt nieuwe
opzetten af). Maak een e-mailingeschakelde beveiligingsgroep met alleen `noreply@elentrik.app`, en dan:

```powershell
New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId <groep-e-mailadres> -AccessRight RestrictAccess -Description "Elentrik mag alleen als noreply mailen"
Test-ApplicationAccessPolicy -AppId <client-id> -Identity noreply@elentrik.app
```

Een wijziging kan tot ongeveer een uur duren voor ze werkt.

**Test de beperking altijd**, na de eerste start van de app (sectie 3, 4): een mail vanaf `noreply@elentrik.app`
moet lukken (registreren op `https://elentrik.app` en de bevestigingsmail ontvangen). Een verzoek namens een
andere mailbox moet falen met een 403 `ErrorAccessDenied`; probeer dat met een tijdelijke, losse proef
(bijvoorbeeld Graph Explorer, of een tweede token-aanvraag met een ander afzenderadres) en verwijder die
proef daarna.

### Waar vind ik de vier waarden?

| Variabele | Waar | Voorbeeldvorm |
| --- | --- | --- |
| `GRAPH_TENANT_ID` | Entra, de app-registratie, Overzicht, "Directory (tenant) ID" | GUID |
| `GRAPH_CLIENT_ID` | Entra, de app-registratie, Overzicht, "Application (client) ID" | GUID |
| `GRAPH_CLIENT_GEHEIM` | Entra, Certificaten en geheimen, de kolom "Waarde" (alleen bij het aanmaken zichtbaar) | lange tekst |
| `MAIL_AFZENDER` | de gedeelde mailbox | `noreply@elentrik.app` |

---

## 3. De NAS

### Stap 1. Mappen aanmaken, met de juiste rechten

Zoek eerst de gebruiker waaronder de app draait. Dat mag je eigen gebruiker zijn of een aparte; de app en de
back-up draaien niet als root.

```
id <gebruiker>
```

Noteer `uid=` (dit wordt `ELENTRIK_UID`) en `gid=` (dit wordt `ELENTRIK_GID`). Maak dan de mappen:

```
sudo mkdir -p /volume1/docker/elentrik/postgres /volume1/docker/elentrik/bestanden /volume1/docker/elentrik/backups
sudo mkdir -p /volume1/docker/elentrik-compose
sudo chown -R <uid>:<gid> /volume1/docker/elentrik/bestanden /volume1/docker/elentrik/backups
```

- `postgres/` laat je met rust: de databasecontainer zet er zelf de rechten op.
- `bestanden/` en `backups/` moeten voor `<uid>:<gid>` beschrijfbaar zijn. Lukt schrijven daarna toch niet
  (de export of de back-up geeft een rechtenfout), controleer dan in DSM de machtigingen van de gedeelde
  map `docker` (Configuratiescherm, Gedeelde map; de naam kan per versie licht verschillen): Synology-ACL's
  kunnen de gewone Linux-rechten overrulen.
- Heet je gedeelde map niet `docker` of staat hij op een ander volume, pas dan de paden aan en zet het
  basispad in `ELENTRIK_DATA`.

### Stap 2. `compose.yaml`, `backup.sh` en `.env` neerzetten

Zet de drie bestanden samen in `/volume1/docker/elentrik-compose/`:

- `deploy/nas/compose.yaml` uit de repo;
- `deploy/nas/backup.sh` uit de repo, **in dezelfde map als `compose.yaml`** (compose koppelt het als
  `./backup.sh`; ontbreekt het bestand, dan maakt Docker er een lege map van en start de back-up niet);
- `.env`, gemaakt van `deploy/nas/.env.voorbeeld`.

Kopieer ze bijvoorbeeld vanaf je ontwikkelmachine met `scp` (de NAS-gebruiker moet SSH mogen), of upload ze met
File Station:

```
scp deploy/nas/compose.yaml deploy/nas/backup.sh deploy/nas/.env.voorbeeld <gebruiker>@<nas>:/volume1/docker/elentrik-compose/
```

Faalt `scp` met "subsystem request failed" (nieuwere `scp`-versies gebruiken SFTP, dat op de NAS uit kan
staan), voeg dan `-O` toe of gebruik File Station. Op de NAS:

```
cd /volume1/docker/elentrik-compose
sudo cp .env.voorbeeld .env
sudo chmod 600 .env
sudo chmod 755 backup.sh
```

Eisen voor `backup.sh`:

- **LF-regeleinden**, geen CRLF. De repo dwingt dat af (`*.sh text eol=lf`), maar bewerk het bestand niet in
  Kladblok. Controle: `file backup.sh` mag niet "CRLF" noemen.
- **Leesbaar (en liefst uitvoerbaar) voor `ELENTRIK_UID`**, dus `chmod 755` zoals hierboven.

### Stap 3. `.env` invullen

Open `.env` (`sudo vi .env`, of bewerk het op je eigen machine en kopieer het opnieuw; let op LF-regeleinden) en vul de waarden in. De hele
lijst met uitleg staat in sectie 10. Voor de eerste start heb je nodig:

```
ELENTRIK_DATA=/volume1/docker/elentrik
ELENTRIK_UID=<uid>
ELENTRIK_GID=<gid>
POSTGRES_WACHTWOORD=<lange-willekeurige-waarde>
BETTER_AUTH_SECRET=<lange-willekeurige-waarde>
BETTER_AUTH_URL=https://elentrik.app
NUXT_AUTH_BASIS_URL=http://127.0.0.1:3000
MAIL_VERZENDER=graph
GRAPH_TENANT_ID=<tenant-id>
GRAPH_CLIENT_ID=<client-id>
GRAPH_CLIENT_GEHEIM=<client-geheim>
MAIL_AFZENDER=noreply@elentrik.app
```

Genereer de twee geheimen elk met een eigen, nieuwe waarde (nooit hergebruikt van elders):

```
openssl rand -hex 32
```

Regels die ertoe doen:

- **`BETTER_AUTH_SECRET`:** minstens 32 tekens, nieuw, alleen hier. Een andere waarde later logt iedereen uit.
- **`POSTGRES_WACHTWOORD`:** kies een lang wachtwoord **zonder aanhalingstekens, spaties of `$`**. Andere
  tekens mogen (het gaat via `PGPASSWORD`, niet via een URL), maar `docker compose` en Container Manager
  gaan verschillend om met aanhalingstekens in `.env`, en een `$` leest compose als variabele. De uitvoer van
  `openssl rand -hex 32` voldoet altijd.
- Het wachtwoord wordt vastgelegd **bij de eerste start van de database**. Later wijzigen in `.env` verandert
  het wachtwoord in de database niet; dat doe je dan met
  `sudo docker compose exec postgres psql -U elentrik -d elentrik -c "alter user elentrik password '<nieuw>'"`
  (en dan pas `.env`).
- **`BETTER_AUTH_URL`** zonder slash op het einde, `NUXT_AUTH_BASIS_URL` altijd `http://127.0.0.1:3000`.
- Laat `ELENTRIK_GEPLANDE_TAKEN` weg. Met `uit` doet de uurlijkse inhaaltaak voor gemiste Stripe-meldingen
  niets; dat is een noodstop, geen productie-instelling.
- Staan er `SMTP_*`-regels in je `.env`? Die zijn alleen nodig bij `MAIL_VERZENDER=smtp` en mogen anders
  commentaar blijven.
- Bewaar een kopie van `.env` in je wachtwoordbeheerder. Zonder `.env` heb je het databasewachtwoord en de
  Graph-gegevens niet meer.

### Stap 4. Na de eerste build: het package publiek zetten

Het project haalt het image zonder aanmelding op uit GHCR, dus het package moet publiek zijn. Het image
bevat geen geheimen (alle configuratie komt bij het opstarten uit `.env`).

1. Controleer op GitHub, tabblad **Actions**, dat de run van de workflow `web-image` groen is (eerst de job
   `test`, dan `image`). Alleen een push naar `main` bouwt en pusht het image.
2. Ga naar je GitHub-profiel, **Packages**, `elentrik-web`, **Package settings** (rechts), onderaan
   **Danger Zone**, **Change visibility**, **Public** (de naam kan per versie licht verschillen).
3. Controleer vanaf een ander apparaat of de NAS: `docker pull ghcr.io/steffbeckers/elentrik-web:latest` werkt
   zonder `docker login`.

### Stap 5. Het project starten

**Manier A: Container Manager.**

1. Open **Container Manager**, **Project**, **Aanmaken**.
2. Projectnaam `elentrik`. Pad: `/volume1/docker/elentrik-compose`. Bron: bestaand compose-bestand gebruiken.
   (Vindt Container Manager `compose.yaml` niet, kies dan om de inhoud zelf in te voeren en plak de inhoud van
   het bestand, of gebruik manier B.)
3. Sla de vraag over een webportaal over; er zijn bewust geen poorten.
4. Bouwen en starten. Container Manager leest `.env` uit de projectmap.

**Manier B: SSH.**

```
cd /volume1/docker/elentrik-compose
sudo docker compose up -d
```

Kies **een** manier en blijf erbij: een project dat je via SSH start, verschijnt niet in het tabblad
Project van Container Manager.

Bij de eerste start haalt Docker de images binnen en maakt Postgres de database aan. De app migreert de
database zelf voor hij verzoeken aanneemt.

### Stap 6. De eerste opstart controleren

```
cd /volume1/docker/elentrik-compose
sudo docker compose ps
sudo docker compose logs --tail 50 web
```

- Alle vier de diensten staan op `running`, en `postgres`, `gotenberg` en `web` op `healthy` (die laatste kan
  tot een minuut duren).
- In de log van `web` staat "Migraties uitgevoerd."
- Geen enkele poort is gepubliceerd: de kolom Ports in `docker compose ps` is leeg of toont alleen `3000/tcp`.

Test de gezondheidsroute van binnenuit (er is nog geen tunnel nodig):

```
sudo docker exec elentrik-web node -e "fetch('http://127.0.0.1:3000/api/gezondheid').then(r=>r.text().then(t=>console.log(r.status,t)))"
```

Verwacht: `200 {"ok":true}`.

Voer nu **sectie 1, stap 4** uit (`docker network connect elentrik <cloudflared>`), als je dat nog niet deed, en
controleer van buiten:

```
curl -s https://elentrik.app/api/gezondheid
```

Verwacht: `{"ok":true}`. Een 502 van Cloudflare betekent meestal dat `cloudflared` niet aan het netwerk
`elentrik` hangt, of dat de public hostname een verkeerde URL heeft.

Het is geen goed teken als `web` blijft herstarten: de app weigert in productie te starten bij een
onvolledige configuratie. De log van `web` noemt dan de **naam** van de variabele (nooit de waarde); zie
sectie 8.

---

## 4. Het eerste account

1. Open `https://elentrik.app/registreren` en registreer met je eigen naam, e-mailadres en bedrijfsnaam.
2. Je krijgt een bevestigingsmail van `noreply@elentrik.app` (via Graph). Klik op de link. Komt de mail niet,
   ga dan naar sectie 8, "Geen mails".
3. Zet nu je **eigen bedrijf op `vrijgesteld`**, zodat het altijd schrijfrecht heeft zonder abonnement. Doe dit
   zeker **voor je Stripe aanzet** (sectie 5): zodra abonnementen aan staan, is elk bedrijf zonder lopende
   proefperiode of abonnement alleen-lezen.

   ```
   cd /volume1/docker/elentrik-compose
   sudo docker compose exec postgres psql -U elentrik -d elentrik -c "select id, name, proef_einde, vrijgesteld from organization;"
   sudo docker compose exec postgres psql -U elentrik -d elentrik -c "update organization set vrijgesteld = true where id = '<organisatie-id>';"
   ```

   `vrijgesteld` is alleen met SQL te zetten. Meer over de proefperiode en vrijstelling staat in
   `docs/lokaal-en-online.md`, onder "Een proefperiode of vrijstelling met SQL zetten".
4. Staat dit de eerste keer op een lege database, dan is de "overname" van bestaande gegevens uit
   `docs/lokaal-en-online.md` ("De eerste echte registratie") niet van toepassing: er zijn geen projecten
   zonder organisatie. Wil je gegevens van je ontwikkelmachine meenemen, doe dat dan eerst (sectie 9).

---

## 5. Stripe

Begin altijd in **testmodus**. De volledige dashboard-checklist (Stripe Tax, prijzen, factuurnummering,
klantmails, mislukte betalingen, klantenportaal) staat in `docs/lokaal-en-online.md`, onder "Het
Stripe-dashboard (eenmalig, met de hand)". Doe die in testmodus, en later nog eens in live-modus.

### In testmodus

1. In het Stripe-dashboard, testmodus: twee terugkerende prijzen (maand en jaar, in EUR en **exclusief** btw).
   Hun id's (`price_...`) komen in `STRIPE_PRIJS_MAAND` en `STRIPE_PRIJS_JAAR`.
2. **Webhook-eindpunt** aanmaken (Ontwikkelaars, Webhooks, **Eindpunt toevoegen**; de naam kan per versie licht
   verschillen) op:

   ```
   https://elentrik.app/api/stripe/webhook
   ```

   Met deze zeven events:
   - `checkout.session.completed` en `checkout.session.async_payment_failed`;
   - `customer.subscription.created`, `customer.subscription.updated` en `customer.subscription.deleted`;
   - `invoice.paid` en `invoice.payment_failed`.

   **Kies voor het eindpunt de API-versie `2026-09-30.endive`**, dezelfde als de Stripe-library in Elentrik.
   Bij een andere versie hebben facturen andere velden en herkent Elentrik de factuur niet meer. Stel de
   versie in bij het aanmaken van het eindpunt.
3. Het **ondertekeningsgeheim** van dat eindpunt (`whsec_...`) wordt `STRIPE_WEBHOOK_GEHEIM`. De geheime
   sleutel van de testmodus (`sk_test_...`) wordt `STRIPE_GEHEIME_SLEUTEL`.
4. Zet de vier `STRIPE_*`-variabelen en eventueel `BOEKHOUDING_INBOX` in `.env` en pas toe:

   ```
   cd /volume1/docker/elentrik-compose
   sudo docker compose up -d
   ```

   Dat maakt alleen `web` opnieuw aan. Zet je een sleutel zonder de drie andere, dan weigert de app te starten
   en noemt de log de ontbrekende naam.
5. Doe de handmatige test uit `docs/lokaal-en-online.md` ("Handmatige test (Stripe-testmodus)") tegen
   `https://elentrik.app`, met de testkaart `4242 4242 4242 4242`. Kijk in het dashboard bij het eindpunt of de
   events met `200` beantwoord worden.

### Later naar live

1. Zet je abonnementen en prijzen in **live-modus** op dezelfde manier op (zelfde checklist).
2. Maak in live-modus een **nieuw** webhook-eindpunt op dezelfde URL, met dezelfde events en dezelfde API-versie
   `2026-09-30.endive`. Het live-geheim verschilt van het testgeheim.
3. Vervang in `.env` de vier waarden (`sk_live_...`, het nieuwe `whsec_...`, de twee live-`price_...`) en draai
   `sudo docker compose up -d`.
4. Elk uur controleert een inhaaltaak de abonnementen en betaalde facturen van de laatste 7 dagen, voor het
   geval een webhook gemist werd. Dat staat standaard aan; leg het alleen stil met `ELENTRIK_GEPLANDE_TAKEN=uit`
   in een noodgeval.

---

## 6. Back-ups: Hyper Backup en Cloud Sync

### Wat er gebeurt

- De dienst `backup` maakt elke nacht om 03:00 (Europe/Brussels, zomertijd inbegrepen) een `pg_dump -Fc` in
  `${ELENTRIK_DATA}/backups`, met een naam als `elentrik-20271031-0300.dump`.
- Dumps ouder dan 30 dagen worden verwijderd.
- Een dump meteen maken, bijvoorbeeld voor een update:

  ```
  cd /volume1/docker/elentrik-compose
  sudo docker compose run --rm --no-deps backup --nu
  ls -l /volume1/docker/elentrik/backups
  ```

- Controleer de eerste dagen of er elke ochtend een nieuwe dump staat, en kijk in
  `sudo docker compose logs --tail 20 backup` voor "dump gemaakt".

### Wat je naar de externe SSD en OneDrive stuurt

| Map | In Hyper Backup / Cloud Sync? | Waarom |
| --- | --- | --- |
| `backups/` | **Ja** | de nachtelijke dumps: de echte back-up van de database |
| `bestanden/` | **Ja** | de geüploade plannen, logo's en exports |
| `postgres/` | **Nee** | een kopie van een draaiende databasemap is niet consistent; alleen de dump is dat |

- **Hyper Backup** (Hyper Backup-pakket, **Gegevensback-uptaak**; de naam kan per versie licht verschillen)
  naar de externe SSD. Zet **client-side encryptie** aan en bewaar het wachtwoord én het sleutelbestand
  (`.key`) buiten de NAS, bijvoorbeeld in je wachtwoordbeheerder. Zonder die twee is de back-up niet te lezen.
  Hyper Backup kiest, afhankelijk van de versie, mogelijk hele gedeelde mappen en geen submappen. Kun je
  `postgres/` niet uitsluiten, dan is dat geen ramp (het kost alleen ruimte): **herstel er nooit uit**. De dump
  is de back-up.
- **Cloud Sync** naar OneDrive: kies de richting **alleen uploaden** (een gewone synchronisatie is geen
  back-up: een verwijderd bestand verdwijnt dan ook uit OneDrive). Zet **gegevensversleuteling** aan (de naam
  kan per versie licht verschillen) en bewaar het wachtwoord buiten de NAS. Synchroniseer alleen `backups/` en
  `bestanden/`.
- Bewaar een kopie van `.env` apart (wachtwoordbeheerder). Hyper Backup neemt de map
  `/volume1/docker/elentrik-compose` alleen mee als jij dat kiest, en `.env` bevat geheimen: alleen mét
  versleuteling.

### De hersteltest (doe dit nu, en daarna regelmatig)

Een back-up is pas een back-up als je hem hebt teruggezet. Zet een dump terug in een **tijdelijke** database,
zonder de echte aan te raken:

```
cd /volume1/docker/elentrik-compose

# 1. Een lege tijdelijke database.
sudo docker compose exec postgres createdb -U elentrik elentrik_hersteltest

# 2. De nieuwste dump erin zetten (pas de bestandsnaam aan; ls -l /volume1/docker/elentrik/backups).
sudo docker compose run --rm --no-deps --entrypoint sh backup -c \
  "pg_restore -h postgres -U elentrik -d elentrik_hersteltest /backups/elentrik-<datum>-<uur>.dump"

# 3. Kijk of de gegevens erin staan.
sudo docker compose exec postgres psql -U elentrik -d elentrik_hersteltest -c "select count(*) from organization;"
sudo docker compose exec postgres psql -U elentrik -d elentrik_hersteltest -c "select count(*) from projecten;"

# 4. Opruimen.
sudo docker compose exec postgres dropdb -U elentrik elentrik_hersteltest
```

Doe hetzelfde met een dump die uit Hyper Backup of OneDrive komt, minstens een keer, om te bewijzen dat
ook de versleutelde kopie bruikbaar is. Zet in je agenda: elk kwartaal opnieuw.

### Echt terugzetten (de database is kapot of weg)

```
cd /volume1/docker/elentrik-compose
sudo docker compose stop web
sudo docker compose exec postgres dropdb -U elentrik elentrik
sudo docker compose exec postgres createdb -U elentrik elentrik
sudo docker compose run --rm --no-deps --entrypoint sh backup -c \
  "pg_restore -h postgres -U elentrik -d elentrik /backups/elentrik-<datum>-<uur>.dump"
sudo docker compose up -d
```

De bestanden in `bestanden/` zijn los van de database: haal ze uit Hyper Backup als ze ontbreken.

---

## 7. Updaten

Een nieuwe versie komt tot stand als er iets in `main` gemerged is en de workflow `web-image` het image gebouwd
heeft (Actions, groen). **Er is geen automatische update**: jij beslist wanneer.

### Aanbevolen: `pull` + `up -d` (zonder `down`)

```
cd /volume1/docker/elentrik-compose

# 1. Noteer hoeveel migraties er zijn (voor een eventuele terugrol).
sudo docker compose exec postgres psql -U elentrik -d elentrik -tA -c "select count(*) from drizzle.__drizzle_migrations;"

# 2. Een verse dump, vlak voor de update.
sudo docker compose run --rm --no-deps backup --nu

# 3. Het nieuwe image ophalen en alleen wat veranderd is opnieuw aanmaken.
sudo docker compose pull
sudo docker compose up -d

# 4. Controleren.
sudo docker compose ps
sudo docker compose logs --tail 30 web
curl -s https://elentrik.app/api/gezondheid
```

Zo blijft het netwerk `elentrik` bestaan en hangt `cloudflared` er nog aan. Gebruik **geen** `docker compose
down`: dat probeert het netwerk te verwijderen en faalt zolang `cloudflared` eraan hangt ("active endpoints").

Een vaste versie kiezen? Zet in `.env` `ELENTRIK_IMAGE=ghcr.io/steffbeckers/elentrik-web:sha-<korte-commit>` en
draai `sudo docker compose pull` en `up -d`. Zonder die regel is het `latest`.

### Via Container Manager

Container Manager heeft geen eenvoudige "pull"-knop voor een project. De werkwijze (de namen kunnen per versie
licht verschillen):

1. Maak eerst de verse dump: `sudo docker compose run --rm --no-deps backup --nu` (SSH).
2. **Image**, **Toevoegen**, **Via URL**: `ghcr.io/steffbeckers/elentrik-web:latest`. Zo haal je de nieuwste
   versie op.
3. **Koppel `cloudflared` los van het netwerk**, anders mislukt de herbouw met "active endpoints":
   `sudo docker network disconnect elentrik <naam-van-de-cloudflared-container>`.
4. **Project**, kies `elentrik`, **Actie**, **Bouwen** (opnieuw maken).
5. Koppel `cloudflared` weer aan: `sudo docker network connect elentrik <naam-van-de-cloudflared-container>`.
6. Controleer zoals hierboven.

Vanaf de commandoregel is `pull` + `up -d` korter en veiliger.

### Terugrollen naar de vorige versie

De migraties gaan alleen vooruit. Kijk daarom eerst of de nieuwe versie een migratie had: vergelijk de teller
uit stap 1 met

```
sudo docker compose exec postgres psql -U elentrik -d elentrik -tA -c "select count(*) from drizzle.__drizzle_migrations;"
```

- **Zelfde aantal (geen migratie):** zet in `.env` `ELENTRIK_IMAGE` op de vorige tag
  (`ghcr.io/steffbeckers/elentrik-web:sha-<vorige>`) en draai `sudo docker compose up -d`.
- **Meer migraties:** de oude versie kent de nieuwe databasestructuur niet. Zet de dump van vlak vóór de update
  terug (sectie 6, "Echt terugzetten") en zet `ELENTRIK_IMAGE` op de vorige tag. Wat er sinds die dump
  veranderd is, ben je kwijt.
- **De update zelf faalt** (een migratie mislukt): de container stopt met exitcode 1, de database blijft zoals
  ze was (de migraties lopen in een transactie) en de app start niet. Zet de vorige tag terug; de dump is
  dan niet nodig.

Houd per release de tag van de vorige versie bij (de lijst met tags staat op de GitHub-pagina van het package).

---

## 8. Problemen oplossen

### De logs bekijken

```
cd /volume1/docker/elentrik-compose
sudo docker compose logs --tail 100 web
sudo docker compose logs --tail 100 postgres
sudo docker compose logs --tail 100 gotenberg
sudo docker compose logs --tail 100 backup
```

In Container Manager: **Container**, kies `elentrik-web`, **Details**, **Logboek**. Geheimen komen nooit in de
logs, ook niet het databasewachtwoord; meldingen noemen alleen de naam van een variabele.

### De app start niet, of blijft herstarten

De app controleert zijn configuratie in productie bij het starten en weigert te starten als iets ontbreekt.
De log van `web` bevat dan een regel zoals:

```
Ongeldige configuratie; controleer: BETTER_AUTH_SECRET, GRAPH_CLIENT_GEHEIM (zie apps/web/.env.example)
```

Zet de genoemde variabelen goed in `.env` (let op: `docker compose` leest `.env` alleen als je het commando in
de projectmap draait) en draai `sudo docker compose up -d`. Wat de controle afdwingt:

- altijd: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ELENTRIK_BESTANDEN_DIR` en
  `ELENTRIK_GOTENBERG_URL` (compose zet de meeste zelf; `BETTER_AUTH_SECRET` en `BETTER_AUTH_URL` komen uit `.env`);
- `MAIL_VERZENDER=graph`: dan ook `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_GEHEIM` en `MAIL_AFZENDER`;
  een andere waarde dan `smtp` of `graph` wordt ook gemeld;
- is `STRIPE_GEHEIME_SLEUTEL` gezet: dan ook `STRIPE_WEBHOOK_GEHEIM`, `STRIPE_PRIJS_MAAND` en `STRIPE_PRIJS_JAAR`;
- `ELENTRIK_VERTROUWD_PROXYNET` moet, als hij gezet is, een geldig subnet zijn (compose zet het op `172.30.70.0/24`).

Andere oorzaken:

- **"Opstarten afgebroken: de migraties zijn mislukt."** De regel erboven noemt de oorzaak (bijvoorbeeld een
  verkeerd databasewachtwoord, `28P01`). Controleer `POSTGRES_WACHTWOORD`; bedenk dat het alleen bij de
  allereerste start van de database wordt vastgelegd (sectie 3, stap 3).
- **`web` blijft op `starting` of `unhealthy`:** de app wacht op de database en Gotenberg. Kijk met
  `docker compose ps` of die twee `healthy` zijn.
- **Map `bestanden` niet beschrijfbaar:** exporteren geeft een fout. Zie sectie 3, stap 1 (`chown`, ACL's).
- **De back-up start niet:** bestaat `backup.sh` naast `compose.yaml` (en is het een bestand, geen map)?

### Geen mails (Graph)

De bevestigingsmail bij registreren komt niet aan, of er verschijnt een fout. Kijk in de log van `web` naar een
regel als "Graph-token aanvragen mislukt: status 401, code invalid_client" of "Graph-mail versturen mislukt:
status 403, code ErrorAccessDenied". Meestal:

- **Token aanvragen mislukt (400 of 401):** `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` of `GRAPH_CLIENT_GEHEIM` klopt
  niet, of **het geheim is verlopen**. Maak in Entra een nieuw geheim aan (sectie 2, stap 4) en vervang het
  in `.env`. Let op dat je de kolom "Waarde" kopieerde en niet "Geheime ID".
- **Versturen mislukt met 403 `ErrorAccessDenied`:** de beheerderstoestemming ontbreekt (sectie 2, stap 4.6) of de
  beperking tot de mailbox (sectie 2, stap 5) sluit `MAIL_AFZENDER` uit. Een wijziging kan tot ongeveer een uur
  duren.
- **Versturen mislukt met 404 of een fout over de mailbox:** `MAIL_AFZENDER` bestaat niet, of is geen
  adres van de mailbox in de tenant.
- **De mail komt aan maar in de ongewenste mail:** controleer SPF, DKIM en DMARC (sectie 2, stap 2) met een
  mailtester of met de kopteksten van de ontvangen mail.
- **Mail gaat nog via SMTP:** staat `MAIL_VERZENDER=graph` echt in `.env`, en heb je na het wijzigen
  `sudo docker compose up -d` gedraaid?

### Stripe-meldingen komen niet aan

- Stripe-dashboard, Ontwikkelaars, Webhooks, het eindpunt, **Gebeurtenissen**: welke statuscode krijgt Stripe?
  - `400` of `401`: `STRIPE_WEBHOOK_GEHEIM` komt niet overeen met het geheim van dit eindpunt (test en live
    hebben verschillende geheimen).
  - `5xx`: kijk in de log van `web`; Stripe probeert het zelf opnieuw.
  - Geen poging of een time-out: klopt de URL `https://elentrik.app/api/stripe/webhook`? Cloudflare-regels
    (WAF, Bot Fight Mode, firewallregels) kunnen verkeer van Stripe blokkeren; kijk bij **Security**, **Events**.
- Een factuur wordt niet herkend: heeft het eindpunt API-versie `2026-09-30.endive`? (Sectie 5.)
- Gemiste meldingen worden elk uur ingehaald (abonnementen die langer dan een dag geen nieuws hadden, en betaalde
  facturen van de laatste 7 dagen). Staat `ELENTRIK_GEPLANDE_TAKEN=uit` in `.env`, haal die regel dan weg.

### Andere

- **Cloudflare geeft 502 of 1033:** hangt `cloudflared` aan het netwerk `elentrik`
  (`sudo docker network inspect elentrik`)? Klopt de public hostname (`elentrik-web:3000`)? Draait de tunnel
  zelf?
- **Alle bezoekers delen een limiet voor inlogpogingen** (iedereen krijgt "te veel pogingen" tegelijk): de
  verzoeken komen niet uit het vertrouwde subnet, of `cloudflared` zit niet op dit netwerk. Controleer
  `ELENTRIK_VERTROUWD_PROXYNET` in `docker compose config`.
- **`/api/gezondheid` geeft `503`:** de database antwoordt niet. Kijk in de log van `postgres`.

---

## 9. Gegevens meenemen van je ontwikkelmachine (optioneel)

De NAS start leeg. Wil je je lokale testprojecten, je account en je bedrijfsgegevens meenemen, doe dat dan
**voor je je eigen account registreert** (sectie 4) en voor er klanten zijn. Een tweede keer kan alleen door
de nieuwe database te vervangen, en alles wat sindsdien in Elentrik is gedaan, gaat dan verloren.

Raak onderweg de lokale database `elentrik` en de map `apps/web/.data/bestanden` niet aan: je kopieert ze
alleen.

### De database

Op de ontwikkelmachine, met de lokale infra uit `infra/docker-compose.yml` aan (Docker Desktop):

```
docker exec elentrik-postgres-1 pg_dump -U elentrik -Fc -f /tmp/elentrik-dev.dump elentrik
docker cp elentrik-postgres-1:/tmp/elentrik-dev.dump ./elentrik-dev.dump
docker exec elentrik-postgres-1 rm /tmp/elentrik-dev.dump
```

(Via een bestand in de container, niet met `>`: een omleiding in PowerShell beschadigt een binair bestand.)
Is de containernaam anders, kijk dan met `docker ps`.

Zet `elentrik-dev.dump` op de NAS, in `/volume1/docker/elentrik/backups/` (met `scp` of File Station), en geef
het de eigenaar van de app (`sudo chown <uid>:<gid> ...`). Gebruik een naam die **niet** met `elentrik-` begint,
zoals `dev-import.dump`: de opruiming van de back-up verwijdert dumps die met `elentrik-` beginnen na 30 dagen.

Zet het dan terug in de lege database van de NAS, na de eerste start van het project:

```
cd /volume1/docker/elentrik-compose
sudo docker compose stop web
sudo docker compose exec postgres dropdb -U elentrik elentrik
sudo docker compose exec postgres createdb -U elentrik elentrik
sudo docker compose run --rm --no-deps --entrypoint sh backup -c \
  "pg_restore -h postgres -U elentrik -d elentrik /backups/dev-import.dump"
sudo docker compose up -d
```

- Bij `up -d` draait de app de migraties die in de dump nog ontbreken. Heeft je ontwikkelmachine een **nieuwere**
  versie van de migraties dan het image op de NAS, dan moet je eerst een nieuw image laten bouwen.
- De dump bevat je gebruikers en organisaties. Door het nieuwe `BETTER_AUTH_SECRET` en het nieuwe adres moet je
  opnieuw inloggen. Registreer je account dus **niet** opnieuw: log in met het bestaande account. Staat er een
  bedrijf in dat zonder organisatie hing, dan geldt de "overname bij de eerste bevestigde aanmelding" uit
  `docs/lokaal-en-online.md`.
- Verwijder het bestand daarna van de NAS: `sudo rm /volume1/docker/elentrik/backups/dev-import.dump`.

### De bestanden

De uploads, logo's en exports staan lokaal in `apps/web/.data/bestanden` en horen op de NAS in
`/volume1/docker/elentrik/bestanden`. Kopieer ze inclusief de submapstructuur:

```
scp -r apps/web/.data/bestanden/. <gebruiker>@<nas>:/volume1/docker/elentrik/bestanden/
```

(of met File Station). Zorg dat de eigenaar `<uid>:<gid>` is:
`sudo chown -R <uid>:<gid> /volume1/docker/elentrik/bestanden`. De database verwijst naar die bestanden met
hun pad; kopieer dus de hele map in een keer en laat de namen ongewijzigd.

---

## 10. Checklist van alle variabelen

Alle variabelen staan in `deploy/nas/.env.voorbeeld`. De rij "Waar" zegt waar je de waarde vindt.
De regels `STRIPE_*`, `SMTP_*` en `BOEKHOUDING_INBOX` mag je leeg of weg laten als je ze niet gebruikt.

### De NAS

| Variabele | Verplicht | Waar je de waarde vindt |
| --- | --- | --- |
| `ELENTRIK_DATA` | ja | Het basispad van de gegevens, bijvoorbeeld `/volume1/docker/elentrik`; de drie mappen daaronder maak je zelf aan (sectie 3, stap 1). |
| `ELENTRIK_UID` | ja | `id <gebruiker>` in een SSH-sessie op de NAS, het getal na `uid=`. |
| `ELENTRIK_GID` | ja | Hetzelfde commando, het getal na `gid=`. |
| `ELENTRIK_IMAGE` | nee | Standaard `ghcr.io/steffbeckers/elentrik-web:latest`. Vastzetten: een tag `sha-<korte commit>` uit de lijst van het package op GitHub. |

### Database

| Variabele | Verplicht | Waar je de waarde vindt |
| --- | --- | --- |
| `POSTGRES_WACHTWOORD` | ja | Zelf verzonnen: `openssl rand -hex 32`. Geen aanhalingstekens, spaties of `$`. Bewaar het in je wachtwoordbeheerder. |

### Aanmelden en adres

| Variabele | Verplicht | Waar je de waarde vindt |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | ja | Zelf verzonnen: `openssl rand -hex 32`, minstens 32 tekens, nieuw. |
| `BETTER_AUTH_URL` | ja | `https://elentrik.app`, zonder slash op het einde. |
| `NUXT_AUTH_BASIS_URL` | ja | Altijd `http://127.0.0.1:3000` in de container. |

### E-mail

| Variabele | Verplicht | Waar je de waarde vindt |
| --- | --- | --- |
| `MAIL_VERZENDER` | nee | `graph` voor Microsoft 365 (standaard `smtp`). |
| `GRAPH_TENANT_ID` | bij `graph` | Entra, app-registratie, Overzicht, "Directory (tenant) ID". |
| `GRAPH_CLIENT_ID` | bij `graph` | Entra, app-registratie, Overzicht, "Application (client) ID". |
| `GRAPH_CLIENT_GEHEIM` | bij `graph` | Entra, Certificaten en geheimen, de kolom "Waarde", alleen zichtbaar bij het aanmaken. Verloopt: zie je agenda. |
| `MAIL_AFZENDER` | bij `graph` | `noreply@elentrik.app`, de gedeelde mailbox. |
| `SMTP_HOST` | bij `smtp` | Je mailprovider. |
| `SMTP_PORT` | bij `smtp` | Je mailprovider, meestal 587 of 465. |
| `SMTP_VAN` | bij `smtp` | Het afzenderadres, bijvoorbeeld `"Elentrik <noreply@elentrik.app>"`. |
| `SMTP_GEBRUIKER` | bij `smtp` | Je mailprovider; samen met het wachtwoord nodig voor een aanmelding. |
| `SMTP_WACHTWOORD` | bij `smtp` | Je mailprovider. |
| `SMTP_BEVEILIGD` | bij `smtp` | `true` voor TLS vanaf het begin van de verbinding (meestal poort 465). |

### Abonnementen (Stripe)

| Variabele | Verplicht | Waar je de waarde vindt |
| --- | --- | --- |
| `STRIPE_GEHEIME_SLEUTEL` | nee | Stripe-dashboard, Ontwikkelaars, API-sleutels: `sk_test_...` of `sk_live_...`. Is hij gezet, dan zijn de drie volgende verplicht. |
| `STRIPE_WEBHOOK_GEHEIM` | bij Stripe | Het ondertekeningsgeheim van het eindpunt `https://elentrik.app/api/stripe/webhook` (`whsec_...`). |
| `STRIPE_PRIJS_MAAND` | bij Stripe | Het id van de maandprijs (`price_...`). |
| `STRIPE_PRIJS_JAAR` | bij Stripe | Het id van de jaarprijs (`price_...`). |
| `BOEKHOUDING_INBOX` | nee | Het adres van de boekhouding, voor een kopie van elke betaalde factuur. Leeg: geen kopie. |

### Noodstop

| Variabele | Verplicht | Waar je de waarde vindt |
| --- | --- | --- |
| `ELENTRIK_GEPLANDE_TAKEN` | nee | Weglaten. Met `uit` doet de uurlijkse inhaaltaak niets. |

### Door `compose.yaml` zelf gezet (niet in `.env`)

Deze variabelen zet `compose.yaml` voor je; zet ze niet in `.env`. Ze staan hier zodat je ze herkent in de
logs en in `.env.example`: `DATABASE_URL` (zonder wachtwoord), `PGPASSWORD` (krijgt `POSTGRES_WACHTWOORD`),
`ELENTRIK_BESTANDEN_DIR` (`/data/bestanden`), `ELENTRIK_GOTENBERG_URL` (`http://gotenberg:3000`) en
`ELENTRIK_VERTROUWD_PROXYNET` (`172.30.70.0/24`).
