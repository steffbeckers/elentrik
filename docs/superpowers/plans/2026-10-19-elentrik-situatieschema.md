# Situatieschema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een tabblad "Situatieschema" in de editor waarmee de installateur plannen (PDF of afbeelding) oplaadt en de punten uit het eendraadschema erop plaatst, met live labels, undo en autosave.

**Architecture:**
- Pagina-operaties zijn pure functies in `@elentrik/model`.
- De SVG-laag met symbolen en labels is een pure functie in `@elentrik/render`, zodat de PDF-export ze later hergebruikt.
- Bestanden gaan via een kleine opslaginterface naar de lokale schijf, met een tabel `bestanden` in Postgres.
- In de browser rastert pdf.js een PDF-pagina naar PNG.
- De editor krijgt een tweede canvas (`PlanCanvas`) met dezelfde zoom/pan-logica, die uit `SchemaCanvas` gehaald wordt naar een gedeelde pure module.

**Tech Stack:** Nuxt 4, Nuxt UI 4, Pinia, Drizzle 0.45 met drizzle-kit 0.31, PostgreSQL 16 (PGlite in tests), Vitest, Playwright, `pdfjs-dist` (nieuw).

**Spec:** `docs/superpowers/specs/2026-10-19-elentrik-situatieschema-design.md`. Die bouwt voort op `docs/superpowers/specs/2026-10-18-elentrik-editor-design.md`.

## Global Constraints

- **Alleen lokaal:** geen authenticatie. De dev-server en Postgres luisteren alleen op `127.0.0.1`.
- **Eigen ontwikkeling:** geen code, symbolen of teksten van andere software. Testfixtures maken we zelf, via een script in de repo.
- **Commits:**
  - Conventional Commits;
  - ondertekend via 1Password, nooit met `--no-gpg-sign`;
  - elk bericht eindigt met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Werkplek:** hoofdcheckout `D:\steffbeckers\elentrik`, branch `situatieschema`, geen worktree.
- **Pakketten:** de pakketten blijven zonder I/O. Hun tests gebruiken `kloon` uit `test/hulp.ts` en `declare const performance`.
- **Ruling E1:** app-modules die in Vitest getest worden, gebruiken expliciete imports en geen Nuxt-auto-imports.
- **Vertaling:** UI-teksten staan in `apps/web/i18n/locales/nl.json`, nooit hardgecodeerd in componenten.
- **Limieten:**
  - `MAX_UPLOAD_BYTES = 50 * 1024 * 1024`;
  - `RASTER_DPI = 300`;
  - `MAX_RASTER_PX = 8000` (lange zijde);
  - symboolgrootte = lange zijde van het raster / `60`;
  - draaistap = `15`°;
  - pijltjes verschuiven `10` rasterpixels, met Shift `1`.
- **Bestandstypes:**
  - `plan-origineel` aanvaardt PDF, PNG en JPEG; `plan-raster` aanvaardt PNG en JPEG;
  - het type volgt uit de magic bytes, nooit uit de naam of een header;
  - SVG of HTML wordt altijd geweigerd.
- **Opslagsleutel:** `<projectId>/<bestandId>`. Een gebruikersnaam komt nooit in een pad.
- **Afhankelijkheid:** `pdfjs-dist`, als exacte versie die minstens twee weken oud is. De worker wordt lokaal gebundeld, zonder CDN.
- **Tests:**
  - `pnpm test` is `test:parallel && test:prestatie`, en prestatietests heten `*prestatie*.test.ts`;
  - draai voor een commit `pnpm test` en `pnpm typecheck`;
  - bij taken met UI ook `pnpm --filter @elentrik/web exec playwright test`, met Docker-Postgres via `pnpm db:up` en `pnpm db:migrate`.

## Review Focus

1. **Een plan dat niet laadt:** het bestand is weg of het id is onbekend (404). De pagina toont "Plan niet gevonden" met "Plan opnieuw kiezen", en de plaatsingen blijven bewaard. Test: Task 11, e2e "plan ontbreekt".
2. **Een geplaatst punt verwijderd in het eendraadschema:** de plaatsing verdwijnt mee. Undo herstelt punt en plaatsing samen. Test: Task 7, `situatie-store.test.ts`.
3. **Te groot of verkeerd bestand** (> 50 MB, SVG, of een PDF die eigenlijk een PNG is): er is een duidelijke melding, het document verandert niet, en er wordt niets verstuurd als de client het al kan weten. Tests: Task 3 (`controleerPlanbestand`) en Task 4 (server 413/415).
4. **Labels die verschuiven:** wordt een punt in het eendraadschema verwijderd, dan hernummert het label op het plan live. Test: Task 7, `situatieItems` met hernummering.
5. **Zoomen en pannen op een raster van 8.000 px:** het plan kan niet uit beeld verdwijnen, en "Passend maken" toont het volledige plan. Test: Task 6, `weergave.test.ts`.

