# Elentrik: updates zonder onderbreking (ontwerp)

- **Datum:** 2026-10-31
- **Status:** ontwerp, ter goedkeuring
- **Bouwt voort op:** plan 9 "Online op de NAS" (`2026-10-29-elentrik-online-design.md`) en de staging-omgeving (`2026-10-29-elentrik-staging-design.md`).
- **Beslist met de gebruiker:**
  - De bestaande afhandeling van onderbrekingen in de app blijft zoals ze is. De autosave bewaart lokaal en probeert opnieuw; andere acties tonen de algemene foutmelding. Er komen geen nieuwe meldingen bij een mislukt verzoek en er wordt niets extra automatisch herhaald.
  - De Cloudflare-foutpagina ("Bad gateway") mag niet meer verschijnen. In de plaats komt een eigen onderhoudspagina, geserveerd door een extra container die bij een update niet bijgewerkt wordt.
  - Eén proxy voor productie en staging, die op hostnaam doorstuurt. Op staging toont de onderhoudspagina dat het staging is.
  - De onderhoudspagina controleert `/api/gezondheid` en laadt vanzelf opnieuw zodra de app terug is.
  - PWA-ondersteuning met als doel: wie de app al geladen heeft, merkt zo weinig mogelijk van een update. Projecten offline openen hoort er niet bij.
  - Een melding "nieuwe versie beschikbaar" met een knop om te herladen.
  - Of een update verplicht is, verschilt per update: een oude client die niet meer met de nieuwe server samenwerkt, moet herladen.
  - Bij een verplichte update mag wat ingevuld staat in een formulier buiten de editor (project, bedrijf, instellingen, …) verloren gaan. Verplichte updates zijn zeldzaam en die formulieren zijn kort. Alleen het werk in de editor wordt beschermd.
- **Mijn keuzes:** alle andere keuzes in dit document, telkens gemarkeerd met "(mijn keuze)".

## 1. Waarom

`deploy/nas/bijwerken.sh` doet `docker compose up -d --no-deps <dienst>`. Docker stopt dan de enige container van die omgeving en start een nieuwe, die eerst migreert en pas daarna luistert. In die tijd vindt de Cloudflare-tunnel niets op `elentrik-web(-staging):3000` en toont Cloudflare zijn eigen 502-pagina. Die pagina noemt de server "Error" en geeft de bezoeker niets om op te wachten.

Wie de app al open heeft, merkt het anders:
- **De editor:** die vangt het al goed op. Een mislukt bewaren geeft status `lokaal`, het concept staat in IndexedDB en na 10 s volgt een nieuwe poging.
- **Code die nog niet geladen is:** Nuxt laadt de code van een scherm pas bij de eerste keer dat je erheen gaat. Tijdens de update geeft dat ophalen een 502. Na de update bestaat de oude code niet meer in het nieuwe image en volgt een 404. Nuxt herlaadt dan de hele pagina, zodat de gebruiker midden in zijn werk een andere versie krijgt.
- **Na de update:** een open tabblad draait de oude code verder. Nuxt merkt een nieuwe build pas op na hoogstens een uur (één controle, daarna niet meer). Dan herlaadt de plugin `chunk-reload` van Nuxt de app ongevraagd bij de volgende navigatie in de app. De gebruiker krijgt geen keuze en geen uitleg. Werkt de oude code niet meer samen met de nieuwe server, dan merkt niemand dat tot er iets misgaat.

## 2. Doelen, niet-doelen en anti-doelen

**Doelen**

1. **Nooit de Cloudflare-foutpagina** voor `elentrik.app` en `staging.elentrik.app` als de app niet antwoordt. Er komt een eigen onderhoudspagina die vanzelf herlaadt.
2. **Een open app blijft werken tijdens en na een update.** Elk scherm kan zijn code nog laden, ook als de server even weg is of al een nieuwe versie draait.
3. **De gebruiker weet dat er een nieuwe versie is**, en kiest zelf wanneer hij herlaadt.
4. **Een verplichte update** kan een oude client tegenhouden zonder dat er werk in de editor verloren gaat.
5. **Installeerbaar als app** (PWA-manifest), als bijkomend voordeel van de service worker (mijn keuze).

**Niet-doelen**

