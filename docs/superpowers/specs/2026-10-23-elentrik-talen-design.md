# Elentrik: Frans en Engels (ontwerp)

- **Datum:** 2026-10-23
- **Status:** goedgekeurd. De gebruiker volgt de keuzes in dit document ("Ik volg je keuzes").
- **Bouwt voort op:**
  - de MVP-spec `docs/superpowers/specs/2026-10-17-elentrik-mvp-design.md`, §8 "Talen": interface en bevindingen in het Nederlands en Frans, met de PDF-taal per project;
  - de bestaande app: `@nuxtjs/i18n` met alleen `nl.json`, de AREI-berichten al in NL en FR (`packages/arei/src/berichten`), de PDF-teksten in `packages/render/src/teksten/nl.ts`, en de mails in `apps/web/server/mail/sjablonen.ts`.
- **Beslist met de gebruiker:** naast Nederlands komen er Frans **en Engels**.
- **Mijn keuzes:** alle andere keuzes in dit document.

## 1. Waarom

België is tweetalig. Een installateur in Wallonië of Brussel werkt in het Frans, en zijn keuringsdossier ook. Met Frans opent Elentrik de andere helft van de Belgische markt.

Engels dient voor anderstalige installateurs en medewerkers in België, en voor een latere stap buiten België. Mijn inschatting: Engels is vooral voor de interface, minder voor het dossier. Een Engels dossier kan wel, als hulpmiddel. De officiële keuring gebeurt in het Nederlands of Frans.

## 2. Doelen, niet-doelen en anti-doelen

**Doelen**

1. **Interface in drie talen:** Nederlands (`nl`, standaard), Frans (`fr`) en Engels (`en`). Dat omvat:
   - elke pagina, dialoog, melding en foutmelding;
   - de veldnamen in de eigenschappen;
   - de namen van ruimtes en toestellen;
   - de abonnementspagina en de banners.
2. **Taalkeuze per gebruiker:**
   - De eerste keer kiest Elentrik de taal van de browser (`Accept-Language`). Is dat geen `nl`, `fr` of `en`, dan wordt het `nl`.
   - De gebruiker wisselt via het gebruikersmenu, en op de aanmeld- en registratiepagina's.
   - De keuze wordt bewaard: voor ingelogde gebruikers op het account (`user.taal`), en daarvoor in een cookie. Zo volgt de taal de gebruiker naar een ander toestel (mijn keuze).
   - De URL's blijven gelijk (`no_prefix`), zonder `/fr/...` (mijn keuze: de app staat achter een login, dus SEO speelt niet).
3. **AREI-bevindingen in drie talen:**
   - De berichtcatalogus krijgt `en` naast `nl` en `fr`.
   - De editor toont bevindingen in de taal van de interface.
4. **Dossier (PDF) in drie talen:**
   - Elk project krijgt een **dossiertaal** (`nl`, `fr` of `en`). Een nieuw project krijgt de taal van de interface van wie het aanmaakt. Een bestaand project zonder dossiertaal geldt als `nl`.
   - De dossiertaal wordt aangepast in de projectgegevens.
   - Het exportvenster toont welke taal gebruikt wordt.
   - Alle vaste teksten van de PDF volgen de dossiertaal: paginatitels, cartouche, kolommen van de kringenlijst, ruimtes en toestellen, de bijlage met bevindingen en de datums.
5. **Mails in de taal van de ontvanger:**
   - Bevestiging, magic link en wachtwoordherstel volgen `user.taal` van de ontvanger.
   - Een uitnodiging gaat in de taal van wie uitnodigt, want de ontvanger heeft vaak nog geen account (mijn keuze).
6. **Foutmeldingen van de server** komen vertaald bij de gebruiker:
   - De server stuurt een code mee (`data.code`), en de client vertaalt die.
   - Een tekst die de server zelf meestuurt (`statusMessage`), komt nooit nog rechtstreeks in beeld, behalve als laatste vangnet (zie §4.3).
7. **Stripe:** Checkout en het klantenportaal openen in de taal van de interface (`locale`: `nl`, `fr` of `en`).
8. **Getallen, bedragen en datums** volgen de taal (mijn keuze):
   - `nl-BE` en `fr-BE`;
   - `en-GB` voor Engels.

**Niet-doelen**
- Duits (de derde landstaal) en andere talen. De opbouw laat ze later wel toe.
- Vertalen van wat de gebruiker zelf typt: projectnamen, klantgegevens, ruimtenamen die hij zelf koos, of de motivatie van een afwijking.
- Taal per organisatie (wel per gebruiker en per project).
- URL's per taal, of SEO.
- Een vertaalbeheersysteem of een externe vertaaldienst.