---

### Task 1: Pagina-operaties in het model

**Files:**
- Modify: `packages/model/src/situatie.ts`, `packages/model/src/fouten.ts`, `packages/model/src/index.ts`
- Test: `packages/model/test/situatie.test.ts`, `packages/model/test/eigenschappen.test.ts`

**Interfaces:**
- Consumes: `resultaat`, `vereisPagina` and `DocumentFout` (existing in `situatie.ts`).
- Produces, exported from the index:
  - `hernoemPagina(doc, paginaId: string, titel: string): OperatieResultaat`
  - `verwijderPagina(doc, paginaId: string): OperatieResultaat`
  - `zetSchaal(doc, paginaId: string, mmPerPx: number | undefined): OperatieResultaat`
  - `verplaatsPagina(doc, paginaId: string, nieuweIndex: number): OperatieResultaat`
  - `FoutCode` gains `"GEEN_ACHTERGROND"`.

- [ ] **Step 1: Write the failing tests** in `situatie.test.ts`. Each test also checks that applying the inverse patches gives back the original document.
  - `hernoemPagina`:
    - trims the title: `"  Gelijkvloers "` becomes `"Gelijkvloers"`;
    - `"   "` throws `ONGELDIG_SCHEMA`;
    - an unknown page throws `ONBEKENDE_PAGINA`.
  - `verwijderPagina`:
    - removes the page and its placements;
    - the nodes stay in `doc.nodes`;
    - afterwards `valideerStructuur` returns `[]`.
  - `zetSchaal`:
    - `0.5` sets `achtergrond.schaal = { mmPerPx: 0.5 }`;
    - `undefined` removes `schaal`;
    - `0`, `-1`, `NaN` and `Infinity` throw `ONGELDIG_SCHEMA`;
    - a page without `achtergrond` throws `GEEN_ACHTERGROND`.
  - `verplaatsPagina`:
    - with pages `[a, b, c]`, moving `c` to `0` gives `[c, a, b]`;
    - index `3` and `-1` throw `ONGELDIGE_INDEX`;
    - moving to its own index returns `patches: []`.
- [ ] **Step 2: Extend the property test.** In `eigenschappen.test.ts`, the random operation sequence also uses `voegPaginaToe`, `hernoemPagina`, `verwijderPagina`, `verplaatsPagina` and `plaats` on an existing page. The invariant `valideerStructuur(doc) = []` still holds.
- [ ] **Step 3: Run** `pnpm vitest run packages/model/test/situatie.test.ts`. Expected: FAIL (the functions are not exported).
- [ ] **Step 4: Implement** the four operations in `situatie.ts`. Add the code to `FoutCode`. Export from `index.ts`.
- [ ] **Step 5: Run** the two test files. Expected: PASS. Then run `pnpm test` and `pnpm typecheck`.
- [ ] **Step 6: Commit** `feat(model): pagina's hernoemen, verwijderen, ordenen en schaal zetten`

### Task 2: SVG-laag voor het situatieschema in render

**Files:**
- Create: `packages/render/src/situatie-svg.ts`
- Modify: `packages/render/src/index.ts`
- Test: `packages/render/test/situatie-svg.test.ts`, `packages/render/test/situatie-prestatie.test.ts`

**Interfaces:**
- Consumes: `Symbool`, `escapeXml` and `getal` from `@elentrik/symbols`.
- Produces:
  - `type SituatieItem = { nodeId: string; symbool: Symbool; x: number; y: number; rotatie: number; label: string }`
  - `situatieLaagSvg(items: readonly SituatieItem[], grootte_px: number): string`
  - The result is the content of a `<g>` in raster pixels.
  - Per item: `<g data-node-id="…" transform="translate(x y)">`, with inside it:
    - a `<g transform="rotate(r) scale(s) translate(-b/2 -h/2)">`, where `s = grootte_px / max(b, h)`, wrapping the symbol;
    - a `<text>` label that does **not** rotate along: `x = grootte_px * 0.6`, `y = grootte_px * 0.15`, `font-size = grootte_px * 0.45`, `text-anchor="start"`.