- Updates zonder downtime aan de serverkant (blue/green, twee replica's). De onderbreking blijft bestaan; we vangen ze op.
- Projecten, lijsten of andere gegevens offline bekijken of bewerken.
- Nieuwe of andere meldingen bij mislukte verzoeken in de app, of automatische nieuwe pogingen.
- Meerdere API-versies naast elkaar op de server.
- Een eigen installatieknop of installatiebanner. De browser biedt dat zelf aan.
- De proxy bijwerken via `bijwerken.sh`.

**Anti-doelen** (dit zou mislukt zijn, ook als het technisch werkt)

- **Een pagina of API-antwoord uit de cache van de service worker** dat afhangt van sessie, taal of organisatie: verouderde gegevens of de gegevens van een andere gebruiker.
- **Een gewone update die de gebruiker dwingt te herladen** of zijn werk onderbreekt.
- **Werk in de editor dat verloren gaat** door een (verplichte) update. Formulieren buiten de editor vallen hier niet onder (beslist met de gebruiker).
- **Een proxy die eigen antwoorden van de app vervangt:** bv. de 503 van `/api/gezondheid`, een 404 of een 409 die als onderhoudspagina terugkomen.
- **Een proxy die uploads, PDF-exports of het client-IP breekt**, met een te kleine limiet op de grootte van een verzoek, een te korte time-out of verloren headers.

## 3. Onderdeel A: proxy met onderhoudspagina

### 3.1 De dienst

- **Nieuwe dienst** `proxy` in `deploy/nas/compose.yaml`, met `container_name: elentrik-proxy`, `restart: unless-stopped` en het netwerk `elentrik`. Er worden geen poorten gepubliceerd.
- **Image:** Caddy op een exacte versie die minstens twee weken oud is (mijn keuze). Nginx heeft standaard een limiet van 1 MB op een verzoek en een leestime-out van 60 s; die zouden plan-uploads en PDF-exports breken. Caddy heeft standaard geen van beide.
- **Geen `depends_on`** op `web` of `web-staging`: de proxy moet starten en antwoorden terwijl die er niet zijn.
- **Configuratie in de repo**, read-only in de container gemount:
  - `deploy/nas/proxy/Caddyfile`
  - `deploy/nas/proxy/onderhoud.html`
- **Healthcheck** op een eigen, interne route van de proxy die niet doorstuurt (mijn keuze).
- **Gewoon HTTP** op poort 8080. TLS eindigt bij Cloudflare, dus `auto_https off`. Geen toegangslog (mijn keuze: de app logt al wat nodig is).

### 3.2 Doorsturen

| Host | Naar |
|---|---|
| `elentrik.app` | `http://web:3000` |
| `staging.elentrik.app` | `http://web-staging:3000` |
| iets anders | 404, zonder door te sturen |

- **De Caddyfile gebruikt de dienstnamen van compose** (`web`, `web-staging`) en niet de containernamen. De rooktest geeft de containers andere namen; de dienstnamen blijven daar gelijk. De rooktest overschrijft ook `container_name` van de proxy, zoals hij dat bij de andere diensten doet.
- **`Host` gaat onveranderd door:** de proxy stuurt erop door. De app zelf hangt er niet van af: de CSRF-controle vergelijkt `Origin` met `BETTER_AUTH_URL`.
- **`CF-Connecting-IP` gaat onveranderd door.** `server/auth/ip.ts` gelooft die header voor sockets uit `ELENTRIK_VERTROUWD_PROXYNET` (`172.30.70.0/24`). De proxy zit in dat subnet, dus de app ziet het IP van de bezoeker zoals nu. De app leest geen `X-Forwarded-*`; dat Caddy die headers zet, maakt dus niets uit.
- **Geen limiet op de grootte van een verzoek** en geen time-out korter dan het langste verzoek van de app. De PDF-export wacht tot 60 s op Gotenberg.
- **Downloads en exports stromen door**, zonder dat ze eerst helemaal gebufferd worden.

### 3.3 Wanneer de onderhoudspagina verschijnt

Alleen als de proxy de app niet kan bereiken: de verbinding wordt geweigerd, de containernaam bestaat even niet, of het verbinden duurt te lang. Elk antwoord dat van de app zelf komt, gaat ongewijzigd door, ook een 5xx.

Wat de proxy dan antwoordt:

- **Navigatie** (`GET` met `text/html` in `Accept`): status **503** met `onderhoud.html`, plus `Cache-Control: no-store` en `Retry-After: 10`.
- **Al het andere** (`/api/…`, `/_nuxt/…`, …): status **503** met een kort lichaam, dezelfde headers. Voor `/api/` is dat JSON `{"ok":false}` (mijn keuze: zo leest de onderhoudspagina `/api/gezondheid` op dezelfde manier als bij de app zelf).

Status 503 en niet 502 (mijn keuze). Cloudflare toont een 503 van de origin met zijn eigen lichaam; bij een 502 of 504 is dat minder zeker. **De bouwer controleert op staging** dat Cloudflare de onderhoudspagina toont en niet zijn eigen pagina.

De bestaande afhandeling in de app vangt een 503 al op: de autosave gaat naar `lokaal` en probeert opnieuw, andere acties tonen de algemene melding.

### 3.4 De onderhoudspagina

- **Eén zelfstandig HTML-bestand:** CSS en JS inline, geen externe bronnen en geen lettertypes van buiten. In de stijl van Elentrik (kleuren, typografie), met licht en donker volgens het systeem (mijn keuze).
- **Taal:** de pagina kiest op basis van `navigator.languages` tussen nl, fr en en, met nl als terugval. De drie teksten staan in de pagina.
- **Tekst** (mijn keuze, nl): titel "Elentrik wordt bijgewerkt"; daaronder "Even geduld: de app is zo terug. Deze pagina laadt vanzelf opnieuw." De pagina verschijnt ook als de app om een andere reden niet antwoordt; de tekst blijft daarom vriendelijk en niet stellig over de oorzaak.
- **Na 10 minuten** zonder herstel verandert de tekst naar "Dit duurt langer dan verwacht. Probeer het later opnieuw." (mijn keuze). Het controleren gaat door.
- **Controleren:** elke 5 s een `fetch("/api/gezondheid", { cache: "no-store" })`. Bij een 200 met `ok: true` volgt `location.reload()`. Een knop "Nu opnieuw proberen" doet meteen een controle.
- **Staging:** is `location.hostname` gelijk aan `staging.elentrik.app`, dan toont de pagina dezelfde gele balk als de app (de tekst van `omgeving.staging`) en krijgt de titel het voorvoegsel "[Staging] ".
- `<meta name="robots" content="noindex">`.

### 3.5 De tunnel en de documentatie

- De public hostnames `elentrik.app` en `staging.elentrik.app` wijzen in Cloudflare naar `http://elentrik-proxy:8080` in plaats van rechtstreeks naar de web-containers. De hostname van Mailpit blijft zoals hij is.
- **Volgorde bij de uitrol:**
  1. compose met de proxy uitrollen;
  2. controleren dat `elentrik-proxy` gezond is;
  3. eerst de tunnelroute van staging omzetten en testen;
  4. daarna die van productie.
- **`docs/online.md` bijwerken:**
  - de schets onder "Hoe het in elkaar zit";
  - sectie 1 stap 3 (de URL van de public hostname);
  - de stappen voor staging;
  - sectie 7 "Updaten": de proxy wordt niet mee bijgewerkt; een eigen update doe je met `docker compose pull proxy && docker compose up -d --no-deps proxy`, wat een paar seconden alle omgevingen onderbreekt;
  - sectie 8: "de onderhoudspagina blijft staan" betekent dat de web-container niet gezond wordt; kijk in de logs.
- **`apps/web/test/deploy-docs.test.ts`** volgt de documentatie mee waar die test dat vandaag al doet.
- **`bijwerken.sh` blijft ongewijzigd.**

## 4. Onderdeel B: service worker en manifest

### 4.1 Wat de service worker doet

- **Module:** `@vite-pwa/nuxt` (Workbox) (mijn keuze). Alleen in de productiebuild. In `nuxt dev`, en dus in de huidige e2e, staat hij uit.
- **Bij het installeren** haalt hij alle bestanden van de build op die onder `/_nuxt/` staan (JS, CSS, lettertypes, afbeeldingen) en bewaart ze in één cache voor de app-bestanden.
- **Een verzoek naar `/_nuxt/<bestand met hash>`** gaat eerst naar die cache, en pas daarna naar het netwerk; een antwoord van het netwerk komt er ook in.
- **De vertalingen:** in de productiebuild haalt de client ze op via `/_i18n/<hash>/<taal>/messages.json`, een route van Nitro, en niet via `/_nuxt/`. Die URL bevat een hash. Ze gaan dus op dezelfde manier in dezelfde cache (cache eerst), zodat een taalwissel tijdens een update werkt voor elke taal die al eens geladen was (mijn keuze). Zitten alle drie de talen bij het installeren al in die cache? Dat mag, maar hoeft niet.
- **De bestanden van vorige versies blijven in de cache** tot ze verlopen (mijn keuze: 60 dagen, plus een maximum aantal bestanden). Ze worden bij het activeren van een nieuwe service worker niet weggegooid. Een URL met een hash verandert nooit van inhoud, dus versies mengen in één cache is veilig. Zo blijft een oud tabblad zijn code vinden, ook nadat een ander tabblad naar de nieuwe versie herlaadde. De standaard precache van Workbox gooit oude bestanden bij het activeren wel weg; de bouwer kiest een opzet die dat niet doet. Hoe precies, beslist de bouwer.
- **Wat hij nooit bewaart of beantwoordt uit een cache:**
  - navigaties (HTML): altijd het netwerk, geen `navigateFallback`; antwoordt de server niet, dan toont de proxy de onderhoudspagina;
  - `/api/…`: wordt niet onderschept, of alleen netwerk;
  - `/_nuxt/builds/…`: het versiebestand van Nuxt (zie 5.1). Dat heeft geen hash en moet altijd vers zijn;
  - `/pdfjs/…`: blijft zoals nu, buiten de service worker (mijn keuze, niet-doel). Die bestanden hebben al een `maxAge` van een jaar in de browser en bij Cloudflare. Dat de URL's geen versie bevatten, is een bestaand punt bij een upgrade van pdf.js; het hoort niet bij dit plan.
- **Een nieuwe service worker neemt meteen over** (`skipWaiting` + `clientsClaim`) (mijn keuze). Dat kan veilig, omdat oude bestanden in de cache blijven. Zo krijgt een herladen tabblad zeker de nieuwe versie.
- **`/sw.js` en het manifest** krijgen `Cache-Control: no-cache`. **De bouwer controleert** dat Cloudflare `/sw.js` niet in zijn eigen cache houdt (Cloudflare bewaart `.js` standaard); anders komt een nieuwe service worker pas laat aan.

### 4.2 Manifest

- **Een server-route voor `/manifest.webmanifest`** (mijn keuze), zodat staging zich als een andere app laat installeren:
  - productie: naam "Elentrik";
  - staging: naam "Elentrik (staging)".
- `start_url: "/"`, `display: "standalone"`, en een themakleur en achtergrondkleur uit de huisstijl van de app.
- **Iconen:** 192 px, 512 px en een maskable versie, plus een `apple-touch-icon` en een favicon. De repo heeft nog geen logo of favicon. De bouwer maakt een eenvoudig, eigen icoon (bv. een gestileerde "E" in de themakleur, als SVG met PNG's ervan afgeleid) dat later te vervangen is (mijn keuze). Clean room: niets overnemen van andere software.

## 5. Onderdeel C: melding bij een nieuwe versie en verplichte update

### 5.1 Een nieuwe versie opmerken

- **Nuxt houdt bij welke build draait** (`experimental.appManifest`, standaard aan). `/_nuxt/builds/latest.json` geeft de id van de nieuwste build. Dat bestand blijft de bron. De eigen controle van Nuxt is niet bruikbaar:
  - ze stopt na de eerste nieuwe build;
  - ze stopt voorgoed na een mislukte controle die geen 404 of 403 is (zoals de 503 van de proxy);
  - ze kan niet op een ander moment gestart worden.

  Die controle gaat dus uit (`experimental.checkOutdatedBuildInterval: false`), en er komt een eigen controle in de plaats (mijn keuze):
  - elke 5 minuten;
  - als het tabblad weer zichtbaar wordt (`visibilitychange`);
  - als de browser weer online komt.

  Ze vergelijkt de id uit `latest.json` met de eigen build-id (`useRuntimeConfig().app.buildId`), en blijft lopen na een nieuwe build en na mislukte controles.
- **Een mislukte controle** (de update is nog bezig, of de verbinding is weg) wordt stil genegeerd.
- **Bij elke controle** vraagt de app ook `/api/gezondheid` op, voor de minimumversie uit 5.3. Zo merkt ook een tabblad dat niets doet een verplichte update op (mijn keuze; het zijn twee kleine verzoeken per 5 minuten).
- **Bij een nieuwe versie** vraagt de app ook de service worker om bij te werken (`registration.update()`), zodat de nieuwe bestanden al klaarstaan bij het herladen.
- **Automatisch herladen door Nuxt:** de plugin `chunk-reload` van Nuxt (`experimental.emitRouteChunkError: "automatic"`) herlaadt de app bij de volgende navigatie zodra er een nieuwe build is. Dat mag niet meer. Er komt een eigen plugin in de plaats (`emitRouteChunkError: "manual"`) (mijn keuze), die:
  - bij een nieuwe build **niet** herlaadt;
  - bij een echte fout bij het laden van code (de service worker en de server hebben het bestand allebei niet, bv. bij een eerste bezoek zonder service worker of een privévenster) wel nog herlaadt op de pagina waar de gebruiker naartoe wilde, zoals Nuxt nu doet. Zonder dat zou de app daar vastlopen.

### 5.2 Gewone update: de melding

- **Een Nuxt UI-toast die blijft staan** (geen automatisch verdwijnen), met:
  - titel "Er is een nieuwe versie van Elentrik";
  - de knop "Herladen";
  - een sluitknop.
- Teksten in nl, fr en en, in de vertaalbestanden.
- **Gesloten zonder te herladen:** dan verschijnt de melding pas opnieuw bij een nog nieuwere build (mijn keuze: één keer per build per tabblad).
- **"Herladen"** doet `location.reload()`. De bestaande `beforeunload`-bescherming geldt: met onbewaarde wijzigingen in de editor vraagt de browser eerst om bevestiging.
- **Nooit** automatisch herladen bij een gewone update.

### 5.3 Verplichte update

- **Een getal in `shared/`**, bv. `shared/clientversie.ts` met `CLIENT_COMPATIBILITEIT = 1` (naam en plaats: mijn keuze). Het commentaar erbij zegt wanneer je het verhoogt: als een client van vóór deze wijziging niet meer met de nieuwe server mag samenwerken (bv. de vorm van een API-antwoord, het documentmodel of een validatie veranderde). Je verhoogt het in dezelfde commit als die wijziging. Client en server lezen hetzelfde getal; elk bevriest bij de build zijn eigen waarde.
- **De client stuurt** bij elk verzoek naar de eigen `/api/` via `$fetch` de header `X-Elentrik-Client: <getal>` mee. Dat gebeurt op één plek (bv. een plugin die `$fetch` omhult), niet per composable. De Better Auth-client hoeft dat niet.
- **De server** (middleware op `/api/**`):
  - geeft elk antwoord de header `X-Elentrik-Client-Minimum: <CLIENT_COMPATIBILITEIT>`;
  - weigert een verzoek dat niet `GET`, `HEAD` of `OPTIONS` is en waarvan `X-Elentrik-Client` **verschilt** van `CLIENT_COMPATIBILITEIT`, met status **426** en foutcode **`NIEUWE_VERSIE_VEREIST`** (nieuw in `FOUTCODES` en in de vertalingen) (mijn keuze voor status en code). "Verschilt" en niet alleen "lager" (mijn keuze): na een terugrol naar een ouder image (`docs/online.md`, sectie 7) heeft de client een hoger getal dan de server. Herladen geeft hem dan de oudere code van de server;
  - laat een verzoek zonder header altijd door: Stripe-webhooks, Docker, monitoring, Better Auth en clients van vóór dit plan. Zo kan een oude client nooit iets kapot schrijven, ook niet als hij de melding gemist heeft.
- **De client controleert elk antwoord** (geslaagd of niet) van de eigen API. Verschilt `X-Elentrik-Client-Minimum` van zijn eigen getal, of komt er een 426 met `NIEUWE_VERSIE_VEREIST`, dan zet hij een globale toestand "nieuwe versie vereist". De controle uit 5.1 vraagt `/api/gezondheid` op; zo ziet ook een tabblad dat niets doet de nieuwe waarde. (De naam van de header blijft `…-Minimum`, ook al vergelijken we op gelijkheid. Een betere naam mag de bouwer kiezen.)
- **De melding:** een modaal venster dat niet weg te klikken is, met:
  - "Elentrik is bijgewerkt. Herlaad de app om verder te werken. Je werk in de editor blijft bewaard.";
  - de knop "Herladen".

  Dit venster vervangt de toast uit 5.2.
- **De autosave:** een 426 `NIEUWE_VERSIE_VEREIST` volgt hetzelfde pad als een 401: status `lokaal`, het concept staat in IndexedDB, geen nieuwe pogingen tot `nuOpslaan()`. Het wordt een eigen vlag naast `afgemeld`, bv. `versieVerouderd` (mijn keuze).
- **"Herladen" in het modale venster** wacht eerst op `autosave.wachtOpConcept()` (als er een editor open is):
  - lukte het concept, dan herlaadt de app zonder de vraag van `beforeunload`;
  - lukte het niet, dan blijft die vraag zoals nu.

  Na het herladen biedt het bestaande concept-herstel het werk aan. **De bouwer controleert** dat dit pad werkt met een concept waarvan de versie lager is dan die op de server.
- **Een concept van vóór een wijziging van het documentmodel:** het concept-herstel (`pages/projecten/[id].vue`) laadt het document van een concept vandaag zonder migratie. Is de update verplicht omdat het documentmodel veranderde, dan zou het herstelde werk bij het bewaren een 422 krijgen. Het herstel haalt het document daarom eerst door `migreer` uit `@elentrik/model` (mijn keuze). Een wijziging van het documentmodel komt altijd met een migratie in `MIGRATIES`; het commentaar bij `CLIENT_COMPATIBILITEIT` zegt dat er ook bij. Lukt de migratie niet, dan gaat het concept niet verloren: het herstel toont de bestaande foutmelding en het concept blijft staan.

## 6. Testen

- **Unit (Vitest):**
  - de middleware: weigert een schrijfactie met een lager én met een hoger getal, laat `GET` en verzoeken zonder header door en zet de header op elk antwoord;
  - de omhulling van `$fetch`: zet de header en herkent een andere waarde van de server;
  - de autosave bij een 426;
  - de eigen versiecontrole: blijft lopen na een nieuwe build en na een mislukte controle;
  - de logica van de melding (één keer per build, verplicht wint van gewoon);
  - het concept-herstel met een document dat een migratie nodig heeft.
- **e2e (Playwright, tegen `nuxt dev` zoals nu):**
  - de toast bij een nieuwe build, nagebootst door `/_nuxt/builds/latest.json` te onderscheppen, en geen automatisch herladen bij de volgende navigatie;
  - het modale venster bij een antwoord met een hogere minimumversie;
  - het bewaarde concept na "Herladen".
- **De service worker** draait niet in `nuxt dev`. **Een kleine Playwright-test tegen de productiebuild** (mijn keuze) controleert:
  - na het eerste bezoek staan de bestanden in de cache;
  - met de server gestopt opent een tabblad nog een scherm waarvan de code nog niet geladen was;
  - na een nieuwe build met andere hashes kan een oud tabblad zijn oude code nog laden.

  Hoe die test de productiebuild start, beslist de bouwer; de echte database en `.data/bestanden` blijven onaangeroerd.
- **`deploy/nas/rooktest.sh`** krijgt de proxy erbij:
  - verzoeken met `Host: elentrik.app` en `Host: staging.elentrik.app` komen bij de juiste dienst;
  - een onbekende host geeft een 404;
  - met `web` gestopt geeft een navigatie 503 met de onderhoudspagina, en `/api/gezondheid` 503 met `{"ok":false}`;
  - een eigen 503 of 404 van de app gaat ongewijzigd door;
  - een upload groter dan 1 MB en een PDF-export lukken via de proxy;
  - `CF-Connecting-IP` komt aan bij de app;
  - `bijwerken.sh staging` laat de proxy ongemoeid.
- **Handmatig op staging:** tijdens `bijwerken.sh staging` toont Cloudflare de onderhoudspagina (niet zijn eigen pagina), en die herlaadt vanzelf als de app gezond is.

## 7. Aan de bouwer overgelaten

- De precieze configuratie van Workbox die oude bestanden bewaart (`generateSW` met runtime-caching en een opwarmstap, of `injectManifest`).
- Hoe `$fetch` omhuld wordt, en waar de toestand "nieuwe versie" leeft (store of composable).
- De opmaak van de onderhoudspagina, binnen de huisstijl van de app.
- De exacte versie van het Caddy-image, binnen de regel: exact en minstens twee weken oud.
- Hoe de healthcheck van de proxy eruitziet.
