# PDF-export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Met één klik een PDF exporteren met eendraadschema, situatieschema, kringenlijst en een bijlage met bevindingen, met een cartouche op elke pagina. Daarbij horen bedrijfsgegevens, uitgebreide projectgegevens en een tabblad Kringenlijst.

**Architecture:**
- `@elentrik/render` maakt één gepagineerde HTML met de pure functie `printHtml`.
- De Nuxt-server bewaart een snapshot, controleert, zet de HTML via Gotenberg (Docker, lokaal) om naar PDF en bewaart die als bestand met een rij in `exports`.
- De client slaat eerst op, vraagt bevestiging bij onopgeloste fouten en downloadt de PDF.

**Tech Stack:** Nuxt 4, Nuxt UI 4, Pinia, Drizzle 0.45, PostgreSQL 16 (PGlite in tests), Gotenberg 8 (Docker), Vitest, Playwright, pdfjs-dist (al aanwezig, in de e2e om pagina's te tellen).

**Spec:** `docs/superpowers/specs/2026-10-19-elentrik-pdf-export-design.md`

## Global Constraints

- **Alleen lokaal:** geen authenticatie. Alles luistert op `127.0.0.1`, ook Gotenberg op `127.0.0.1:3001`.
- **Eigen ontwikkeling:** geen code, symbolen of teksten van andere software.
- **Commits:**
  - Conventional Commits, ondertekend via 1Password, nooit met `--no-gpg-sign`;
  - elk bericht eindigt met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Werkplek:** hoofdcheckout `D:\steffbeckers\elentrik`, branch `pdf-export`, geen worktree.
- **Pakketten:** blijven zonder I/O. `render` krijgt geen runtime-afhankelijkheid op `arei` erbij; types en dev-afhankelijkheden mogen wel. Uitzondering: `formatteerBericht` mag, als `@elentrik/arei` een gewone afhankelijkheid wordt. Dat is beslist in Task 2.
- **Ruling E1:** expliciete imports in alles wat Vitest test.
- **Vertaling:**
  - De UI-teksten staan in `apps/web/i18n/locales/nl.json`.
  - De PDF-teksten staan in `packages/render/src/teksten/nl.ts`.
  - De taal is `"nl"`; `"fr"` is een niet-doel.
- **Papier:** liggend, A4 (297×210) of A3 (420×297). Marge 10 mm, cartouche 30 mm, zoals `STANDAARD_PAPIER_A4`. A3 heeft dezelfde marge en dezelfde cartouche.
- **Afmetingen en limieten:**
  - kringenlijst: rijhoogte `6` mm;
  - minimale tekstgrootte `2.5` mm;
  - afkorten met `…`;
  - logo hoogstens `2 * 1024 * 1024` bytes, alleen PNG of JPEG;
  - Gotenberg: timeout `60_000` ms en `1` nieuwe poging;
  - `ELENTRIK_GOTENBERG_URL` is standaard `http://127.0.0.1:3001`.
- **Export:**
  - Zijn er onopgeloste fouten (ernst `fout` en niet afgeweken), dan zet de server `bijlage` altijd op `true`.
  - De PDF komt uit het **opgeslagen** document en wordt bewaard als snapshot.
- **Tests:**
  - `pnpm test` (prestatietests heten `*prestatie*.test.ts`) en `pnpm typecheck` moeten groen zijn;
  - bij taken met UI ook Playwright;
  - Docker: `pnpm db:up` start ook Gotenberg.

## Review Focus

1. **Lange teksten in de cartouche of de tabel:** een klantnaam van 200 tekens, of een motivatie van 2.000 tekens. Ze worden afgekort of lopen over meerdere regels, nooit over een rand of in een ander vak. Test: Task 2, `print-html.test.ts` "lange teksten".
2. **Gotenberg onbereikbaar of te traag:** de gebruiker krijgt een 502 met de tekst "De PDF-dienst is niet bereikbaar.", er komt geen half bestand en geen rij in `exports`. Test: Task 6 (repo) en Task 11 (e2e met een verkeerde URL is niet nodig; de unittest volstaat).
3. **Een export terwijl er niet-opgeslagen wijzigingen zijn:** eerst `nuOpslaan`. Lukt dat niet, dan wordt er niet geëxporteerd. Test: Task 9, pure functie `magExporteren(status)`, plus e2e.
4. **Een situatiepagina zonder achtergrond, of een rasterbestand dat ontbreekt op schijf:** zo'n pagina wordt overgeslagen en in de bijlage vermeld, en de export gaat door. Test: Task 2 (geen achtergrond) en Task 6 (ontbrekend bestand).
5. **Een project zonder kringen of punten:** de kringenlijst toont de tekst "Geen kringen", de PDF heeft minstens één pagina, en er is geen crash. Test: Task 2.

---

### Task 1: Kringenlijstrijen, PDF-teksten en opkuis van de situatielaag

**Files:**
- Create:
  - `packages/render/src/kringenlijst.ts`
  - `packages/render/src/teksten/nl.ts`
  - `packages/render/test/kringenlijst.test.ts`
- Modify:
  - `packages/render/src/situatie-svg.ts`
  - `packages/render/src/index.ts`
  - `packages/render/test/situatie-svg.test.ts`
  - `packages/render/package.json` (dependency `@elentrik/model` voor runtime-types/functies als dat nodig is)

**Interfaces:**
- Consumes:
  - `Analyse` (type) uit `@elentrik/arei`
  - `beveiligingLabel` en `leidingLabel` uit `@elentrik/layout`
  - `InstallatieDocument` en `Node` uit `@elentrik/model`
- Produces:
  - `type KringenlijstRij = { nodeId: string; kring: string; punt: string; type: string; ruimte: string; beveiliging: string; differentieel: string; leiding: string }`
  - `kringenlijst(doc, analyse, teksten: Teksten): KringenlijstRij[]`
    - Volgorde: de kringen in de volgorde van de analyse, en daarbinnen de punten in pre-order.
    - `type`: `teksten.types[node.type]`. Bij een toestel wordt dat `"Toestel (wasmachine)"`, met de soort uit `teksten.toestelsoorten`.
    - `ruimte`: `teksten.ruimtes[node.ruimte]`, of `""` als er geen ruimte is.
    - `beveiliging`: `beveiligingLabel` van de kringbeveiliging.
    - `differentieel`: `"30 mA type A"` voor de dichtstbijzijnde differentieel in `analyse.ketens[id].differentielen[0]`, of `""`.
    - `leiding`: `leidingLabel` van `ketens[id].leidingId`, of `""`.
    - `punt`: `analyse.puntLabels[id]`.
    - Punten zonder kring krijgen `kring: "—"`.
  - `type Teksten`, met `export const NL: Teksten`. Bevat:
    - de paginatitels: eendraadschema, situatieschema, kringenlijst, bijlage;
    - de cartouchelabels: klant, werf, installateur, EAN, datum, versie, pagina, handtekening installateur, handtekening keurder;
    - de kolomkoppen van de kringenlijst;
    - `types` per NodeType, `toestelsoorten` en `ruimtes`;
    - de bijlagetitels: fouten, waarschuwingen, info, afwijkingen, overgeslagen pagina's;
    - `geenKringen: "Geen kringen"`.
    - Gebruik dezelfde Nederlandse woorden als in `apps/web/i18n/locales/nl.json`, waar die al bestaan.
  - De schaal in `situatieLaagSvg` krijgt 4 decimalen, via een lokale helper `schaalGetal(n)`. De snapshot wordt bijgewerkt.

- [ ] **Step 1: Write failing tests:**
  - kringenlijst voor `referentieAppartement()` uit `@elentrik/arei/testing`:
    - het aantal rijen is gelijk aan het aantal punten;
    - de eerste rij heeft `kring` "A" en `punt` "A1";
    - `beveiliging` komt overeen met `beveiligingLabel` van de automaat;
    - er is een niet-lege `leiding` bij elk punt dat onder een leiding hangt;
  - een toestel toont de soort tussen haakjes;
  - een document zonder kringen geeft `[]`;
  - `situatieLaagSvg`:
    - de schaal heeft 4 decimalen (`grootte_px` 133.33 en symbool 24 mm geeft `5.5556`);
    - de nodeId `a" onload="x` verschijnt geëscaped als `&quot;`, en de XML blijft geldig.
- [ ] **Step 2: Run** `pnpm vitest run packages/render/test/kringenlijst.test.ts packages/render/test/situatie-svg.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Export `kringenlijst`, `KringenlijstRij`, `Teksten` en `NL` uit de index.
- [ ] **Step 4: Run** dezelfde tests, daarna `pnpm test` en `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(render): kringenlijstrijen, pdf-teksten en preciezere situatieschaal`

### Task 2: `printHtml` met cartouche en paginering

**Files:**
- Create:
  - `packages/render/src/print/print-html.ts` (de orkestratie)
  - `packages/render/src/print/cartouche.ts`
  - `packages/render/src/print/tekst.ts` (afkorten en regels breken)
  - `packages/render/src/print/stijl.ts` (de CSS)
  - `packages/render/test/print-html.test.ts`
  - `packages/render/test/print-prestatie.test.ts`
- Modify: `packages/render/src/index.ts` en `packages/render/package.json`

**Interfaces:**
- Consumes:
  - `opmaak` en `tekstBreedte` uit `@elentrik/layout`
  - `schemaPaginaSvg` en `situatieLaagSvg` uit render
  - `kringenlijst`, `NL` en `Teksten` uit Task 1
  - `formatteerBericht` en `Bevinding` uit `@elentrik/arei`
  - `tekenSymbool` uit `@elentrik/symbols`
- Ruling: `@elentrik/arei` wordt een gewone dependency van render, nodig voor `formatteerBericht`. Er ontstaat geen cyclus: arei hangt niet af van render.
- Produces:
  - `type PrintOpties = { papier: "A4" | "A3"; onderdelen: { eendraadschema: boolean; situatieschema: boolean; kringenlijst: boolean; bijlage: boolean }; versieLabel: string; datum: string; taal: "nl"; installateur: Partij; afbeeldingen: Record<string, string>; logo?: string }`
    - `afbeeldingen` koppelt een bestandId aan de bestandsnaam waaronder het bestand aan Gotenberg gegeven wordt.
    - `logo` is de bestandsnaam van het logo.
  - `printHtml(doc, analyse, bevindingen, opties): { html: string; paginas: number; overgeslagen: string[] }`
    - `overgeslagen` bevat de titels van situatiepagina's zonder achtergrond of zonder bestand in `afbeeldingen`.
    - De HTML is een volledig document, `<!doctype html>` met `<meta charset="utf-8">`.
    - `@page { size: <b>mm <h>mm; margin: 0 }`. Elke pagina is een `<section class="pagina">` met die vaste maat en `break-after: page`; de laatste heeft `break-after: auto`.
    - Volgorde van de onderdelen:
      1. **eendraadschema:** een pagina per `opmaak(doc, analyse, papier).paginas`;
      2. **situatieschema:** een pagina per situatiepagina met achtergrond en afbeelding. Een `<img>` en een `<svg viewBox>` met de laag liggen in hetzelfde kader dat in de bruikbare ruimte past, met behoud van verhouding;
      3. **kringenlijst:**
         - `floor((bruikbare hoogte − kop) / 6)` rijen per pagina, met de kop herhaald;
         - celtekst die breder is dan de kolom (geschat met `tekstBreedte`), wordt afgekort met "…";
         - bij 0 rijen één pagina met `geenKringen`;
      4. **bijlage:**
         - per ernst een kop, en per bevinding `formatteerBericht(b, "nl")`;
         - de afwijkingen met regel, punt, motivatie, `door` en `datum`;
         - de overgeslagen pagina's;
         - tekst wordt over regels gebroken op de kolombreedte; is de pagina vol, dan volgt een nieuwe pagina.
    - De cartouche staat op elke pagina en bevat: logo (`<img>` als `logo` gezet is), installateur (naam, adres, telefoon en e-mail), klant (naam en adres), werfadres, EAN, paginatitel, datum, versie, `N / M` en twee lege handtekeningvakken. Elke tekst gaat door `escapeXml` en wordt binnen zijn vak afgekort.
    - Zijn alle onderdelen uitgeschakeld, dan gooit de functie een `RangeError`. De server laat dat nooit toe.
  - `afkorten(tekst, breedte_mm, grootte_mm): string` en `breekRegels(tekst, breedte_mm, grootte_mm): string[]` in `tekst.ts`, beide puur.

- [ ] **Step 1: Write failing tests:**
  - snapshots van `printHtml` voor `referentieAppartement()` op A4 met alle onderdelen, en voor `referentieWoning()` op A3. Gebruik vaste ids en datum met `nummerNodeIds` uit `test/hulp.ts`;
  - `paginas` is gelijk aan het aantal `<section class="pagina">`, en elke pagina bevat `N / paginas` met de juiste N;
  - Review Focus 1:
    - een klantnaam van 200 tekens eindigt op "…" en `tekstBreedte` van de afgekorte tekst past in het vak;
    - een motivatie van 2.000 tekens geeft meerdere regels die elk passen;
  - kringenlijst van 120 punten op A4: het aantal pagina's is `ceil(120 / rijenPerPagina)`;
  - Review Focus 5: een document zonder kringen geeft minstens één pagina met "Geen kringen";
  - Review Focus 4: een situatiepagina zonder achtergrond, of zonder entry in `afbeeldingen`, staat in `overgeslagen` en de bijlage vermeldt ze;
  - escape: `<script>` als klantnaam en als motivatie verschijnt geëscaped;
  - prestatie: 2.000 nodes, alle onderdelen, mediaan van 10 runs onder `200` ms.
- [ ] **Step 2: Run** de tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** de tests, `pnpm test` en `pnpm typecheck`. Expected: PASS. Schrijf daarnaast de HTML voor `referentieWoning()` naar `out/print-voorbeeld.html` (gitignored), zodat de controller ze visueel kan nakijken.
- [ ] **Step 5: Commit** `feat(render): printHtml met cartouche, paginering, kringenlijst en bijlage`

### Task 3: Projectgegevens uitbreiden in het model

**Files:**
- Modify: `packages/model/src/project.ts`
- Test: `packages/model/test/project.test.ts`

**Interfaces:**
- Produces: `wijzigProject(doc, wijziging: { klantNaam?; stroomtype?; klantAdres?: Adres | null; werfadres?: Adres; ean?: string; datum?: string })`.
  - `klantAdres: null` wist het adres van de klant.
  - De waarden worden gevalideerd met `AdresSchema` en een string-schema. Bij een ongeldige waarde volgt `ONGELDIG_SCHEMA`.
  - Alles in één aanroep is één resultaat, en dus één undo-stap.

- [ ] **Step 1: Write failing tests:**
  - per veld: zetten en weer ongedaan maken via de inverse patches;
  - `klantAdres: null` wist het adres;
  - een ongeldig adres (zonder `gemeente`) geeft `ONGELDIG_SCHEMA`;
  - een lege wijziging blijft zoals ze nu werkt.
- [ ] **Step 2: Run** de tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** de tests, `pnpm test` en `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(model): klantadres, werfadres, ean en datum in wijzigProject`

### Task 4: Bedrijfsgegevens op de server

**Files:**
- Modify: `apps/web/server/db/schema.ts`, plus een nieuwe migratie via `db:generate`
- Create:
  - `apps/web/server/bedrijf/repo.ts`
  - `apps/web/server/api/bedrijfsgegevens/index.get.ts`
  - `apps/web/server/api/bedrijfsgegevens/index.put.ts`
  - `apps/web/server/api/bedrijfsgegevens/logo.post.ts`
- Modify: `apps/web/server/bestanden/repo.ts`, `apps/web/server/utils/bestanden.ts`
- Test: `apps/web/test/bedrijf-repo.test.ts`, en uitbreidingen van `apps/web/test/bestanden-repo.test.ts`

**Interfaces:**
- Produces:
  - Tabellen:
    - `bedrijfsinstellingen`: `id` integer pk (altijd 1), `installateur` jsonb not null met default `{"naam":""}`, `gewijzigd` timestamptz;
    - `snapshots` en `exports` volgens spec §4.3, alvast in deze migratie;
    - `bestanden.project_id` wordt nullable;
    - `bestanden.soort` aanvaardt `plan-origineel | plan-raster | logo | export`.
  - `haalBedrijf(db): Promise<Partij>`. Zonder rij geeft dit `{ naam: "" }`.
  - `bewaarBedrijf(db, partij: Partij): Promise<Partij>`. Dit is een upsert van rij 1, gevalideerd met `PartijSchema`, maar `logoBestandId` wordt alleen door de logo-route gezet.
  - `bewaarLogo(db, opslag, data): Promise<BestandInfo>`:
    - alleen PNG of JPEG, op basis van magic bytes;
    - hoogstens `MAX_LOGO_BYTES = 2 * 1024 * 1024`;
    - de opslagsleutel is `bedrijf/<bestandId>`;
    - zet `installateur.logoBestandId`.
  - `bewaarBestand` aanvaardt `soort: "export"` met mime `application/pdf`. Dat is alleen intern; de upload-route blijft `plan-*` alleen.
  - Routes:
    - `GET /api/bedrijfsgegevens` geeft de `Partij`;
    - `PUT` met een `Partij` zonder `logoBestandId` geeft de bewaarde `Partij`;
    - `POST /api/bedrijfsgegevens/logo` (multipart `bestand`) geeft `BestandInfo`. Te groot geeft 413, een verkeerd type 415.

- [ ] **Step 1: Write failing tests** (PGlite en een tijdelijke map):
  - haal zonder rij geeft `{naam:""}`;
  - bewaar en dan haal geeft dezelfde waarde;
  - een ongeldig adres wordt geweigerd;
  - logo: PNG ok, en `logoBestandId` is gezet; SVG geeft `ONGELDIG_TYPE`; 2 MB + 1 geeft `TE_GROOT`;
  - de bestaande bestanden-tests blijven groen met een nullable `projectId`.
- [ ] **Step 2: Run** de tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Pas de schema's aan, genereer de migratie en pas ze toe op de lokale database (`DATABASE_URL=postgres://elentrik:elentrik@127.0.0.1:5432/elentrik pnpm --filter @elentrik/web db:migrate`).
- [ ] **Step 4: Run** de tests, `pnpm test` en `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): bedrijfsgegevens met logo, tabellen voor snapshots en exports`

### Task 5: Gotenberg-client en Docker-dienst

**Files:**
- Modify: `infra/docker-compose.yml`, `apps/web/.env.example`, de root-`package.json` (als `db:up` alleen postgres start: zorg dat ook gotenberg start)
- Create: `apps/web/server/pdf/gotenberg.ts`
- Test: `apps/web/test/gotenberg.test.ts`

**Interfaces:**
- Produces:
  - Dienst `gotenberg`: image `gotenberg/gotenberg:8.x.y`, met een exacte tag die minstens twee weken oud is; controleer de datum op Docker Hub. Hij luistert op `127.0.0.1:3001:3000`.
  - `.env.example` krijgt `ELENTRIK_GOTENBERG_URL=http://127.0.0.1:3001`.
  - `class PdfFout extends Error { code: "ONBEREIKBAAR" | "TIMEOUT" | "MISLUKT" }`
  - `maakPdf(invoer: { html: string; bestanden: { naam: string; data: Uint8Array; mime: string }[]; papier: "A4" | "A3" }, opties?: { fetch?: typeof fetch; url?: string; timeoutMs?: number }): Promise<Uint8Array>`. Het verzoek:
    - een POST naar `${url}/forms/chromium/convert/html`, multipart met `files` = `index.html` plus de bestanden;
    - de velden `paperWidth` en `paperHeight` in inch (liggend), `marginTop`, `marginBottom`, `marginLeft` en `marginRight` op `0`, `printBackground=true` en `preferCssPageSize=true`;
    - bij een netwerkfout, een 5xx of een timeout volgt één nieuwe poging; daarna volgt `PdfFout`;
    - een 4xx volgt meteen als `MISLUKT`, zonder nieuwe poging;
    - het antwoord moet beginnen met `%PDF-`, anders volgt `MISLUKT`.

- [ ] **Step 1: Write failing tests** met een nep-`fetch`:
  - succes: één aanroep, de velden zijn correct en `files` bevat `index.html`;
  - eerst een 503 en dan succes geeft twee aanroepen;
  - twee keer een netwerkfout geeft `ONBEREIKBAAR`;
  - twee keer een timeout (een `fetch` die nooit eindigt, met `timeoutMs` 20) geeft `TIMEOUT`;
  - een 400 geeft één aanroep en `MISLUKT`;
  - een antwoord dat geen PDF is, geeft `MISLUKT`.
- [ ] **Step 2: Run** de tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Start de container (`docker compose -f infra/docker-compose.yml up -d gotenberg`) en controleer met een korte handmatige `curl` dat een minimale HTML een PDF geeft.
- [ ] **Step 4: Run** de tests, `pnpm test` en `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): gotenberg-client en lokale pdf-dienst`

### Task 6: Exports op de server

**Files:**
- Create:
  - `apps/web/server/exports/repo.ts`
  - `apps/web/server/api/projecten/[id]/exports.post.ts`
  - `apps/web/server/api/projecten/[id]/exports.get.ts`
- Modify:
  - `apps/web/server/bestanden/headers.ts`
  - `apps/web/server/api/bestanden/[id].get.ts`
  - `apps/web/shared/` (types)
- Test: `apps/web/test/exports-repo.test.ts`, `apps/web/test/bestanden-opslag.test.ts`

**Interfaces:**
- Consumes:
  - `printHtml` (Task 2);
  - `haalBedrijf` (Task 4);
  - `maakPdf` en `PdfFout` (Task 5);
  - `analyseer` en `controleer` uit arei;
  - `haalProject`, `bewaarBestand` en de opslag.
- Produces:
  - `type ExportInvoer = { onderdelen; papier; versieLabel: string }`, gevalideerd met Zod. `versieLabel` is na trimmen 1 tot 40 tekens. Minstens één onderdeel staat aan.
  - `type ExportInfo = { id; bestandId; versieLabel; papier; aantalFouten; aantalWaarschuwingen; aangemaakt: string }`, in `shared/exports.ts`.
  - `maakExport(db, opslag, projectId, invoer, deps: { maakPdf; nu?: () => Date }): Promise<ExportInfo>`:
    1. laadt het project; zonder project volgt `NIET_GEVONDEN`;
    2. laat bijlage verplicht aan staan bij onopgeloste fouten;
    3. zet het snapshot;
    4. bouwt `afbeeldingen` uit de rasters van de situatiepagina's. Een raster dat niet in de opslag staat, wordt overgeslagen (Review Focus 4);
    5. neemt het logo mee als het er is;
    6. roept `printHtml` en `maakPdf` aan;
    7. bewaart de PDF als bestand van soort `export`;
    8. voegt een rij toe aan `exports`. Snapshot, bestand en rij komen pas na een geslaagde PDF; bij een `PdfFout` wordt niets bewaard.
  - `lijstExports(db, projectId): Promise<ExportInfo[]>`, de nieuwste eerst.
  - `bestandHeaders(mime, opties?: { download?: string })`. Met `download` geeft het `Content-Disposition: attachment; filename="<ascii>"; filename*=UTF-8''<encoded>`. De bestandsnaam wordt gesaneerd: geen `"\/:*?<>|` of stuurtekens.
  - `GET /api/bestanden/:id` gebruikt `download` voor `soort = export`, met als naam `<projectnaam> - <versieLabel>.pdf`.
  - Routes:
    - POST geeft 201 met `ExportInfo`. `PdfFout` wordt 502 met de boodschap "De PDF-dienst is niet bereikbaar." (ONBEREIKBAAR of TIMEOUT) of "De PDF kon niet gemaakt worden." (MISLUKT). De fout wordt gelogd met het projectId.
    - GET geeft de lijst.

- [ ] **Step 1: Write failing tests** (PGlite, tijdelijke map en een nep-`maakPdf` die `%PDF-1.7` teruggeeft en zijn invoer bewaart):
  - een export maakt een snapshot, een bestand en een rij, en de PDF-bytes staan in de opslag;
  - bij een document met een onopgeloste fout en `bijlage: false` bevat de HTML die naar `maakPdf` gaat toch de bijlage, en `aantalFouten` is 1 of meer;
  - Review Focus 2: `maakPdf` gooit `PdfFout("ONBEREIKBAAR")`, en er zijn geen nieuwe rijen in `snapshots`, `exports` of `bestanden`;
  - Review Focus 4: een rasterbestand dat ontbreekt in de opslag; de export lukt en `overgeslagen` staat in de HTML;
  - `lijstExports` geeft de nieuwste eerst;
  - `bestandHeaders("application/pdf", { download: 'Huis "Peeters" / V1.pdf' })` geeft een gesaneerde `filename` en een correcte `filename*`.
- [ ] **Step 2: Run** de tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** de tests, `pnpm test` en `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): pdf-export via snapshot en gotenberg`

### Task 7: Pagina Bedrijfsgegevens

**Files:**
- Create:
  - `apps/web/app/pages/instellingen.vue`
  - `apps/web/app/composables/useBedrijfApi.ts`
- Modify:
  - `apps/web/app/pages/index.vue` (link "Bedrijfsgegevens")
  - `apps/web/i18n/locales/nl.json`
- Test: `apps/web/test/bedrijf-api.test.ts`

**Interfaces:**
- Produces:
  - `maakBedrijfApi(haal)` met `haal()`, `bewaar(partij)` en `uploadLogo(blob, naam)`, volgens het patroon van `maakProjectenApi`.
  - De pagina bevat:
    - een formulier met naam, ondernemingsnummer, telefoon, e-mail en een adres (straat, nummer, bus, postcode, gemeente en land, standaard "België");
    - een logo-upload met voorbeeld, via `GET /api/bestanden/<logoBestandId>`;
    - Bewaren, met een toast.
  - Testids: `bedrijf-naam`, `bedrijf-bewaar`, `bedrijf-logo`.

- [ ] **Step 1: Write failing tests** voor `maakBedrijfApi`: de juiste URL's, methodes en bodies.
- [ ] **Step 2: Run** de tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** de tests, `pnpm test`, `pnpm typecheck` en Playwright. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): pagina bedrijfsgegevens`

### Task 8: Projectgegevensdialoog uitbreiden

**Files:**
- Modify:
  - `apps/web/app/components/editor/ProjectgegevensDialoog.vue`
  - `apps/web/app/stores/editor.ts` (`wijzigProjectgegevens`)
  - `apps/web/i18n/locales/nl.json`
- Test: `apps/web/test/editor-store.test.ts`

**Interfaces:**
- Consumes: `wijzigProject` met de nieuwe velden (Task 3).
- Produces:
  - `wijzigProjectgegevens({ naam?, klantNaam?, stroomtype?, klantAdres?, werfadres?, ean?, datum? })`, als één undo-stap.
  - De dialoog krijgt de secties "Klant" (naam en adres), "Werf" (adres en EAN) en "Datum".
  - Een adres is optioneel. Is de straat leeg, dan gaat er voor de klant `klantAdres: null` mee. Het werfadres wordt altijd bewaard.

- [ ] **Step 1: Write failing tests:** `wijzigProjectgegevens` met een adres geeft één undo-stap, en undo herstelt het oude adres.
- [ ] **Step 2: Run** de tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** de tests, `pnpm test`, `pnpm typecheck` en Playwright. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): klant- en werfgegevens in de projectgegevens`