- [ ] **Step 1: Write the failing tests.**
  - Snapshot of 3 items: a contactdoos at 0°, a lichtpunt at 90°, and a verdeelbord.
  - The label `<img src=x onerror=alert(1)>` appears escaped, and the result parses as valid XML with `fast-xml-parser`, wrapped in `<svg>`.
  - The label element sits outside the rotated `<g>`.
  - An empty list returns `""`.
- [ ] **Step 2: Write the prestatie test.** With 300 items, the median of 20 runs is `< 16` ms.
- [ ] **Step 3: Run** both tests. Expected: FAIL.
- [ ] **Step 4: Implement** `situatie-svg.ts` and export it from the index.
- [ ] **Step 5: Run** the tests and `pnpm test`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(render): svg-laag voor het situatieschema`

### Task 3: Bestandsinhoud herkennen (gedeeld)

**Files:**
- Create: `apps/web/shared/bestandsinhoud.ts`
- Test: `apps/web/test/bestandsinhoud.test.ts`

**Interfaces:**
- Produces, all pure:
  - the constants `MAX_UPLOAD_BYTES`, `MAX_RASTER_PX` and `RASTER_DPI` (Global Constraints);
  - `type BestandSoort = "pdf" | "png" | "jpeg"`;
  - `herkenSoort(kop: Uint8Array): BestandSoort | null`. Magic bytes:
    - `%PDF-` gives `pdf`;
    - `89 50 4E 47 0D 0A 1A 0A` gives `png`;
    - `FF D8 FF` gives `jpeg`;
    - anything else gives `null`;
  - `afmetingen(data: Uint8Array, soort: "png" | "jpeg"): { breedte: number; hoogte: number } | null`:
    - PNG: read the IHDR chunk;
    - JPEG: walk the markers up to SOF0, SOF1 or SOF2;
    - a truncated file gives `null`;
  - `controleerPlanbestand(grootte: number, kop: Uint8Array): { ok: true; soort: BestandSoort } | { ok: false; reden: "te-groot" | "onbekend-type" }`.

- [ ] **Step 1: Write the failing tests.** Build the bytes in the test, so no fixture files are needed.
  - A PNG of 1×1 and one of 3000×2000 give the right dimensions; a PNG cut off after the IHDR length gives `null`.
  - A JPEG with an APP0 marker followed by SOF0 at 640×480 gives `{640, 480}`.
  - `<svg` and `<html` give `null`.
  - A PNG named `.pdf` is irrelevant here, because there is no name parameter; `herkenSoort` only looks at bytes.
  - `controleerPlanbestand(MAX_UPLOAD_BYTES + 1, png)` gives `te-groot`.
- [ ] **Step 2: Run** `pnpm vitest run apps/web/test/bestandsinhoud.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with explicit imports only. `shared/` is used by both server and client.
- [ ] **Step 4: Run** the test, then `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): bestandsinhoud herkennen op magic bytes`

### Task 4: Lokale bestandsopslag en API

**Files:**
- Modify: `apps/web/server/db/schema.ts`, `.gitignore` (add `apps/web/.data/`), `apps/web/.env.example` (add `ELENTRIK_BESTANDEN_DIR=.data/bestanden`)
- Create:
  - `apps/web/server/db/migraties/0001_*.sql`, generated with `pnpm --filter @elentrik/web db:generate`
  - `apps/web/server/bestanden/opslag.ts`, `repo.ts` and `headers.ts`
  - `apps/web/server/api/projecten/[id]/bestanden.post.ts`, `apps/web/server/api/bestanden/[id].get.ts`
- Test: `apps/web/test/bestanden-repo.test.ts`, `apps/web/test/bestanden-opslag.test.ts`

