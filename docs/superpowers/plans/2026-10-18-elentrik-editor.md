# Elentrik plan 3: editor voor het eendraadschema

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** een lokale Nuxt-webapp waarin een installateur projecten beheert en een eendraadschema tekent:
- het schema groeit naar boven;
- onderdelen komen erbij via +-knoppen;
- de eigenschappen zijn aanpasbaar;
- de AREI-bevindingen zijn live te zien;
- er is undo/redo;
- het project wordt automatisch opgeslagen in Postgres.

**Architecture:**
- **Pure pakketten:** eerst worden ze aangepast. Het schema groeit naar boven, de layout geeft aanknopingspunten en vakken terug, en er komen nieuwe modeloperaties en toevoegregels bij.
- **App:** `apps/web` is een Nuxt 4-app met Nuxt UI.
- **Server:** de Nitro-API gebruikt Drizzle op Postgres. Tests draaien op PGlite.
- **Client:** een Pinia-store houdt het document, de undo/redo-geschiedenis en de selectie bij. Daaruit worden de analyse, de bevindingen, de opmaak en de SVG afgeleid.
- **Canvas:** het tekent de SVG-string van `render`, met daarover een overlay voor de selectie, de markeringen en de +-knoppen.

**Tech Stack:**
- de bestaande toolchain: Node 24, pnpm 12, TypeScript 7, Vitest 5;
- Nuxt 4.6, `@nuxt/ui` 4.12 (Tailwind 4), `@pinia/nuxt` 1 / Pinia 4 en `@nuxtjs/i18n` 10 (alleen `nl`);
- Drizzle ORM 0.45 en drizzle-kit 0.31, met `postgres` 3.4 (dev) en `@electric-sql/pglite` 0.5 (tests);
- `idb-keyval` 6, `fake-indexeddb` (dev) en `@playwright/test` 1.64.

**Spec:** `docs/superpowers/specs/2026-10-18-elentrik-editor-design.md`. Lees ook de MVP-spec `docs/superpowers/specs/2026-10-17-elentrik-mvp-design.md` §6.

## Global Constraints

- **Eigen ontwikkeling:** geen code, symbolen of teksten van andere software.
- **Pakketten:** de pakketten onder `packages/*` blijven zonder I/O: geen `node:`, `fs`, `fetch`, Vue of Nuxt in `src`. I/O hoort in `apps/web/server` en in `scripts/`.
- **Afhankelijkheden:** de richting blijft `model` ← `arei` / `symbols` ← `layout` ← `render`. `apps/web` mag alles gebruiken.
- **Alleen lokaal:** geen authenticatie. De dev-server en Postgres luisteren alleen op `127.0.0.1`.
- **Richting:** het schema groeit **alleen naar boven**. `in` ligt onderaan, `uit` bovenaan, en tekst blijft rechtop.
- **Prestaties:** na elke documentwijziging zijn de analyse, `controleer`, `opmaak` en `schemaStripSvg` samen klaar in minder dan 100 ms bij 2.000 nodes.
- **Opslaan:**
  - automatisch, 2 s na de laatste wijziging;
  - `PUT` met `If-Match: <versie>`; 409 bij een andere versie, 422 bij een ongeldig document;
  - een concept in IndexedDB.