### Task 9: Exportdialoog

**Files:**
- Create:
  - `apps/web/app/components/editor/ExportDialoog.vue`
  - `apps/web/app/composables/useExportsApi.ts`
  - `apps/web/app/editor/export.ts` (pure logica)
- Modify:
  - `apps/web/app/components/editor/EditorBovenbalk.vue` (knop "Exporteren", testid `exporteren`)
  - `apps/web/app/pages/projecten/[id].vue` (de dialoog mounten en `autosave.nuOpslaan` en `autosave.status` doorgeven)
  - `apps/web/i18n/locales/nl.json`
- Test: `apps/web/test/export.test.ts`, `apps/web/test/exports-api.test.ts`

**Interfaces:**
- Produces:
  - `magExporteren(status: AutosaveStatus): boolean`. Dit is alleen `true` bij `"opgeslagen"`.
  - `volgendVersieLabel(aantalExports: number): string`, met `0` geeft `"V1"`.
  - `onopgelosteFouten(bevindingen): number`.
  - `maakExportsApi(haal)` met `maak(projectId, invoer)`, `lijst(projectId)` en `downloadUrl(bestandId)`.
  - De dialoog:
    - roept bij het openen `await nuOpslaan()` aan en blokkeert met een uitleg als `!magExporteren(status)`;
    - heeft checkboxen voor de vier onderdelen. Bijlage is aangevinkt en uitgeschakeld bij onopgeloste fouten, met de tekst "Er zijn {n} onopgeloste fouten; de bijlage komt verplicht mee.";
    - heeft een A4/A3-keuze en een versieveld, standaard `volgendVersieLabel(lijst.length)`;
    - vraagt bij onopgeloste fouten eerst een bevestiging;
    - toont een voortgangsindicator. Daarna start de download via een tijdelijke `<a download>` naar `downloadUrl`, en de lijst wordt bijgewerkt;
    - toont de lijst met eerdere exports (versie, datum, aantal fouten), elk met een downloadlink;
    - een 502 geeft een toast met de servertekst.
  - Testids: `exporteren`, `export-bijlage`, `export-versie`, `export-start`, `export-lijst`.