**Interfaces:**
- Consumes: `herkenSoort`, `afmetingen` and the constants from Task 3; `maakTestDb()` and `projectId(event)`.
- Produces:
  - Table `bestanden`:
    - `id` uuid pk, default random;
    - `projectId` uuid not null, references `projecten.id`;
    - `soort` text (`plan-origineel` | `plan-raster`);
    - `mime` text, `grootte` integer, `sleutel` text;
    - `aangemaakt` timestamptz, default now.
  - `interface BestandOpslag { schrijf(sleutel: string, data: Uint8Array): Promise<void>; lees(sleutel: string): Promise<ReadableStream<Uint8Array> | null>; bestaat(sleutel: string): Promise<boolean> }`
  - `maakLokaleOpslag(map: string): BestandOpslag` and `gebruikOpslag(): BestandOpslag`:
    - the map comes from `ELENTRIK_BESTANDEN_DIR`, with as default `.data/bestanden` relative to `process.cwd()`;
    - `zetOpslag(o)` is only for tests.
  - `class BestandFout extends Error { code: "NIET_GEVONDEN" | "TE_GROOT" | "ONGELDIG_TYPE" | "RASTER_TE_GROOT" }`
  - `bewaarBestand(db, opslag, { projectId, soort, data }): Promise<{ id: string; mime: string; grootte: number; breedte_px?: number; hoogte_px?: number }>`
  - `haalBestand(db, id): Promise<{ id: string; mime: string; sleutel: string } | null>`
  - `bestandHeaders(mime: string): Record<string, string>`. It returns `Content-Type`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` and `Cache-Control: private, max-age=31536000, immutable`.
  - Routes:
    - `POST /api/projecten/:id/bestanden`: multipart, fields `bestand` and `soort`, read with `readMultipartFormData`. `BestandFout` maps to 404, 413, 415 and 422. An unknown `soort` value gives 400.
    - `GET /api/bestanden/:id`: 404 when the row or the file is missing. Otherwise it streams with `bestandHeaders`.

- [ ] **Step 1: Write the failing tests.** Use PGlite and a temporary map from `mkdtemp`.
  - A PNG of 10×10 as `plan-raster` gives `mime: "image/png"`, `breedte_px: 10` and `hoogte_px: 10`. The file is at `<map>/<projectId>/<id>` with the same bytes.
  - PNG bytes stored as `plan-origineel` get `mime: "image/png"`, because the type comes from the content.
  - A PDF as `plan-raster` gives `ONGELDIG_TYPE`, and so does `<svg>`.
  - `MAX_UPLOAD_BYTES + 1` gives `TE_GROOT`; an unknown project gives `NIET_GEVONDEN`; a PNG of 8001×10 as raster gives `RASTER_TE_GROOT`.
  - `haalBestand` for an unknown id gives `null`.
  - `bestandHeaders("image/png")` gives the four headers.
  - Opslag: `lees` on a missing key gives `null`, and `schrijf` creates the subfolder.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add the schema and generate the migration.
  - Write `opslag.ts`, `repo.ts` and `headers.ts` with explicit imports, then the thin route handlers.
  - Add the gitignore and env entries.
- [ ] **Step 4: Run** the tests, `pnpm test` and `pnpm typecheck`. Expected: PASS. Then apply `pnpm --filter @elentrik/web db:migrate` to the local Docker DB.
- [ ] **Step 5: Commit** `feat(web): lokale bestandsopslag met api voor plannen`

### Task 5: Bestanden-API in de client, rasterberekening en pdf.js

**Files:**
- Create: `apps/web/app/composables/useBestandenApi.ts`, `apps/web/app/situatie/raster.ts`, `apps/web/app/situatie/pdf.ts`
- Modify: `apps/web/package.json` (`pdfjs-dist`), `apps/web/nuxt.config.ts` if the worker needs it
- Test: `apps/web/test/bestanden-api.test.ts`, `apps/web/test/raster.test.ts`

**Interfaces:**
- Produces:
  - `maakBestandenApi(haal)` and `useBestandenApi()`, following the pattern of `maakProjectenApi`:
    - `upload(projectId, soort, bestand: Blob, naam: string): Promise<BestandInfo>`, as multipart;
    - `url(bestandId): string`, which returns `/api/bestanden/${id}`.
  - `rasterSchaal(breedte_pt: number, hoogte_pt: number): number`. This is the pdf.js scale: `RASTER_DPI / 72`, reduced so that the long side stays ≤ `MAX_RASTER_PX`.
  - `verkleinMaat(breedte: number, hoogte: number): { breedte: number; hoogte: number }`. It is the identity when the long side is ≤ `MAX_RASTER_PX`; otherwise it scales proportionally to exactly `MAX_RASTER_PX`, rounded down.
  - `paginaTitel(bestandsnaam: string, pdfPagina: number | undefined, aantalPaginas: number): string`:
    - it strips the extension;
    - with a PDF page it appends `p<n>`;
    - an empty name gives `Pagina <aantalPaginas + 1>`.
  - `pdf.ts`, browser only, not tested in Vitest:
    - `laadPdf(data: ArrayBuffer): Promise<{ aantalPaginas: number; voorbeeld(nr: number, maxPx: number): Promise<Blob>; raster(nr: number): Promise<{ blob: Blob; breedte: number; hoogte: number }> }>`;
    - `verkleinAfbeelding(bestand: Blob): Promise<{ blob: Blob; breedte: number; hoogte: number }>`, using a canvas.

- [ ] **Step 1: Write the failing tests.**
  - `rasterSchaal(595, 842)` (A4) gives `300 / 72`.
  - `rasterSchaal(3370, 2384)` (A0) gives a scale where `3370 * schaal` equals 8000.
  - `verkleinMaat(10000, 5000)` gives `{8000, 4000}`, and `verkleinMaat(8000, 10)` is the identity.
  - `paginaTitel("plan-gelijkvloers.pdf", 2, 0)` gives `"plan-gelijkvloers p2"`, and `paginaTitel(".png", undefined, 2)` gives `"Pagina 3"`.
  - `upload` sends a `FormData` with `bestand` and `soort` to `/api/projecten/p1/bestanden`.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `pdfjs-dist` with an exact version and load the worker through Vite's `?url` import. Check by hand in the browser that `laadPdf` renders a page.
- [ ] **Step 4: Run** the tests, `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): plannen rasteren met pdf.js en uploaden`

### Task 6: Gedeelde weergave (zoom en pan) en plangeometrie

**Files:**
- Create: `apps/web/app/editor/weergave.ts`, `apps/web/app/situatie/geometrie.ts`
- Modify: `apps/web/app/components/editor/SchemaCanvas.vue`, which uses `weergave.ts` without any change in behaviour
- Test: `apps/web/test/weergave.test.ts`, `apps/web/test/geometrie.test.ts`

**Interfaces:**
- Produces:
  - `type Weergave = { x: number; y: number; b: number; h: number }`
  - `passendeWeergave(inhoud: { breedte: number; hoogte: number }, venster: { breedte: number; hoogte: number }, marge: number): Weergave | null`
  - `begrens(w: Weergave, inhoud): Weergave`, which keeps the centre within the content
  - `zoomRond(huidig: Weergave, passend: Weergave, anker: { fx: number; fy: number }, factor: number, venster, grenzen: { min: number; max: number }): Weergave`
  - `pan(begin: Weergave, dx_px: number, dy_px: number, venster): Weergave`
  - `wielFactor(deltaY: number, deltaMode: number, schermHoogte: number): number`
  - `schermNaarInhoud(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, w: Weergave): { x: number; y: number }`
  - `symboolGrootte(achtergrond: { breedte_px: number; hoogte_px: number }): number`, which is the long side / 60
  - `draai(rotatie: number, richting: 1 | -1): number`, in steps of 15°, normalised to `[0, 360)`
  - `schuif(positie: { x: number; y: number }, dx: number, dy: number, raster: { breedte_px: number; hoogte_px: number }): { x: number; y: number }`. It adds `dx` and `dy`, then clamps to `[0, breedte_px] × [0, hoogte_px]`.

- [ ] **Step 1: Write the failing tests.**
  - `passendeWeergave` with content 8000×6000 in a window 1000×500, margin 0, shows the full plan, centred.
  - `begrens` brings a view panned far outside back so that its centre lies at the edge.
  - `zoomRond` keeps the anchor point in place and respects min and max.
  - `schermNaarInhoud` is the inverse of the projection.
  - `symboolGrootte({8000, 6000})` gives `133.33…`.
  - `draai(345, 1)` gives `0`, and `draai(0, -1)` gives `345`.
  - `schuif` clamps to the raster.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement**, then refactor `SchemaCanvas.vue` to use these functions. Keep the same constants (`MIN_ZOOM` 0.25, `MAX_ZOOM` 4, factor `exp(-delta * 0.0015)`).
- [ ] **Step 4: Run** the tests, `pnpm test`, `pnpm typecheck` and the existing Playwright e2e tests. Expected: PASS and no regression.
- [ ] **Step 5: Commit** `refactor(web): zoom en pan als gedeelde pure module, plangeometrie`

### Task 7: Situatie-store, tabblad en items

**Files:**
- Create: `apps/web/app/stores/situatie.ts`, `apps/web/app/situatie/items.ts`
- Modify: `apps/web/app/stores/editor.ts` (adds `tabblad`)
- Test: `apps/web/test/situatie-store.test.ts`, `apps/web/test/situatie-items.test.ts`

**Interfaces:**
- Consumes:
  - `useEditorStore().pasToe`, `document`, `analyse` and `selectie`;
  - the model operations from Task 1, plus `voegPaginaToe`, `zetAchtergrond`, `plaats` and `verwijderPlaatsing`;
  - `draai`, `schuif` and `symboolGrootte` from Task 6;
  - `tekenSymbool` from `@elentrik/symbols`; `SituatieItem` from Task 2.
- Produces:
  - Editor store: `tabblad: Ref<"eendraadschema" | "situatieschema">`, default `"eendraadschema"`, reset to that default in `laad`.
  - `useSituatieStore()`:
    - `actievePaginaId: Ref<string | null>`, which falls back to the first page when its page disappears;
    - `actievePagina` (computed);
    - `voegPlanPaginaToe(titel, achtergrond): string`. It runs `voegPaginaToe` and `zetAchtergrond` merged into **one** undo step and makes the new page active.
    - `vervangAchtergrond(paginaId, achtergrond)`, `hernoem(paginaId, titel)`, `verwijderPagina(paginaId)`, `verplaatsPagina(paginaId, index)` and `zetSchaal(paginaId, mmPerPx | undefined)`;
    - `plaatsNode(nodeId, x, y)`:
      - it places the node on the active page, keeping an existing rotation;
      - it returns the title of the page it came from when that is a different page, else `null`.
    - `haalVanPlan(nodeId)`, `draaiSelectie(richting)` and `schuifSelectie(dx, dy)`. Each is its own undo step.
  - `situatieItems(doc, analyse, paginaId): SituatieItem[]`:
    - the label is `analyse.puntLabels[id]`, or `naam` for a verdeelbord, or `""`;
    - the symbol comes from `tekenSymbool`.
  - `tePlaatsen(doc, analyse): { kringLabel: string; nodeIds: NodeId[] }[]`:
    - `analyse.nietGeplaatst` grouped per kring, in order;
    - unplaced verdeelborden go into a separate group labelled `"Verdeelborden"`; the i18n key is resolved in the UI;
    - points without a kring go into a group `"—"`.

- [ ] **Step 1: Write the failing tests.**
  - `voegPlanPaginaToe` followed by `ongedaanMaken` once removes the page completely.
  - After `plaatsNode`, `ongedaanMaken` removes the placement; `opnieuw` puts it back.
  - Move to another page: the return value is the old page title.
  - `draaiSelectie(1)` four times gives `60`.
  - `schuifSelectie(10, 0)` twice gives 2 undo steps.
  - Review Focus 2:
    - delete a placed point through the editor store's `verwijderSelectie(false)`: the placement is gone;
    - `ongedaanMaken` brings back the point and the placement.
  - The active page falls back to the first one after `verwijderPagina`.
  - `situatieItems`, Review Focus 4: delete point A1 of A1–A3. The placed A3 gets label `A2`.
  - `tePlaatsen` groups per kring in order and includes an unplaced verdeelbord.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement** with explicit imports, as `editor.ts` already does.
- [ ] **Step 4: Run** the tests, `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): situatie-store met pagina's, plaatsingen en items`