**Anti-doelen**
- Een scherm met een mengeling van talen: een Nederlandse knop in een Franse interface, of een rauwe vertaalsleutel als `editor.export.titel` in beeld.
- Een fout AREI-artikel of een gewijzigde betekenis van een regel door de vertaling. Artikelnummers en grenswaarden zijn in elke taal identiek.
- Een dossier in een andere taal dan gekozen. De dossiertaal is een eigenschap van het project, niet van wie toevallig exporteert.
- Vertalingen die tekst of terminologie van andere software overnemen (clean room). De vertalingen zijn eigen werk.
- Technische labels op het schema die per taal anders worden, en zo een tekening onleesbaar maken voor een keurder. Kabeltypes zoals `XVB 3G2,5` blijven overal gelijk, met een decimale komma; dat is de Belgische conventie op de tekening (mijn keuze).

## 3. Randvoorwaarden

- **Bestaande stack:** `@nuxtjs/i18n` 10, met de bestaande sleutelstructuur van `nl.json` als bron. `fr.json` en `en.json` krijgen exact dezelfde sleutels.
- **Terminologie** (mijn keuze, eigen vertaling):

  | NL | FR | EN |
  |---|---|---|
  | AREI | RGIE | AREI (Belgian wiring regulations) |
  | eendraadschema | schéma unifilaire | single-line diagram |
  | situatieschema | plan de position | layout plan |
  | kringenlijst | liste des circuits | circuit list |
  | verdeelbord | tableau de distribution | distribution board |
  | automaat | disjoncteur | circuit breaker |
  | differentieel | interrupteur différentiel | residual current device (RCD) |
  | keuring | contrôle | inspection |
  | bevinding | constat | finding |
  | afwijking | dérogation | deviation |
  | eigenaar / lid | propriétaire / membre | owner / member |
  | proefperiode | période d'essai | free trial |

  Leg dit vast in een woordenlijst in de repo: `docs/vertalingen.md`. De vertalingen volgen die woordenlijst.
- **Belgisch Frans:** bv. "nonante" en "septante" in tekst, en de aanspreekvorm "vous".
- **Kwaliteit:** de vertalingen komen van de bouwer, met de woordenlijst. Vóór de lancering laat de gebruiker het Frans nalezen door iemand met Frans als moedertaal. Dat staat als opvolgpunt in de documentatie.
- **Taalgegevens:** de taal staat in de database (`user.taal`) en in het document (de dossiertaal). Het model krijgt dus een documentversie of een optioneel veld (§4.2).
- **Tests** gebruiken nooit de echte database `elentrik` (zoals altijd).

## 4. Ontwerp

### 4.1 Interface

- **Vertaalbestanden:** `i18n/locales/fr.json` en `en.json`, met dezelfde sleutels en plaatshouders als `nl.json`.
- **Configuratie in `nuxt.config`:**
  - drie locales: `nl` (`nl-BE`), `fr` (`fr-BE`) en `en` (`en-GB`);
  - `strategy: "no_prefix"`;
  - browserdetectie met cookie (`detectBrowserLanguage`, cookienaam `elentrik_taal`);
  - `fallbackLocale: "nl"`.
- **Bij het inloggen** wint `user.taal` van de cookie. Bij het wisselen past Elentrik de cookie aan en bewaart de nieuwe taal op het account (`PUT /api/mij/taal`).
- **Hardgecodeerd Nederlands verhuist naar de vertaalbestanden.** Daaronder vallen:
  - de veldnamen en opties in `app/editor/velden.ts` (een open opvolgpunt van plan 3);
  - teksten in componenten en composables;
  - `aria-label`s en `title`s.
- **Taalkiezer:** in het gebruikersmenu, en in `AuthKader` op de aanmeld- en registratiepagina's. Elke taal wordt in haar eigen taal genoemd ("Nederlands", "Français", "English").
- **`<html lang>`** volgt de taal.

### 4.2 Model en dossier

- **Dossiertaal:** de projectgegevens in `@elentrik/model` krijgen een veld `dossierTaal: "nl" | "fr" | "en"`.
  - De bouwer kiest tussen een optioneel veld (afwezig = `nl`) en een nieuwe documentversie met migratie, volgens het bestaande migratiemechanisme (`migraties.ts`).
  - `wijzigProject` aanvaardt het veld, met validatie, en het telt als één undo-stap zoals de andere projectgegevens.
  - Bij `POST /api/projecten` zet de server de dossiertaal op de taal van de gebruiker.