- [ ] **Step 1: Write failing tests:**
  - `magExporteren` voor elke status;
  - `volgendVersieLabel(0)` geeft "V1" en `volgendVersieLabel(4)` geeft "V5";
  - `onopgelosteFouten` telt alleen `fout` die niet afgeweken is;
  - de API-URL's.
- [ ] **Step 2: Run** de tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** de tests, `pnpm test`, `pnpm typecheck` en Playwright. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): exportdialoog met versies en verplichte bijlage bij fouten`

### Task 10: Tabblad Kringenlijst

**Files:**
- Create: `apps/web/app/components/kringenlijst/KringenlijstTabel.vue`
- Modify:
  - `apps/web/app/components/editor/EditorBovenbalk.vue` (tab actief, testid `tab-kringenlijst`)
  - `apps/web/app/stores/editor.ts` (`tabblad` krijgt `"kringenlijst"`)
  - `apps/web/app/pages/projecten/[id].vue`
  - `apps/web/i18n/locales/nl.json`
- Test: `apps/web/test/editor-store.test.ts` (het tabblad)

**Interfaces:**
- Consumes: `kringenlijst(doc, analyse, NL)` uit render.
- Produces:
  - een alleen-lezen tabel met dezelfde kolommen als de PDF;
  - een klik op een rij zet `selectie = [nodeId]`, en de geselecteerde rij is gemarkeerd;
  - zonder kringen staat er "Geen kringen";
  - de linkerkolom en het canvas maken plaats voor de tabel; de rechterkolom blijft;
  - beide canvassen blijven hun tabblad-guard houden; de kringenlijst heeft geen sneltoetsen;
  - testid `kringenlijst-rij-<punt>`.

- [ ] **Step 1: Write failing tests:** `tabblad` kan `"kringenlijst"` zijn en wordt in `laad` teruggezet.
- [ ] **Step 2: Run** de tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** de tests, `pnpm test`, `pnpm typecheck` en Playwright. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): tabblad kringenlijst`