### Task 8: PlanCanvas

**Files:**
- Create: `apps/web/app/components/situatie/PlanCanvas.vue`, `apps/web/app/situatie/sneltoetsen.ts`
- Modify: `apps/web/i18n/locales/nl.json` (key `editor.situatie.canvas.*`)
- Test: `apps/web/test/situatie-sneltoetsen.test.ts`

**Interfaces:**
- Consumes:
  - `useSituatieStore`, `useEditorStore` and `situatieItems`;
  - `situatieLaagSvg` from `@elentrik/render`;
  - `weergave.ts` and `geometrie.ts`;
  - `moetNegeren`, `doelSoort` and `WIDGET_SELECTOR` from `~/composables/sneltoetsen`;
  - `markeringen` from `~/editor/markeringen`;
  - `useBestandenApi().url`.
- Produces:
  - `situatieSneltoets(toets: { key; shiftKey; ctrlKey; metaKey; doelIsInvoer; doelIsKnop }): SituatieActie | null` with:
    - `{ soort: "draai"; richting: 1 | -1 }`
    - `{ soort: "haalVanPlan" }` (Delete or Backspace)
    - `{ soort: "schuif"; dx; dy }` (arrows: 10, with Shift 1)
    - `{ soort: "annuleer" }` (Escape)
    - `"ongedaan"` and `"opnieuw"`, as in the eendraadschema
  - The component `PlanCanvas`:
    - props `teplaatsen: NodeId | null` (the point chosen for click-to-place) and `meetSchaal: boolean`;
    - emits `geplaatst(nodeId, vanPagina: string | null)`, `annuleer()`, `schaalGemeten(afstand_px: number)` and `vervangPlan(paginaId)`;
    - it accepts HTML5 drop with `dataTransfer` type `application/x-elentrik-node`, whose value is the nodeId.