- **`@elentrik/render`:**
  - `teksten/fr.ts` en `teksten/en.ts` naast `nl.ts`, met hetzelfde type `Teksten`;
  - `taal` in de print-invoer wordt `"nl" | "fr" | "en"`;
  - datums in de cartouche in de taal van het dossier;
  - de kringenlijst-rijen gebruiken de vertaalde ruimtes en toestellen.
- **`@elentrik/arei`:**
  - `berichten/en.ts` naast `nl.ts` en `fr.ts`;
  - `Taal` wordt `"nl" | "fr" | "en"`;
  - een test eist dat elke sleutel in alle drie de talen bestaat, met dezelfde plaatshouders.
- **Export:**
  - `POST /api/projecten/:id/exports` gebruikt de dossiertaal van het document; de client geeft de taal niet zelf mee (mijn keuze: één bron van waarheid).
  - Het exportvenster toont "Dossiertaal: Français".
- **Ruimtenamen:** de vaste ruimtes zijn een enum in het model en worden vertaald. Een vrije ruimtenaam blijft zoals de gebruiker hem typte.

### 4.3 Server

- **`user.taal`** (`nl` | `fr` | `en`, standaard `nl`) is een `additionalField` in Better Auth.
  - Hij wordt gezet bij de registratie, uit de taal van de interface op dat moment.
  - De client kan hem niet rechtstreeks zetten via `/update-user`; het wijzigen gaat via `PUT /api/mij/taal`.
  - `/api/mij` geeft hem terug.
- **Mails:** `sjablonen.ts` krijgt de taal als parameter; elke mail bestaat in drie talen. De taal komt uit §2.5.
- **Foutcodes:**
  - Elke `createError` met een tekst die de gebruiker te zien kan krijgen, krijgt een `data.code`. De client vertaalt die code via `fouten.<code>` in de vertaalbestanden.
  - Een onbekende code toont een algemene vertaalde fout. De Nederlandse `statusMessage` blijft alleen staan voor logs en debugging.
  - Ook de foutcodes van Better Auth die de gebruiker ziet (een fout wachtwoord, een bestaand e-mailadres, de rate limit), worden vertaald.
- **Stripe:**
  - `maakCheckout` en `maakPortaal` krijgen `locale`;
  - de routes geven de taal van de gebruiker door.

### 4.4 Wat aan de bouwer overblijft

- de exacte opdeling van de sleutels voor de nieuwe teksten;
- optioneel veld of nieuwe documentversie voor `dossierTaal` (§4.2);
- het mechanisme waarmee `nuxt-i18n` de taal van de gebruiker na het inloggen overneemt;
- hoe de foutcodes in de client centraal vertaald worden: één helper in plaats van per component.

## 5. Kwaliteit en tests

- **Volledigheid:** een unittest eist dat `nl.json`, `fr.json` en `en.json` precies dezelfde sleutels hebben, met dezelfde plaatshouders (`{naam}`) en dezelfde meervoudsvormen (`|`). Hetzelfde voor `render/teksten` en `arei/berichten`.
- **Geen achtergebleven Nederlands:**
  - een statische test zoekt in `.vue`-templates naar letterlijke tekst buiten `$t`/`t()` (met een kleine uitzonderingslijst);
  - `velden.ts` gebruikt alleen sleutels.
- **Model:** `dossierTaal` valideren, de undo bij `wijzigProject`, en (bij een nieuwe versie) de migratie.
- **Render:** snapshottests van de print-HTML in `fr` en `en`, naast `nl`.
- **Server:**
  - registratie in het Frans geeft `user.taal = "fr"` en een Franse bevestigingsmail;
  - een uitnodiging volgt de taal van wie uitnodigt;
  - `PUT /api/mij/taal` valideert de taal;
  - een nieuw project krijgt de taal van de gebruiker;
  - de export gebruikt de dossiertaal;
  - Checkout krijgt `locale`.
- **Client:** de taalkiezer wisselt, bewaart en overleeft een herlaadbeurt; foutcodes worden vertaald.
- **Playwright:**
  - een gebruiker wisselt naar Frans, ziet de projectenlijst en de editor in het Frans, en de bevindingen in het Frans;
  - een project met dossiertaal Engels geeft een PDF met Engelse paginatitels;
  - de aanmeldpagina in het Engels.
- **Woordenlijst:** `docs/vertalingen.md` bevat de terminologie uit §3.