### Task 11: End-to-end export

**Files:**
- Create: `apps/web/e2e/export.spec.ts`

- [ ] **Step 1: Write `export.spec.ts`:**
  1. Vul de bedrijfsgegevens in op `/instellingen` en laad een PNG-logo op (`e2e/fixtures/plan.png` volstaat).
  2. Maak een project met een kring en 2 contactdozen, laad `plan.png` op als situatiepagina en plaats A1.
  3. Vul in de projectgegevens het werfadres in.
  4. Open Exporteren, laat de standaardwaarden staan (A4) en exporteer. Vang de download op met `page.waitForEvent("download")`. De bytes beginnen met `%PDF-`. Het aantal pagina's (met pdfjs-dist in Node, `getDocument({ data })`) is gelijk aan het aantal eendraadschemapagina's + 1 situatiepagina + minstens 1 kringenlijstpagina + 1 bijlagepagina. De bijlage staat aan, want er is info.
  5. Exporteer nog eens: de lijst toont "V2" bovenaan.
  6. Maak met de API een fout: bijvoorbeeld een leiding met een te kleine doorsnede, zoals in de arei-tests. Open Exporteren: de bevestiging toont het aantal fouten en `export-bijlage` is uitgeschakeld en aangevinkt.
  7. Tabblad Kringenlijst: `kringenlijst-rij-A1` is zichtbaar, en een klik selecteert A1 in het eigenschappenpaneel.
- [ ] **Step 2: Run** `pnpm --filter @elentrik/web exec playwright test`, met Gotenberg gestart. Expected: PASS. Werkt een stap niet, dan is dat een bug in Task 1–10: los ze daar op, met een regressietest.
- [ ] **Step 3: Run** `pnpm test` en `pnpm typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** `test(web): end-to-end pdf-export`