- [ ] **Step 1: Write the failing tests** for `situatieSneltoets`:
  - `r` gives `draai 1` and `R` with Shift gives `draai -1`;
  - Delete and Backspace give `haalVanPlan`;
  - ArrowLeft gives `schuif -10, 0`, and with Shift `-1, 0`;
  - letter keys other than r give `null`;
  - in an input field: `null`;
  - on a button: Enter and Space give `null`, Delete gives `haalVanPlan`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** `PlanCanvas.vue`:
  - an `<svg>` with `viewBox` from the view, `<image href=url(rasterBestandId) width height>`, and a `<g v-html>` holding `situatieLaagSvg`, the selection frames and the markers;
  - the image's `@error` emits a state "plan niet gevonden", shown as an overlay with a button that emits `vervangPlan`;
  - zoom and pan through `weergave.ts`, with "Passend maken";
  - a click on `[data-node-id]` selects;
  - dragging a symbol shows a CSS-transform preview, and `plaatsNode` follows only on pointerup, so no analyse runs per move;
  - click-to-place uses `teplaatsen`, drop uses `dataTransfer`;
  - schaal mode: two clicks show a line, then emit `schaalGemeten`;
  - a selection toolbar with buttons to rotate left, rotate right and "Van plan halen";
  - a window keydown listener with the same filter as `SchemaCanvas`.