- **Undo-geschiedenis:** maximaal 200 stappen. Een toevoeging telt altijd als één stap, en typen in een veld ook, tot het veld de focus verliest.
- **Taal:** de UI is Nederlands via `@nuxtjs/i18n` (alleen `nl`). Gebruik geen hardgecodeerde UI-strings in componenten.
- **Code:** TypeScript strict. Tests importeren expliciet uit `vitest`.
- **Commits:** ondertekend via 1Password. Gebruik nooit `--no-gpg-sign`. Conventional Commits, eindigend op `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Een punt midden in een keten verwijderen:** alleen dat punt verdwijnt, en de punten erboven blijven verbonden. → Task 4 en Task 13.
2. **Hetzelfde project in twee tabbladen:** het tweede tabblad dat opslaat, krijgt een 409. Er wordt nooit stil iets overschreven, en de gebruiker krijgt de keuze. → Task 7 en Task 10.
3. **Browser sluit voor het automatisch opslaan:** bij het heropenen wordt het lokale concept aangeboden. → Task 10.
4. **Markup in een klantnaam of label**, bv. `<img src=x onerror=…>`: dat verschijnt als tekst, in de UI en in de SVG. → Task 12 en Task 13.
5. **Een groot schema van 2.000 nodes:** een toevoeging is binnen 100 ms zichtbaar verwerkt. → Task 9.

---

### Task 1: Symbolen naar boven

**Files:**
- Modify: `packages/symbols/src/{voeding,beveiliging,punten,leiding}.ts`, `packages/symbols/src/types.ts` (doc-comment van `SymboolMaat`)
- Modify: `packages/symbols/test/*.test.ts` en `test/hulp.ts`; snapshots opnieuw opnemen

**Interfaces:**
- Produces:
  - Elk `Symbool` heeft `maat.in = { x: breedte/2, y: hoogte }` (onderaan, naar de voeding) en `maat.uit = { x: breedte/2, y: 0 }` (bovenaan, naar de volgende node).
  - De doc-comment van `SymboolMaat` zegt dat ook.

**Aanpak:**
- Spiegel de vormen verticaal, met `y → hoogte − y` in de coördinaten die naar de builders gaan.
- Gebruik **geen** SVG-transform. Zo blijven de testhulpen `buitenVak` en `raakt` werken.
- Tekst blijft rechtop. Spiegel alleen de positie van de basislijn, met `y_nieuw = hoogte − y_oud + grootte × 0.7`, zodat tekst ongeveer op dezelfde plaats in het vak blijft. Controleer dat visueel.

- [ ] **Step 1: Pas de tests aan.**
  - In `alle-types.test.ts` en in de invarianten:
    - `maat.in` is `(breedte/2, hoogte)` en `maat.uit` is `(breedte/2, 0)`;
    - `raakt(s, s.maat.in)` en `raakt(s, s.maat.uit)` gelden voor elk type en elke variant.
  - Een nieuwe test: voor elk symbool staat elke `<text>` rechtop. Er is dus geen `transform` op of rond een text-element, en de fragmenten bevatten nergens `scale(`.
- [ ] **Step 2: Draai `pnpm vitest run packages/symbols`.** Verwacht: FAIL.
- [ ] **Step 3: Spiegel de symbolen.**
- [ ] **Step 4: Draai `pnpm vitest run packages/symbols -u` en daarna zonder `-u`.** Verwacht: PASS. Bekijk elke gewijzigde snapshot: de geleider loopt onderaan binnen en bovenaan buiten.
- [ ] **Step 5: Commit:** `feat(symbols): symbolen groeien naar boven`

---

### Task 2: Layout naar boven

**Files:**
- Modify: `packages/layout/src/kolommen.ts`, `packages/layout/src/types.ts` (doc-comments)
- Modify: `packages/layout/test/*.test.ts`, `packages/render/test/*` (snapshots), `docs/superpowers/plans/2026-10-17-elentrik-symbolen-layout.md` (ontwerpbeslissing 3: "naar boven")

**Interfaces:**
- Produces:
  - `maakStrook` plaatst de root `aansluiting` onderaan, met y de grootste waarde.
  - Elk kind staat boven zijn ouder.
  - Een rail ligt boven de vertakkende node, en de kinderen staan erboven.
  - Kringlabels staan tussen de rail en de beveiliging.
  - De verbindingen lopen van `uit` van de ouder (boven) naar `in` van het kind (onder).
  - `kolomGrenzen`, `kringGrenzen`, de paginering en `render` veranderen inhoudelijk niet.

**Aanpak:**
- Bouw de opmaak eerst zoals nu op in "afstand vanaf de voeding" (`d`).
- Zet daarna elke y om naar `y = hoogte − d`:
  - voor symbolen: de top komt op `hoogte − (d + h)`;
  - voor tekst: de basislijn wordt `hoogte − d_basislijn + grootte × 0.7`.
- Gebruik `maat.in` en `maat.uit` van de omgekeerde symbolen uit Task 1.

- [ ] **Step 1: Pas de tests aan.**
  - In `kolommen.test.ts`:
    - de root heeft de grootste y;
    - de y van elk kind is kleiner dan de y van zijn ouder;
    - elke verbinding begint exact op `uit` van de ouder en eindigt op `in` van het kind, in absolute coördinaten;
    - de rail-y ligt tussen de bovenkant van het bord en de onderkant van de kinderen.
  - In `labels.test.ts`: de y van het kringlabel ligt tussen de rail-y en de onderkant van het symbool van de beveiliging.
  - De bestaande invarianten blijven ongewijzigd:
    - paginering;
    - "elk element precies één keer";
    - botsingen;
    - geen lege pagina's.
- [ ] **Step 2: Draai `pnpm vitest run packages/layout`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** de omkering.
- [ ] **Step 4: Draai `pnpm test -u` en daarna `pnpm test && pnpm typecheck && pnpm voorbeeld`.** Verwacht: PASS, en in `out/` staan schema's die naar boven groeien.
- [ ] **Step 5: Commit:** `feat(layout): eendraadschema groeit naar boven`

---

### Task 3: Aanknopingspunten en vakken in de layout

**Files:**
- Create: `packages/layout/src/aanknopingen.ts`
- Modify: `packages/layout/src/types.ts`, `packages/layout/src/kolommen.ts`, `packages/layout/src/index.ts`
- Test: `packages/layout/test/aanknopingen.test.ts`

**Interfaces:**
- Produces:
  - `type Vak = { x: number; y: number; breedte: number; hoogte: number }`
  - `type Aanknoping = { soort: "kring-einde"; nodeId: NodeId; x: number; y: number } | { soort: "rail-einde"; nodeId: NodeId; x: number; y: number }`
  - `Strook` krijgt twee velden:
    - `vakken: Record<NodeId, Vak>`: het vak van elk getekend symbool, in strookcoördinaten;
    - `aanknopingen: Aanknoping[]`, in pre-order.

**Regels:**
- **`kring-einde`:**
  - Geldt voor elke node zonder kinderen, met als type een punt, een leiding, `automaat` of `zekering`.
  - Positie: `x = cx`, `y = vak.y − 5`, dus 5 mm boven de bovenkant van het vak.
- **`rail-einde`:**
  - Geldt voor elk `verdeelbord`, en voor elk `differentieel` waarvan de ouder een `verdeelbord` of een `differentieel` is.
  - Positie: `x` is de cx van het laatste kind plus `KOLOM_BREEDTE_MM / 2`, of `cx + KOLOM_BREEDTE_MM / 2` zonder kinderen. `y` is de rail-y, of de bovenkant van het vak zonder kinderen.
- **Strook:** de aanknopingen moeten binnen de strook liggen. Verbreed de strook als dat nodig is.

- [ ] **Step 1: Schrijf de falende tests.**
  - Startdocument (aansluiting → teller → differentieel 300 → verdeelbord):
    - precies één `rail-einde` op het verdeelbord;
    - geen `kring-einde`;
    - het differentieel 300 heeft geen `rail-einde`, want zijn ouder is de teller.
  - Bord met 2 kringen, elk een automaat, een leiding en 3 contactdozen: 2 `kring-einde` op de bovenste contactdozen en 1 `rail-einde` op het bord.
  - Een kring waarin een contactdoos splitst in 2 kinderen: 2 `kring-einde`.
  - Een differentieel van 30 mA onder het bord, met 1 kring: een `rail-einde` op dat differentieel.
  - Voor elk getekend symbool geldt `vakken[id]` gelijk aan `{x, y, breedte, hoogte}` van zijn symboolelement.
  - Alle aanknopingen liggen binnen `[0, breedte] × [0, hoogte]`.
- [ ] **Step 2: Draai `pnpm vitest run packages/layout/test/aanknopingen.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** de regels en exporteer de types.
- [ ] **Step 4: Draai `pnpm vitest run packages/layout`.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(layout): aanknopingspunten en vakken`

---

### Task 4: Nieuwe modeloperaties

**Files:**
- Create: `packages/model/src/project.ts`
- Modify: `packages/model/src/operaties.ts` (`verwijderEnkel`), `packages/model/src/index.ts`
- Test: `packages/model/test/project.test.ts`, `packages/model/test/operaties.test.ts`

**Interfaces:**
- Consumes: de helpers uit `operaties.ts` (`resultaat`, `vereis`, `controleerType`, `controleerIndex`), `TOEGELATEN_KINDEREN` en `AfwijkingSchema`.
- Produces:
  - **`verwijderEnkel(doc, nodeId): OperatieResultaat`.** Verwijdert alleen de node. Zijn kinderen komen, in dezelfde volgorde, op zijn plaats in de `kinderen` van de ouder.
    - De root geeft `ROOT_NIET_WIJZIGBAAR`.
    - Een `teller` geeft `ROOT_NIET_WIJZIGBAAR`, met `details: { reden: "teller" }`.
    - Mag een kind niet onder de ouder, dan gooit de functie `NIET_TOEGELATEN_KIND` en verandert er niets.
    - Plaatsingen en afwijkingen van de node zelf worden opgeruimd.
  - **`voegAfwijkingToe(doc, afwijking: Afwijking): OperatieResultaat`.** Valideert met `AfwijkingSchema` (motivatie minstens 10 tekens) en geeft anders `ONGELDIG_SCHEMA`. Een onbekende node geeft `ONBEKENDE_NODE`. Een bestaande afwijking met dezelfde `regelId` en `nodeId` wordt vervangen.
  - **`verwijderAfwijking(doc, regelId: string, nodeId: NodeId): OperatieResultaat`.** Bestaat de afwijking niet, dan volgt een no-op met lege patches.
  - **`wijzigProject(doc, wijziging: { klantNaam?: string; stroomtype?: Stroomtype }): OperatieResultaat`.** Zet `meta.klant.naam` en/of `voeding.stroomtype`. Een ongeldig stroomtype geeft `ONGELDIG_SCHEMA`.

- [ ] **Step 1: Schrijf de falende tests.**
  - `verwijderEnkel`, een middelste contactdoos in een keten van 3 (Review Focus 1):
    - de ketting is daarna `leiding → cd1 → cd3`;
    - `valideerStructuur` geeft `[]`;
    - undo via `inversePatches` herstelt het origineel.
  - `verwijderEnkel` op een automaat onder een verdeelbord: de leiding komt onder het bord, want dat is toegelaten.
  - `verwijderEnkel` op een `verdeelbord` waarvan de kinderen automaten zijn, onder een leiding: die automaten mogen niet onder een leiding, dus de functie gooit `NIET_TOEGELATEN_KIND` en het document blijft ongewijzigd.
  - `verwijderEnkel` op de teller geeft `ROOT_NIET_WIJZIGBAAR`.
  - De afwijkingen:
    - toevoegen, vervangen en verwijderen werken;
    - een motivatie van 9 tekens gooit `ONGELDIG_SCHEMA`.
  - `wijzigProject({ stroomtype: "3N400V" })` verandert alleen `voeding.stroomtype`.
- [ ] **Step 2: Draai `pnpm vitest run packages/model`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai `pnpm vitest run packages/model`.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(model): enkel verwijderen, afwijkingen en projectgegevens`

---

### Task 5: Standaardwaarden, startdocument, sjablonen en toevoegregels

**Files:**
- Create: `packages/model/src/standaarden.ts`, `packages/model/src/toevoegen.ts`
- Modify: `packages/model/src/index.ts`
- Test: `packages/model/test/toevoegen.test.ts`, `packages/arei/test/sjablonen-arei.test.ts`

**Interfaces:**
- Produces in `@elentrik/model`:
  - `type Onderdeel = "contactdoos" | "lichtpunt" | "schakelaar" | "toestel" | "leiding" | "differentieel" | "zekering" | "onderbord"`
  - **`STANDAARD: { [O in Onderdeel]: NodeInvoer }`.** De onderbord-standaard is een `verdeelbord` zonder naam. Waarden uit de spec §4.3:
    - contactdoos: `aantal 1`, `randaarde true`, `kinderbeveiliging true`, `waterdicht false`;
    - lichtpunt: `aantal 1`;
    - schakelaar: `soort "enkel"`, `waterdicht false`;
    - toestel: `soort "andere"`;
    - leiding: `XVB`, 3 geleiders, 2,5 mm²;
    - differentieel: 30 mA, 40 A, 2 polen, klasse A;
    - zekering: 16 A.
  - `NIEUWE_KRING_AUTOMAAT`: automaat 16 A, curve B, 2 polen.
  - **`nieuwProjectDocument(opties: { klantNaam: string; stroomtype: Stroomtype; datum?: string }): InstallatieDocument`.** Dat is `nieuwDocument` plus, onder de teller, een differentieel van 300 mA, 40 A, klasse A, met 4 polen bij `3N400V` en anders 2. Daaronder komt een `verdeelbord`.
  - **`SJABLONEN: readonly Sjabloon[]`.** Precies de 5 sjablonen uit de spec §4.7.1, met de ids `kring-stopcontacten`, `kring-verlichting`, `kookplaat`, `wasmachine` en `badkamer`. `sjabloonVoor(id, stroomtype)` geeft bij `3N400V` de variant van de kookplaat met 4 polen en 5 geleiders.
  - **`magToevoegen(doc, aanknoping: { soort: "kring-einde" | "rail-einde"; nodeId: NodeId }, onderdeel: Onderdeel, toestelsoort?: Toestelsoort): boolean`**
  - **`voegOnderdeelToe(doc, aanknoping, onderdeel, toestelsoort?): OperatieResultaat & { ids: NodeId[] }`.** De regels uit de spec §4.3:
    - **op een kring-einde:**
      - een punt of een leiding: één kind van de node;
      - een onderbord: een leiding plus een verdeelbord als de node geen leiding is, anders alleen een verdeelbord;
      - een differentieel of een zekering: `magToevoegen` geeft `false`.
    - **op een rail-einde:**
      - een differentieel: één differentieel;
      - een zekering: een zekering plus een leiding;
      - elk ander onderdeel: `NIEUWE_KRING_AUTOMAAT` plus een leiding.
    - Altijd in één `produceWithPatches`. Daarvoor bestaat `pasSjabloonToe`: bouw een `Sjabloon` en pas het toe.
    - `ids` geeft de nieuwe node-ids, van onder naar boven.
  - **`voegSjabloonToe(doc, bordOfDifferentieelId, sjabloonId): OperatieResultaat & { id: NodeId }`**

- [ ] **Step 1: Schrijf de falende tests.**
  - `nieuwProjectDocument`:
    - bij `2x230V`: de keten aansluiting → teller → differentieel 300 mA (2 polen) → verdeelbord, en `valideerStructuur` geeft `[]`;
    - bij `3N400V`: het differentieel heeft 4 polen.
  - Het rail-einde van een nieuw project met Contactdoos geselecteerd: een automaat 16 A B en een leiding XVB 3G2,5. `ids.length === 2` en één undo-stap herstelt het origineel.
  - Rail-einde met Differentieel: 1 node van 30 mA.
  - Rail-einde met Zekering: een zekering en een leiding.
  - Kring-einde op een leiding met Contactdoos: een contactdoos.
  - Kring-einde op een contactdoos met Onderbord: een leiding en een verdeelbord.
  - Kring-einde met Differentieel: `magToevoegen` geeft `false`, en `voegOnderdeelToe` gooit `NIET_TOEGELATEN_KIND`.
  - **`packages/arei/test/sjablonen-arei.test.ts`:** elk sjabloon, toegepast op een `nieuwProjectDocument`, geeft 0 bevindingen van ernst `fout` of `waarschuwing` met regelset `arei-2020@1`. De kookplaat wordt getest bij `2x230V` en bij `3N400V`.
- [ ] **Step 2: Draai `pnpm vitest run packages/model packages/arei`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de tests opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(model): standaardwaarden, startdocument, sjablonen en toevoegregels`

---

### Task 6: Nuxt-app, database en infrastructuur

**Files:**
- Create:
  - `apps/web/{package.json, nuxt.config.ts, tsconfig.json, app/app.vue, app/app.config.ts, app/assets/css/main.css, i18n/locales/nl.json}`
  - `apps/web/server/db/{schema.ts, index.ts}`, `apps/web/drizzle.config.ts`, `apps/web/server/db/migraties/` (gegenereerd)
  - `apps/web/vitest.config.ts`, `apps/web/test/db.ts` (PGlite-hulp)
  - `infra/docker-compose.yml`, `apps/web/.env.example`
- Modify: `.gitignore` (+ `.superpowers/`, `apps/web/.nuxt`, `apps/web/.output`, `.env`), `vitest.config.ts` in de root (project `apps/web`), `package.json` in de root (scripts `dev`, `db:up`, `db:migrate`)
- Test: `apps/web/test/db.test.ts`

**Interfaces:**
- Produces:
  - **Tabel `projecten`** in `server/db/schema.ts`, met de kolommen uit de spec §4.6:

    | Kolom | Type |
    |---|---|
    | `id` | uuid pk default random |
    | `naam` | text not null |
    | `klantnaam` | text not null default '' |
    | `document` | jsonb not null |
    | `versie` | integer not null default 1 |
    | `aangemaakt` | timestamptz not null default now |
    | `gewijzigd` | timestamptz not null default now |
    | `verwijderd` | timestamptz null |

  - **`type Db`**, het Drizzle-databasetype. **`gebruikDb(): Db`** leest `DATABASE_URL` via de runtimeConfig. **`zetDb(db: Db): void`** is alleen voor tests.
  - **`maakTestDb(): Promise<Db>`** in `apps/web/test/db.ts`: PGlite in het geheugen, met de migraties uit `server/db/migraties` toegepast.
  - **Nuxt-config:**
    - de modules `@nuxt/ui`, `@pinia/nuxt` en `@nuxtjs/i18n` (alleen `nl`, `strategy: "no_prefix"`);
    - `devServer.host = "127.0.0.1"`;
    - de workspacepakketten onder `build.transpile`, als dat nodig is.
  - **`infra/docker-compose.yml`:** `postgres:16`, met de poort gebonden aan `127.0.0.1:5432`, een volume, en de database `elentrik`.
  - **Scripts in de root:**
    - `pnpm db:up`: `docker compose -f infra/docker-compose.yml up -d`;
    - `pnpm db:migrate`: drizzle-kit migrate;
    - `pnpm dev`: start de Nuxt-dev-server van `apps/web`.

- [ ] **Step 1: Schrijf de falende test.** `db.test.ts`: `maakTestDb()` geeft een database waarin je een rij in `projecten` kunt invoegen en teruglezen, met een jsonb-document en `versie` 1.
- [ ] **Step 2: Draai `pnpm vitest run apps/web/test/db.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
  - Maak de app aan met de bovenstaande modules.
  - Schrijf het Drizzle-schema en genereer de eerste migratie (`drizzle-kit generate`).
  - Voeg de PGlite-hulp en de compose-file toe.
  - `app.vue` toont voorlopig een `UApp` met `<NuxtPage/>`.
- [ ] **Step 4: Draai de verificatie.**
  - `pnpm vitest run apps/web` → PASS.
  - `pnpm typecheck` → schoon. Voeg aan `apps/web` een script `typecheck` toe met `nuxt typecheck`.
  - `pnpm --filter @elentrik/web build` → slaagt.
- [ ] **Step 5: Commit:** `feat(web): nuxt-app met nuxt ui, database en lokale infrastructuur`

---

### Task 7: API voor projecten

**Files:**
- Create: `apps/web/server/projecten/repo.ts`, `apps/web/server/api/projecten/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].put.ts`, `[id].delete.ts`, `[id]/dupliceer.post.ts`
- Test: `apps/web/test/projecten-repo.test.ts`

**Interfaces:**
- Consumes: `Db`, `gebruikDb`, `nieuwProjectDocument`, `parseDocument`, `valideerStructuur` en `nieuwId`.
- Produces (`repo.ts`, alles met `db` als eerste parameter):
  - `lijstProjecten(db): Promise<{ id; naam; klantnaam; gewijzigd: string }[]>`, met verwijderde projecten uitgesloten en `gewijzigd` aflopend gesorteerd.
  - `maakProject(db, invoer: { naam: string; klantnaam: string; stroomtype: Stroomtype }): Promise<{ id: string; versie: number }>`.
  - `haalProject(db, id): Promise<{ id; naam; klantnaam; document: InstallatieDocument; versie: number; gewijzigd: string } | null>`.
  - `bewaarProject(db, id, versie: number, invoer: { naam?: string; document: unknown }): Promise<{ versie: number }>`.
    - Gooit `ProjectFout("NIET_GEVONDEN" | "CONFLICT" | "ONGELDIG", details?)`.
    - De versie wordt atomair gecontroleerd en verhoogd: `UPDATE … WHERE id = $1 AND versie = $2 RETURNING versie`.
    - Bij `ONGELDIG` zitten de Zod-issues of de structuurproblemen in de details.
    - `klantnaam` wordt uit `document.meta.klant.naam` gekopieerd, en `gewijzigd` wordt `now()`.
  - `dupliceerProject(db, id): Promise<{ id: string }>`: een nieuwe rij-id, een nieuwe `document.id` en de naam `${naam} (kopie)`.
  - `verwijderProject(db, id): Promise<void>`: zet `verwijderd = now()`.
  - De API-routes vertalen `ProjectFout`:
    - `NIET_GEVONDEN` → 404;
    - `CONFLICT` → 409, met `{ versie: <huidige> }`;
    - `ONGELDIG` → 422, met details.
  - `PUT` leest `If-Match`. Ontbreekt die of is ze geen geheel getal, dan volgt 428.

- [ ] **Step 1: Schrijf de falende tests**, op `maakTestDb()`:
  - Maken, lijsten en ophalen werken. Het document is een `nieuwProjectDocument`.
  - Bewaren met de juiste versie geeft versie 2. Daarna nog eens bewaren met versie 1 geeft `CONFLICT`, met de huidige versie 2 (Review Focus 2).
  - Bewaren van een document met een onbekend node-type geeft `ONGELDIG`.
  - Bewaren van een document met een cyclus geeft `ONGELDIG`, met een `CYCLUS`-probleem.
  - De klantnaam wordt overgenomen uit het document.
  - Dupliceren geeft een andere `document.id` en "(kopie)" in de naam.
  - Een verwijderd project staat niet meer in de lijst, en `haalProject` geeft `null`.
- [ ] **Step 2: Draai `pnpm vitest run apps/web/test/projecten-repo.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** de repo en de dunne API-handlers.
- [ ] **Step 4: Draai de tests opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(web): api voor projecten met versiecontrole`

---

### Task 8: Projectenlijst

**Files:**
- Create: `apps/web/app/pages/index.vue`, `apps/web/app/components/NieuwProjectDialoog.vue`, `apps/web/app/composables/useProjectenApi.ts`
- Modify: `apps/web/i18n/locales/nl.json`
- Test: `apps/web/e2e/projecten.spec.ts` (Playwright), `apps/web/playwright.config.ts`

**Interfaces:**
- Produces:
  - `useProjectenApi()` geeft `{ lijst, maak, haal, bewaar, dupliceer, verwijder }`, getypt naar de API uit Task 7, via `$fetch`.
    - `bewaar(id, versie, invoer)` gooit bij een 409 een `ConflictFout` met `huidigeVersie`.
  - **Pagina `/`:**
    - een `UTable` met de kolommen naam, klant en gewijzigd (relatief, bv. "2 min geleden");
    - per rij de acties Openen (naar `/projecten/{id}`), Dupliceren en Verwijderen, met een `UModal`-bevestiging;
    - een knop "Nieuw project" die een `UModal` opent met naam (verplicht), klant en stroomtype (`USelect`, standaard `2x230V`).
- **Playwright-config:**
  - start `pnpm --filter @elentrik/web dev` met `DATABASE_URL` naar de Docker-Postgres;
  - `baseURL` is `http://127.0.0.1:3000`.

- [ ] **Step 1: Schrijf de falende E2E-test.**
  - Maak een nieuw project "Test Janssens" met klant `<img src=x onerror=alert(1)>` (Review Focus 4).
  - Verwacht: het staat in de lijst, en de klantnaam staat letterlijk als tekst in de cel; er is geen `img`-element in de tabel.
  - Dupliceer het project: verwacht "Test Janssens (kopie)".
  - Verwijder de kopie: verwacht dat ze uit de lijst verdwijnt.
- [ ] **Step 2: Draai `pnpm db:up && pnpm db:migrate && pnpm --filter @elentrik/web exec playwright test e2e/projecten.spec.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(web): projectenlijst`

---

### Task 9: Editor-store met undo/redo en afgeleide gegevens

**Files:**
- Create: `apps/web/app/stores/editor.ts`
- Test: `apps/web/test/editor-store.test.ts`, `apps/web/test/editor-prestatie.test.ts`

**Interfaces:**
- Consumes: de operaties uit model (Tasks 4–5), `analyseer`, `controleer`, `haalRegelset`, `opmaak` en `schemaStripSvg`.
- Produces: `useEditorStore` (Pinia setup-store).
  - **State:**
    - `document: InstallatieDocument | null` als shallowRef, met `projectId`, `naam` en `versie`;
    - `selectie: NodeId[]`, met de laatst geklikte achteraan;
    - `onderdeel: Onderdeel` (standaard `"contactdoos"`) en `toestelsoort: Toestelsoort` (standaard `"wasmachine"`);
    - `terug` en `vooruit`, stapels van `{ patches; inversePatches; groep?: string }`;
    - `gewijzigdSindsOpslaan: number`, een teller.
  - **Afgeleid (computed):**
    - `analyse`;
    - `bevindingen`: `controleer(document, haalRegelset(document.regelset))`;
    - `opmaak`: `opmaak(document, STANDAARD_PAPIER_A4, analyse)`;
    - `svg`: `schemaStripSvg(opmaak)`;
    - `aantalFouten` en `aantalWaarschuwingen`: niet afgeweken.
  - **Acties:**
    - `laad(project)`;
    - `pasToe(resultaat: OperatieResultaat, groep?: string)`:
      - zet het nieuwe document en leegt `vooruit`;
      - is `groep` gelijk aan de `groep` van de laatste stap, dan komen de patches erbij in die stap (inverse vooraan), en anders volgt een nieuwe stap;
      - bewaart maximaal 200 stappen;
    - `sluitGroep()`: de volgende `pasToe` begint altijd een nieuwe stap;
    - `ongedaanMaken()` en `opnieuw()`;
    - `voegToe(aanknoping)`: met `onderdeel` en `toestelsoort`. Selecteert daarna de bovenste nieuwe node.
    - `voegSjabloonToe(sjabloonId)`: het doel is het geselecteerde bord of differentieel, anders het eerste verdeelbord in pre-order.
    - `wijzigVeld(nodeIds: NodeId[], sleutel: string, waarde: unknown)`: één `pasToe` per node, met groep `veld:${sleutel}:${nodeIds.join(",")}`.
    - `voegToeBijSelectie()`, voor Enter:
      - neem de eerste geselecteerde node;
      - is dat een `verdeelbord`, of een `differentieel` met een `rail-einde`, gebruik dan die rail;
      - zo niet, volg de eerste kinderen tot een blad en gebruik zijn `kring-einde`;
      - is er geen aanknoping of geldt `magToevoegen` niet, dan gebeurt er niets.
    - `verwijderSelectie(heleTak: boolean)`:
      - gebruikt `verwijderEnkel` of `verwijder`, in één stap;
      - weigert altijd nodes van type `aansluiting` of `teller`, met `DocumentFout("ROOT_NIET_WIJZIGBAAR")`, ook bij `heleTak` (spec §4.7.2);
      - gooit een `DocumentFout` door voor de UI.
    - `zetAfwijking(regelId, nodeId, motivatie)` en `wisAfwijking(regelId, nodeId)`;
    - `wijzigProjectgegevens({ naam?, klantNaam?, stroomtype? })`: de naam valt buiten undo, de rest gaat via `wijzigProject`.

- [ ] **Step 1: Schrijf de falende tests**, met Pinia standalone (`createPinia`, `setActivePinia`):
  - Na `voegToe` op het rail-einde staat er 1 stap op `terug`. `ongedaanMaken()` geeft het originele document terug, en `opnieuw()` het nieuwe.
  - `wijzigVeld` 3× op hetzelfde veld, zonder `sluitGroep`, telt als 1 stap. Na `sluitGroep` begint er een nieuwe stap.
  - Bij 201 stappen blijft `terug.length` 200.
  - `aantalFouten` stijgt na het toevoegen van een 9e contactdoos in één kring.
  - `verwijderSelectie(false)` op een middelste punt houdt de keten verbonden.
  - `verwijderSelectie(true)` met de teller geselecteerd gooit `ROOT_NIET_WIJZIGBAAR`, en het document blijft ongewijzigd.
  - `voegToeBijSelectie()` met een geselecteerde leiding van een kring met 2 contactdozen voegt het onderdeel toe bovenaan die keten.
  - `voegSjabloonToe("badkamer")` zonder selectie komt op het eerste verdeelbord.
  - **`editor-prestatie.test.ts`** (Review Focus 5):
    - een document met 2.000 nodes, gebouwd via raw nodes;
    - meet na 5 opwarmrondes 20× `voegToe` en het uitlezen van `svg`;
    - verwacht een mediaan onder 100 ms.
- [ ] **Step 2: Draai `pnpm vitest run apps/web/test/editor-store.test.ts apps/web/test/editor-prestatie.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de tests opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(web): editor-store met undo/redo en afgeleide gegevens`

---

### Task 10: Automatisch opslaan, lokaal concept en conflicten

**Files:**
- Create: `apps/web/app/composables/useAutosave.ts`, `apps/web/app/composables/concepten.ts`
- Test: `apps/web/test/autosave.test.ts` (fake timers, `fake-indexeddb/auto`, een nagemaakte `bewaar`)

**Interfaces:**
- Consumes: `useEditorStore` en `useProjectenApi().bewaar`.
- Produces:
  - `concepten.ts`, via idb-keyval:
    - `bewaarConcept(projectId, { document, versie, naam, tijd: number })`;
    - `haalConcept(projectId)`;
    - `wisConcept(projectId)`.
  - `useAutosave(opties: { bewaar, vertragingMs?: number }): { status: Ref<"opgeslagen" | "bezig" | "lokaal" | "conflict">; conflict: Ref<{ huidigeVersie: number } | null>; nuOpslaan(): Promise<void>; laadServerversie(): Promise<void>; bewaarAlsKopie(): Promise<void> }`:
    - **Bij een wijziging:** het concept wordt meteen bewaard, en 2.000 ms na de laatste wijziging volgt `bewaar`.
    - **Opslaan lukt:** versie bijwerken, het concept wissen en de status op `opgeslagen` zetten.
    - **Opslaan mislukt door het netwerk:** de status wordt `lokaal`, met een nieuwe poging na 10 s.
    - **409:** de status wordt `conflict`. Er wordt **niets** overschreven.
      - `laadServerversie` haalt de serverversie op, laadt die in de store en wist het concept.
      - `bewaarAlsKopie` dupliceert via de API, met het lokale document als inhoud, en navigeert naar de kopie.
  - `nieuwerConcept(project): Promise<Concept | null>` geeft het concept terug als `concept.tijd` later valt dan `project.gewijzigd`.

- [ ] **Step 1: Schrijf de falende tests.**
  - Na 3 snelle wijzigingen gebeurt er precies 1 `bewaar`-aanroep, na 2.000 ms.
  - Na een wijziging staat er meteen een concept, en na het opslaan is het concept weg.
  - Een 409 zet de status op `conflict`, en daarna volgt geen tweede `bewaar` (Review Focus 2).
  - `nieuwerConcept` geeft een concept terug als het nieuwer is, en `null` als het ouder is (Review Focus 3).
  - Een netwerkfout geeft de status `lokaal`, en na 10 s volgt een nieuwe poging.
- [ ] **Step 2: Draai `pnpm vitest run apps/web/test/autosave.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(web): automatisch opslaan met lokaal concept en conflictafhandeling`

---

### Task 11: Canvas met overlay, zoom en sneltoetsen

**Files:**
- Create: `apps/web/app/components/editor/SchemaCanvas.vue`, `apps/web/app/composables/sneltoetsen.ts`
- Test: `apps/web/test/sneltoetsen.test.ts`

**Interfaces:**
- Consumes: `useEditorStore` (`svg`, `opmaak.strook.vakken`, `opmaak.strook.aanknopingen`, `bevindingen`, `selectie`) en `magToevoegen`.
- Produces:
  - **`SchemaCanvas`:**
    - toont `svg` via `v-html`. Dat is veilig, want `render` escapet alle documenttekst;
    - heeft een witte "papier"-achtergrond;
    - legt er een SVG-overlay over met dezelfde `viewBox`;
  - **De overlay toont:**
    - een selectiekader rond `vakken[id]` voor elke geselecteerde node;
    - een markering (cirkel r = 1,5 mm rechtsboven het vak) in de kleur van de ernst, en grijs als de bevinding afgeweken is;
    - een **+**-knop voor elke aanknoping waarvoor `magToevoegen(doc, a, onderdeel, toestelsoort)` waar is. Een klik roept `voegToe(a)` aan.
  - **Interactie:**
    - Klikken op een symbool (via `data-node-id`) selecteert het, en Shift+klik zet het aan of uit in de selectie. Klikken op een lege plek wist de selectie.
    - Het muiswiel zoomt rond de cursor, tussen 25 % en 400 %.
    - Pannen gaat door te slepen op een lege plek, of met de spatie ingedrukt en slepen.
    - De knop "Passend maken" past de zoom aan het venster aan.
  - **`sneltoets(event: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; doelIsInvoer: boolean }): Actie | null`**, een pure functie.
    - `Actie` is een union:
      - `{ soort: "kies"; onderdeel }`;
      - `{ soort: "toevoegen" }`;
      - `{ soort: "verwijder"; heleTak: boolean }`;
      - `{ soort: "ongedaan" }` en `{ soort: "opnieuw" }`;
      - `{ soort: "navigeer"; richting: "op" | "neer" | "links" | "rechts" }`;
      - `{ soort: "wisSelectie" }`.
    - Toetsen voor onderdelen: C contactdoos, L lichtpunt, S schakelaar, T toestel, D differentieel, Z zekering, B onderbord.
    - Andere toetsen: `Enter` → toevoegen, `Delete`/`Backspace` → verwijder (Shift → hele tak), Ctrl/Meta+Z → ongedaan, Ctrl/Meta+Y of Ctrl/Meta+Shift+Z → opnieuw, pijltjes → navigeer, Escape → wisSelectie.
    - Is `doelIsInvoer` waar, dan volgt alleen voor Ctrl+Z/Y een actie, en anders `null`.
  - **Navigatie in de store:** `navigeer(richting)`:
    - op en neer volgen kind en ouder in dezelfde keten;
    - links en rechts gaan naar de beveiliging van de vorige of volgende kring in `analyse.kringen`.

- [ ] **Step 1: Schrijf de falende tests**, in `sneltoetsen.test.ts`: een tabel met alle toetsen hierboven. In een invoerveld geeft "c" `null`, en Ctrl+Z geeft `ongedaan`.
- [ ] **Step 2: Draai `pnpm vitest run apps/web/test/sneltoetsen.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** `sneltoetsen.ts`, `SchemaCanvas.vue` en `navigeer`. De store-test van `navigeer` komt in `editor-store.test.ts`: op, neer, links en rechts in een installatie met 3 kringen.
- [ ] **Step 4: Draai `pnpm vitest run apps/web`.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(web): schemacanvas met overlay, zoom en sneltoetsen`

---

### Task 12: Panelen, bovenbalk en editorpagina

**Files:**
- Create:
  - `apps/web/app/pages/projecten/[id].vue`
  - `apps/web/app/components/editor/{OnderdelenPaneel,EigenschappenPaneel,BevindingenPaneel,AfwijkingDialoog,EditorBovenbalk,ProjectgegevensDialoog,ConceptDialoog,ConflictDialoog}.vue`
  - `apps/web/app/editor/velden.ts`
- Modify: `apps/web/i18n/locales/nl.json`
- Test: `apps/web/test/velden.test.ts`

**Interfaces:**
- Produces:
  - **`type Veld = { sleutel: string; label: string; soort: "getal" | "tekst" | "keuze" | "schakelaar"; eenheid?: string; opties?: { waarde: string | number; label: string }[]; min?: number; stap?: number; optioneel?: boolean }`**
  - **`VELDEN: Record<NodeType, Veld[]>`**, plus `GEMEENSCHAPPELIJK: Veld[]` (`label` en `ruimte`):
    - Nederlandse labels, bv. `nominaal_A` → "Nominale stroom", eenheid "A"; `doorsnede_mm2` → "Doorsnede", "mm²"; `gevoeligheid_mA` → "Gevoeligheid", "mA";
    - de keuzeopties komen uit de Zod-enums van het model.
  - **Editorpagina `/projecten/[id]`:**
    - laadt het project via de API en vult de store;
    - vraagt via `ConceptDialoog` of een nieuwer concept geladen moet worden;
    - start `useAutosave`;
    - bindt de sneltoetsen op `window`.
  - **Indeling (variant A):**
    - **Bovenbalk:**
      - de projectnaam als knop, die `ProjectgegevensDialoog` opent met naam, klant en stroomtype;
      - de tabbladen Eendraadschema (actief), Situatieschema en Kringenlijst (uitgeschakeld, met tooltip "Binnenkort");
      - de opslagstatus;
      - de teller met fouten en waarschuwingen, die naar het paneel Bevindingen scrollt;
      - de knoppen Ongedaan maken en Opnieuw, uitgeschakeld als de stapel leeg is.
    - **Links:** `OnderdelenPaneel`:
      - de lijst onderdelen met sneltoets, en de actieve gemarkeerd;
      - bij Toestel een `USelect` voor de soort;
      - het blok Sjablonen, met de 5 sjablonen als knoppen.
    - **Midden:** `SchemaCanvas`.
    - **Rechts:**
      - **`EigenschappenPaneel`:**
        - bij één selectie: puntlabel en type als titel, en de velden uit `GEMEENSCHAPPELIJK` en `VELDEN[type]`;
        - bij meerdere nodes van hetzelfde type: de gemeenschappelijke velden, met "—" als de waarden verschillen;
        - bij gemengde types: "N onderdelen geselecteerd";
        - een wijziging roept `wijzigVeld` aan, en blur roept `sluitGroep` aan.
      - **`BevindingenPaneel`:**
        - gegroepeerd per ernst, met de tekst via `formatteerBericht(b, "nl")`;
        - een klik selecteert het onderwerp;
        - per bevinding "Afwijking motiveren" via `AfwijkingDialoog`, met een verplichte motivatie van minstens 10 tekens (de knop is uitgeschakeld zolang dat niet zo is), of "Afwijking verwijderen".
  - **Fouten:** een `DocumentFout` uit de store wordt een `useToast`-melding. Bij `NIET_TOEGELATEN_KIND` na een verwijdering staat er de hint "Shift+Delete verwijdert de hele tak". Shift+Delete op 5 of meer nodes vraagt eerst een bevestiging.
  - `ConflictDialoog` toont de keuzes uit Task 10.

- [ ] **Step 1: Schrijf de falende test**, `velden.test.ts`. Voor elk variant van `NodeSchema` heeft elke sleutel behalve `id`, `type`, `parentId`, `kinderen`, `label` en `ruimte` precies één `Veld` in `VELDEN[type]` ("alles aanpasbaar"). Keuzevelden hebben precies de opties van hun Zod-enum.
- [ ] **Step 2: Draai `pnpm vitest run apps/web/test/velden.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** `velden.ts`, de panelen, de dialogen, de bovenbalk en de pagina.
- [ ] **Step 4: Draai `pnpm vitest run apps/web && pnpm typecheck`.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(web): editorpagina met panelen, bovenbalk en dialogen`

---

### Task 13: End-to-end-flow

**Files:**
- Create: `apps/web/e2e/editor.spec.ts`

**Interfaces:**
- Consumes: alles hierboven. Gebruik `data-testid`-attributen waar selectors anders breekbaar zijn, en voeg ze toe in de componenten.

- [ ] **Step 1: Schrijf de E2E-test.**
  1. Maak een nieuw project aan en open het. Verwacht: de rail heeft een +.
  2. Klik op de + van de rail. Verwacht: er zijn een automaat, een leiding en een + op het kring-einde.
  3. Druk `C` en klik 3× op de + van het kring-einde. Verwacht: het puntlabel "A3" staat in de SVG.
  4. Ctrl+Z. Verwacht: "A3" is weg en "A2" staat er nog.
  5. Selecteer de contactdoos A1 en druk Delete. Verwacht: er is nog één contactdoos, nu met label "A1", en de keten is verbonden (Review Focus 1).
  6. Zet het label van de leiding via het eigenschappenpaneel op `<img src=x onerror=alert(1)>`. Verwacht: er is geen `img`-element in het canvas (Review Focus 4).
  7. Wacht tot de status "Opgeslagen" is en herlaad de pagina. Verwacht: de toestand van stap 5 staat er nog.
- [ ] **Step 2: Draai `pnpm --filter @elentrik/web exec playwright test`.** Verwacht: PASS. Werkt een stap niet, dan is dat een bug in Task 8–12: los het daar op, met een regressietest.
- [ ] **Step 3: Draai alles:** `pnpm test && pnpm typecheck`. Verwacht: PASS.
- [ ] **Step 4: Commit:** `test(web): end-to-end flow van de editor`