- [ ] **Step 4: Run** the test, `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): plancanvas met plaatsen, verschuiven en draaien`

### Task 9: Dialoog "Plan toevoegen"

**Files:**
- Create: `apps/web/app/components/situatie/PlanToevoegenDialoog.vue`
- Modify: `apps/web/i18n/locales/nl.json` (key `editor.situatie.toevoegen.*`)

**Interfaces:**
- Consumes: `controleerPlanbestand` (Task 3), `laadPdf`, `verkleinAfbeelding`, `verkleinMaat`, `paginaTitel` and `useBestandenApi` (Task 5), and `useSituatieStore` (Task 7).
- Produces:
  - The component has props `open` and `vervangPaginaId?: string`.
  - Without `vervangPaginaId` it creates a page through `voegPlanPaginaToe`. With it, it calls `vervangAchtergrond`.
  - It emits `klaar(paginaId)`.

- [ ] **Step 1: Implement the flow.**
  1. File selection or drop. `controleerPlanbestand` rejects with a toast `te-groot` or `onbekend-type`, without any network traffic.
  2. For a PDF: a grid of page previews from `voorbeeld(nr, 160)`, and the user picks one.
  3. Upload the original, then the raster. An image within the limits counts as its own raster: `rasterBestandId` equals `origineelBestandId`.
  4. Only after both uploads succeed is the store action called.
  5. A failed upload shows a toast with the server reason (413, 415 or 422 → message in nl.json), and the document stays unchanged.
  6. There is a progress indicator and a working Cancel, which aborts the fetch through `AbortController`.
- [ ] **Step 2: Check by hand** in the browser: a PNG upload, a two-page PDF where page 2 is picked, and an SVG that is refused.
- [ ] **Step 3: Run** `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(web): dialoog om een plan toe te voegen`

### Task 10: Tabblad Situatieschema in de editor

**Files:**
- Create:
  - `apps/web/app/components/situatie/TePlaatsenPaneel.vue`
  - `apps/web/app/components/situatie/PaginaTabs.vue`
  - `apps/web/app/components/situatie/PaginaHernoemenDialoog.vue`
  - `apps/web/app/components/situatie/SchaalDialoog.vue`
- Modify: `apps/web/app/components/editor/EditorBovenbalk.vue`, `apps/web/app/pages/projecten/[id].vue`, `apps/web/i18n/locales/nl.json`

**Interfaces:**
- Consumes: Tasks 7, 8 and 9.
- Produces: the full screen from spec §4.4.

- [ ] **Step 1: Implement the bovenbalk tabs.**
  - The "Situatieschema" tab becomes active and switches `store.tabblad`, with `aria-selected`.
  - "Kringenlijst" stays disabled with "Binnenkort".
- [ ] **Step 2: Implement the page layout.**
  - `[id].vue` swaps the left panel and the canvas based on `tabblad`: `OnderdelenPaneel` with `SchemaCanvas`, or `TePlaatsenPaneel` with `PaginaTabs` and `PlanCanvas`.
  - The right column stays the same.
- [ ] **Step 3: Implement `TePlaatsenPaneel`.**
  - Groups from `tePlaatsen`, each item with its label, `draggable`, `data-testid="te-plaatsen-<label>"`, and a click that chooses it for click-to-place.
  - The empty state reads "Alle punten staan op een plan".
- [ ] **Step 4: Implement `PaginaTabs`.**
  - One tab per page, plus "Pagina toevoegen".
  - A menu per page: hernoemen (dialog), schaal instellen (activates `meetSchaal`, followed by `SchaalDialoog` for the mm value; it shows "Schaal: 1 px = … mm" with "Schaal wissen"), naar links or rechts, and verwijderen.
  - Verwijderen asks for confirmation when the page has placements.
  - With no pages: an empty state with "Plan toevoegen".
- [ ] **Step 5: Wire the remaining events.**
  - Show a toast "{label} verplaatst van {van} naar {naar}" when `geplaatst` brings a `vanPagina`.
  - `vervangPlan(paginaId)` opens `PlanToevoegenDialoog` with `vervangPaginaId`.
- [ ] **Step 6: Check visually** in the browser: upload a plan, drag A1, drag A2 by click-to-place, rotate, move, remove from the plan, use two pages, and set a scale.
- [ ] **Step 7: Run** `pnpm test`, `pnpm typecheck` and Playwright. Expected: PASS.
- [ ] **Step 8: Commit** `feat(web): tabblad situatieschema met panelen en paginatabs`

### Task 11: End-to-end en fixtures

**Files:**
- Create: `apps/web/e2e/fixtures/maak-fixtures.mjs`, `apps/web/e2e/situatie.spec.ts`
- Modify: `apps/web/package.json` (script `e2e:fixtures`); the generated files go to `apps/web/e2e/fixtures/` and are committed.

- [ ] **Step 1: Write the fixture script.**
  - It writes `plan.png`, 1200×800, with a few lines, using `node:zlib` and its own PNG chunks.
  - It writes `plan-2p.pdf`, 2 A4 pages, as a hand-written PDF with a correct xref and a simple line drawing on each page.
- [ ] **Step 2: Write `situatie.spec.ts`:**
  1. Create a project, add a kring and 2 contactdozen (as in `editor.spec.ts`), open the Situatieschema tab, and upload `plan.png`.
  2. Drag `te-plaatsen-A1` onto the plan. Expect the label "A1" in the plan SVG, and the bevinding "nog niet op een situatieplan geplaatst" for A1 to disappear.
  3. Wait for "Opgeslagen" and reload. Expect A1 to still be on the plan.
  4. Ctrl+Z. Expect A1 back in "Te plaatsen".
  5. Ctrl+Y, select A1 on the plan and press Delete. Expect A1 in "Te plaatsen", while in the Eendraadschema tab A1 still exists.
  6. Pagina toevoegen with `plan-2p.pdf` and page 2. Expect a second page tab with title "plan-2p p2", and the image to load (`naturalWidth > 0`).
  7. Review Focus 1: through the API, PUT a document whose page has `rasterBestandId: "00000000-0000-0000-0000-000000000000"`. After reload, expect "Plan niet gevonden" and "Plan opnieuw kiezen".
  8. An SVG upload gives the toast "Dit bestandstype wordt niet aanvaard." and adds no page.
- [ ] **Step 3: Run** `pnpm --filter @elentrik/web exec playwright test`. Expected: PASS. If a step does not work, that is a bug in Task 1–10: fix it there, with a regression test.
- [ ] **Step 4: Run** `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `test(web): end-to-end flow van het situatieschema`
