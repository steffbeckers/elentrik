# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver SB-5: a superuser-only administration area with insights, global search, audited record/project corrections, local access controls, Stripe links, access explanations, and internal support notes.

**Architecture:** Dedicated `/api/admin` endpoints require an authoritative superuser check before looking up targets. Transactional mutation/audit helpers support record corrections and reason-bound project correction sessions; the existing editor receives an explicit customer/admin context. Queries expose small typed DTOs, while large document revisions are fetched only on demand.

**Tech Stack:** Existing Nuxt 4/Vue 3, Nuxt UI, Better Auth, Drizzle/PostgreSQL, Zod, Vitest/PGlite, and Playwright; pnpm and the existing shared model packages.

**Spec:** `docs/superpowers/specs/2026-11-03-admin-dashboard-design.md` (approved).

## Global Constraints

- "No new service or external analytics dependency is required."
- "Do not introduce a global superuser bypass into ordinary customer routes."
- "Keep Better Auth for sign-in."
- "default 25, maximum 100 rows" for paginated lists; global search has at most five results per group and a two-to-200-character query.
- "all three languages (`nl-BE`, `fr-BE`, `en-GB`) are required."
- "Storage quotas and upload validation still apply."
- "No automated rollback is offered: a later correction creates another audited version."
- Trial dates and note follow-up dates use `Europe/Brussels`; stored instants use UTC. Correction sessions last at most eight hours and are tied to the authenticated session.
- Customer records, exports, and billing are not changed by executing tests. Use the existing isolated PGlite and E2E environments; never apply migrations to a production database as part of this work.
- Work in the current Orca branch `steff/sb-5-admin-dashboard`; verify its isolation through the using-git-worktrees skill when execution begins. Preserve unrelated changes.
- Every new route directly exports `defineBeveiligdeHandler(...)`, retaining the existing static route guard. Inside it call `vereisSuperuser` before parsing target data. Use explicit imports in testable server modules.

## Review Focus

1. A support tab is left open while sign-in or superuser permission changes: subsequent reads/writes must not leak or act as the new user (Tasks 1, 6, 9).
2. A committed save loses its response and is retried: return the original result with exactly one version increment/audit entry, including concurrent retries (Tasks 2, 6, 9).
3. A trial ends or a reminder becomes due across Brussels midnight/daylight saving: correct exclusive boundaries and calendar dates (Tasks 4, 5).
4. Customer editing/deletion races support editing or file cleanup: preserve version conflicts, audit evidence, and local recovery without restoring/deleting the wrong project (Tasks 6, 7, 9).
5. Ambiguous names, literal `%`/`_`, out-of-order search responses, and multi-company memberships: correct search context/counts without accidental organisation switching (Tasks 3, 8).

## Contracts and file ownership

Unless prefixed with `apps/web/` or `docs/`, source/test paths below are relative to `apps/web/`. Shell commands run from the repository root. The exact numbered migration prefix comes from Drizzle; each task supplies its stable migration name and must review the generated SQL and metadata before applying it only to test/local databases.

All new DTOs live in `apps/web/shared/admin/`: `basis.ts` (paging/mutations), `records.ts` (users/companies/projects), `toegang.ts` (access/Stripe), `audit.ts`, `notities.ts`, `projecten.ts` (correction sessions), and `zoeken.ts`. Dates in DTOs are ISO strings except explicitly labelled `YYYY-MM-DD` calendar dates. Existing `Partij`, `Project`, `ExportInfo`, and `Toegang` types remain authoritative.

- `AdminActor = { id: string; naam: string; sessieId: string }` is server-only and always produced by the authenticated guard.
- `AdminPagina<T> = { items: T[]; totaal: number; pagina: number; perPagina: number }`.
- `AdminLijstQuery = { zoek: string; pagina: number; perPagina: number; exactId?: string }`; specialised list queries add `organisatieId`, deleted state, access/status filters as appropriate.
- `AdminMutatie<T> = { mutatieId: string; reden: string; verwacht: string; gegevens: T }`; `verwacht` is a canonical SHA-256 token of the editable state returned by a detail read. Creation operations omit it. Strict schemas reject arbitrary fields.
- `AdminAuditDoel = { type: "gebruiker" | "organisatie" | "project" | "notitie"; id: string; organisatieId: string | null; projectId: string | null }`.
- `AdminNotitie = { id: string; organisatieId: string; projectId: string | null; tekst: string; opvolgdatum: string | null; auteur: { id: string; naam: string }; aangemaakt: string; gewijzigd: string; gearchiveerd: string | null; verwacht: string }`.
- `AdminCorrectie = { id: string; projectId: string; organisatieId: string; reden: string; gestart: string; verloopt: string; beeindigd: string | null }`; the actor and sign-in session remain server-side.
- `AdminZoekresultaten = { gebruikers: AdminZoekgroep; organisaties: AdminZoekgroep; projecten: AdminZoekgroep }`, with `AdminZoekgroep = { items: Array<{ id: string; naam: string; context: string; verwijderd: boolean }>; meer: boolean }`.
- Small record summaries/details contain exactly the fields listed in spec section 3; subscription IDs/links are admin-only. Normal `Project` responses and document schemas never contain support notes or audit data.

Modules are split by behaviour: `server/admin/toegang.ts`, `mutaties.ts`, `audit.ts`, `records.ts`, `overzicht.ts`, `zoeken.ts`, `bedrijfsrechten.ts`, `notities.ts`, `correcties.ts`, `projecten.ts`, and `bestanden.ts`. Shared UI lives under `app/components/admin/`; route pages contain orchestration, not duplicated security rules.

Dependencies: 1 → 2 → 3; 4 and 5 build on 2/3; 6 builds on 2/3; 7 builds on 6; 8 consumes 3/4/5; 9 consumes 6/7/8; 10 verifies the complete feature. Keep schema/migration edits sequential even if execution uses subagents.

### Task 1: Authoritative superuser access and organisation-free entry

**Files:** Modify `server/db/schema.ts`, `server/organisaties/leden.ts`, `shared/mij.ts`, `app/stores/sessie.ts`, `app/sessie/bestemming.ts`, `app/components/GebruikerMenu.vue`, `shared/foutcodes.ts`, and all three `i18n/locales/*.json` under `apps/web`. Create `server/admin/toegang.ts`, `server/api/admin/sessie.get.ts`, `app/middleware/superuser.ts`, `test/admin-toegang.test.ts`, and `docs/admin-beheer.md`. Generate the next migration named `superusers` plus its metadata. Update existing session/navigation/access tests.

**Interfaces:** Produce `vereisSuperuser(event: H3Event): Promise<AdminActor>` and `Mij.gebruiker.superuser: boolean`. `GET /api/admin/sessie` returns `{ superuser: true }` only after the guard. `bestemming` recognises `/admin` and `/admin/...` exactly, with no prefix match for `/administrator`.

- [x] Write HTTP tests with real Better Auth sessions for anonymous → 401, member/owner → 403, database-promoted user without membership → 200, and revoked user → 403. Assert a forged sign-up/profile `superuser` field never promotes the account; the response exposes no target records on denial. Add navigation tests showing only superusers bypass the no-organisation redirect for admin routes.
- [x] Run `pnpm exec vitest run apps/web/test/admin-toegang.test.ts`; confirm the new behaviour fails before implementation.
- [x] Add the default-false DB column without making it a writable Better Auth profile field; generate/review the migration with `pnpm --filter @elentrik/web exec drizzle-kit generate --name superusers`. Implement guard using `vereisVerwachteGebruiker`, authoritative DB lookup, and no-store response headers. Expose the current flag through `/api/mij` and session store, add the guarded menu item/middleware, and document grant/revoke SQL for an exact verified user ID. No production account is promoted during implementation.
- [x] Extend `test/toegang.test.ts` so newly discovered admin routes are tested as forbidden for all existing non-superuser actors rather than silently omitted; maintain static `defineBeveiligdeHandler` checks. Test admin middleware network failures as closed access.
- [x] Run `pnpm exec vitest run apps/web/test/admin-toegang.test.ts apps/web/test/routes-beveiligd.test.ts apps/web/test/toegang.test.ts apps/web/test/aangemeld-middleware.test.ts apps/web/test/sessie-store.test.ts apps/web/test/vertalingen.test.ts`; require zero failures, then commit `feat(SB-5): add system administrator access`.

### Task 2: Atomic mutations and append-only audit history

**Files:** Create `shared/admin/basis.ts`, `shared/admin/audit.ts`, `server/admin/mutaties.ts`, `server/admin/audit.ts`, `server/api/admin/audit/index.get.ts`, `server/api/admin/audit/[id].get.ts`, `test/admin-mutaties.test.ts`, and `test/admin-audit.test.ts`; modify schema and generate a migration named `admin_audit`.

**Interfaces:** Produce `versieToken(waarde: unknown): string`; `voerAdminMutatieUit<T>(db: Db, actor: AdminActor, invoer: { mutatieId: string; actie: string; doel: AdminAuditDoel; payload: unknown }, werk: (tx: Tx) => Promise<T>): Promise<T>`; and `schrijfAdminAudit(tx: Tx, actor: AdminActor, invoer: { doel: AdminAuditDoel; actie: string; reden: string; voor: unknown; na: unknown; correctieId?: string }): Promise<string>`. All mutation callers validate first and lock/check editable state inside `werk`. Produce bounded audit-list/detail DTOs.

- [x] Add tests asserting a failed audit insertion leaves the business row unchanged, identical retries return the stored result, concurrent retries execute once, different payload reuse returns 409, and no-op updates have no change entry. Audit survives actor/target deletion and rendering data never contains session/token fields.
- [x] Run `pnpm exec vitest run apps/web/test/admin-mutaties.test.ts apps/web/test/admin-audit.test.ts` and observe failures.
- [x] Add `admin_mutaties` (unique actor/mutation ID, request fingerprint, action/target, response JSON) and `admin_audit` (actor snapshot, target IDs, time, reason, before/after, optional correction ID). Use no cascading target/actor foreign keys. Index date/ID, actor, company, project, and target; mutation locking uses an advisory transaction lock before checking the result row. Canonical JSON hashing is independent of object-key ordering. Require actor/session checks even when serving a stored retry result.
- [x] Implement atomic helper and audit read endpoints; audit-list selects metadata only, while detail loads before/after. Paginate using validated page/per-page and deterministic time/ID ordering. No audit edit/delete route exists.
- [x] Run the Task 2 tests plus `routes-beveiligd` and `toegang`; require zero failures, then commit `feat(SB-5): record administrative changes atomically`.

### Task 3: Record lists, global search, overview, and access explanations

**Files:** Create `shared/admin/records.ts`, `shared/admin/zoeken.ts`, `shared/admin/toegang.ts`, `server/admin/records.ts`, `server/admin/zoeken.ts`, `server/admin/overzicht.ts`, `server/admin/toegangsweergave.ts`, `server/admin/stripe-links.ts`, and tests `admin-records`, `admin-zoeken`, `admin-overzicht`, `admin-toegangsweergave`, `admin-stripe-links`. Add API routes `admin/overzicht.get.ts`, `admin/zoeken.get.ts`, and `index.get.ts`/`[id].get.ts` under each of `admin/gebruikers`, `admin/organisaties`, `admin/projecten`.

**Interfaces:** Produce `leesAdminQuery(query: Record<string, unknown>): AdminLijstQuery`; `lijstAdminGebruikers`, `lijstAdminOrganisaties`, `lijstAdminProjecten` taking `(db: Db, query: specialised AdminLijstQuery)`; corresponding `haalAdmin...` detail functions taking `(db: Db, id: string)`; `zoekAdmin(db: Db, zoek: string): Promise<AdminZoekresultaten>`; `adminOverzicht(db: Db, config: AbonnementConfig, nu: Date): Promise<AdminOverzicht>`; `verklaarToegang(invoer: ToegangInvoer): AdminToegangsverklaring`; `stripeBeheerLinks(config: AbonnementConfig, ids: { klantId: string | null; abonnementId: string | null }): { klant: string | null; abonnement: string | null }`.

- [x] Write query tests for default 25/max 100, malformed pagination, two-to-200-character search, exact email/ID priority, case-insensitive literals `%`/`_`/backslash, duplicate company names, multiple owners without multiplied counts, deleted project exact-ID matches, and no large documents in list DTOs. Define `AdminOverzicht` and record DTOs from the spec fields in this task.
- [x] Write access tests against `bepaalToegang`: exemption plus unpaid, active plus expired trial, unknown grace start, exact trial/grace boundaries, disabled billing, and unknown recorded subscription status. Assert summary SQL groups/counts match those decisions. Stripe-link tests cover valid test/live IDs, missing IDs, disabled/unknown mode, local fake Stripe, and secret-free output.
- [x] Run `pnpm exec vitest run apps/web/test/admin-records.test.ts apps/web/test/admin-zoeken.test.ts apps/web/test/admin-overzicht.test.ts apps/web/test/admin-toegangsweergave.test.ts apps/web/test/admin-stripe-links.test.ts`; observe failures.
- [x] Implement bounded select/aggregate queries, shared validated filters and grouping, server-evaluated reference time, and explanatory DTOs. Reuse `bepaalToegang` for individual decisions; test any aggregate SQL expression against it. Include recorded synchronisation time, exact subscription/customer links, editable-state tokens, and related-record counts. Choose/search indexes with an explained query plan; do not add a service for search. Never return Better Auth accounts/sessions/verification rows.
- [x] Extend route-access cases for every endpoint; run Task 3 tests plus Task 1 guards and `toegang`, then commit `feat(SB-5): add admin overview and searchable records`.

### Task 4: Audited profile/company edits, exemptions, and trial extension

**Files:** Create `server/admin/gebruikers.ts`, `server/admin/bedrijfsrechten.ts`, `server/admin/datum.ts`, `server/api/admin/gebruikers/[id].put.ts`, `server/api/admin/organisaties/[id].put.ts`, `server/api/admin/organisaties/[id]/vrijstelling.put.ts`, `server/api/admin/organisaties/[id]/proefperiode.put.ts`, and `test/admin-recordcorrecties.test.ts`, `test/admin-bedrijfsrechten.test.ts`, `test/admin-datum.test.ts`. Modify `server/abonnementen/beheer.ts`, customer subscription UI, fault codes, and translations.

**Interfaces:** Produce `corrigeerGebruiker(db, actor, id, AdminMutatie<{ naam: string }>)`, `corrigeerOrganisatie(db, actor, id, AdminMutatie<{ naam: string; installateur: Partij }>)`, `zetVrijstelling(db, actor, id, AdminMutatie<{ vrijgesteld: boolean; stripeBevestigd: boolean }>)`, and `verlengProef(db, actor, id, AdminMutatie<{ einddatum: string; stripeBevestigd: boolean }>, nu: Date)`, each returning the refreshed detail DTO. `proefEindeVoorDatum(datum: string): Date` converts the next Brussels midnight to an exclusive UTC instant.

- [x] Test stale edits and transactional audit evidence; name/company validation and logo preservation; own-name display refresh; exemption removal restoring existing access; regular owners denied; extension requiring new end > old end and now; `proefGebruikt` unchanged; Stripe acknowledgement required when a subscription/open checkout exists; no calls to change Stripe billing.
- [x] Pin DST conversion in `test("trial expires at the following Brussels midnight")` with `expect(proefEindeVoorDatum("2027-03-28").toISOString()).toBe("2027-03-28T22:00:00.000Z")` and `expect(proefEindeVoorDatum("2027-10-31").toISOString()).toBe("2027-10-31T23:00:00.000Z")`; reject impossible dates. Verify new Checkout is rejected while exempt and existing billing portal remains usable.
- [x] Run `pnpm exec vitest run apps/web/test/admin-recordcorrecties.test.ts apps/web/test/admin-bedrijfsrechten.test.ts apps/web/test/admin-datum.test.ts`; observe failures.
- [x] Implement strict body allowlists, canonical precondition checks under row locks, and Task 2 mutation/audit functions. Use the same per-company advisory lock as Checkout for local access changes, preventing new Checkout creation from racing exemption. Existing in-flight Stripe authorisations remain explicitly described in UI. Update checkout and customer subscription UI to honour free access, with all three translations.
- [x] Run Task 4 tests plus `abonnement-api`, `abonnement-toegang`, `abonnement-handhaving`, `abonnement-client`, and `vertalingen`; require zero failures, then commit `feat(SB-5): add audited company support controls`.

### Task 5: Internal support notes and due follow-ups

**Files:** Create `shared/admin/notities.ts`, `server/admin/notities.ts`, `server/api/admin/notities/index.get.ts`, `index.post.ts`, `[id].put.ts`, `test/admin-notities.test.ts`; add schema and generate migration `admin_notities`. Extend `server/admin/overzicht.ts` with due follow-ups.

**Interfaces:** Produce `lijstNotities(db: Db, query: { organisatieId: string; projectId?: string; gearchiveerd: boolean } & AdminLijstQuery): Promise<AdminPagina<AdminNotitie>>`; `maakNotitie(db, actor, invoer: { mutatieId: string; organisatieId: string; projectId: string | null; tekst: string; opvolgdatum: string | null }): Promise<AdminNotitie>`; `wijzigNotitie(db, actor, id, AdminMutatie<{ tekst: string; opvolgdatum: string | null; gearchiveerd: boolean }>): Promise<AdminNotitie>`; `brusselseDatum(nu: Date): string` for due-date comparison.

- [x] Test 1–5,000 trimmed characters, invalid dates, mismatched project/company IDs, note edits by another superuser preserving creator and recording editor, archive visibility, pagination, stale edits, duplicate retries, rollback, and absence from normal company/project responses. Test notes due today across Brussels midnight and archive/date clearing removing a reminder.
- [x] Run `pnpm exec vitest run apps/web/test/admin-notities.test.ts`; observe failures.
- [x] Add `admin_notities` with explicit company/project identifiers, creator snapshot, created/modified/archived timestamps, text, and calendar-date follow-up. Retain identity after target deletion without cascade; new notes require a valid current target. Use Task 2 helpers; creation uses note text as its explanation, edits/archive require a reason. Add bounded due-follow-up query to overview, no outbound notifications.
- [x] Run Task 5 tests plus overview and access suites; require zero failures, then commit `feat(SB-5): add internal support notes`.

### Task 6: Correction sessions, audited project saves, and support file access

**Files:** Create `shared/admin/projecten.ts`, `server/admin/correcties.ts`, `server/admin/projecten.ts`, `server/admin/bestanden.ts`, `test/admin-correcties.test.ts`, `test/admin-projecten.test.ts`, `test/admin-bestanden.test.ts`; modify schema and generate migration `admin_correcties`. Add routes `admin/projecten/[id]/document.get.ts`, `document.put.ts`, `correcties.post.ts`, `bestanden.post.ts`, `exports.get.ts`, `admin/correcties/[id]/afronden.post.ts`, and `admin/bestanden/[id].get.ts`. Extend `server/projecten/repo.ts` and `server/bestanden/repo.ts` only at their transaction seams.

**Interfaces:** Produce `startCorrectie(db, actor, projectId, { mutatieId: string; reden: string }, nu: Date): Promise<AdminCorrectie>`; `vereisCorrectie(tx: Db | Tx, actor: AdminActor, id: string, projectId: string, nu: Date): Promise<AdminCorrectie>`; `bewaarAdminProject(db, actor, projectId, versie: number, invoer: { correctieId: string; mutatieId: string } & BewaarInvoer): Promise<{ versie: number }>`; `rondCorrectieAf(db, actor, id, mutatieId): Promise<AdminCorrectie>`. Read document returns existing `Project`; export list returns existing `ExportInfo[]`; upload returns existing `BestandInfo`.

- [x] Test correction creation only for live, assigned projects; exact eight-hour expiry, wrong actor/sign-in/project, early completion, revoked permission, and subscription-blocked companies. Assert a save increments once, captures actual before/after in the same transaction, rolls back on audit failure, and returns original result after a lost response retry.
- [x] Test a customer/support version race; schema/body/If-Match errors; cross-project plan references; deleted project; upload type/quota checks; forged file company/target; only authenticated admins reading stored plans/exports; no arbitrary storage keys in URLs. Include concurrent correction completion vs save and upload retries.
- [x] Run `pnpm exec vitest run apps/web/test/admin-correcties.test.ts apps/web/test/admin-projecten.test.ts apps/web/test/admin-bestanden.test.ts`; observe failures.
- [x] Implement correction/revision tables. Project revision rows store immutable project name/document/version pairs linked to audit; audit lists omit payloads. Refactor project-save transaction into a reusable internal operation or accept a transactional audit callback, preserving customer behaviour and existing plan ownership checks. Hold correction state and project row locks while saving; completion uses compatible locking. Use dedicated admin routes with explicit context and no billing bypass on normal routes.
- [x] Add upload mutation metadata as multipart fields, actor check through the expected-user header, body hash for retry identity, and audit callback in the file-row transaction. Reuse storage validation and cleanup on rollback. Read files by DB-derived project/company; no customer-membership mutation. No admin create/delete/duplicate/export-generation route is added.
- [x] Run Task 6 suites plus `projecten-repo`, `projecten-api`, `projecten-planverwijzingen`, `toegang`, and `routes-beveiligd`; require zero failures, then commit `feat(SB-5): support audited project corrections`.

### Task 7: Preserve audit revisions and their referenced files during cleanup

**Files:** Modify `server/bestanden/opruimen.ts`, `server/bestanden/opslagruimte.ts`, `test/bestanden-opruimen.test.ts`, and `test/bestanden-opslagruimte.test.ts`; create `test/admin-revisies.test.ts`; extend admin audit detail/file queries from Task 6.

**Interfaces:** Cleanup retains `ruimOp(deps: OpruimAfhankelijkheden): Promise<OpruimResultaat>`. Add `auditBestandVerwijzingen(db: Db): Promise<Map<string, Set<string>>>` in `server/admin/audit.ts` or a focused `server/admin/revisies.ts`; include retained revision document references using a non-project sentinel so own-project purge is blocked. Keep `gebruikteOpslag(db, organisatieId): Promise<number>` and count retained audited files once.

- [x] Write fixtures with a support revision referencing an old plan and a project deleted for >30 days. Assert cleanup preserves the revision and file, blocks its project purge, still removes unrelated eligible orphans, and does not double-count files. Deleting an actor must not remove history. Audit detail can display retained revision content without enabling project edits.
- [x] Run `pnpm exec vitest run apps/web/test/admin-revisies.test.ts`; observe failures.
- [x] Integrate bounded revision traversal with cleanup reference collection; retain audit-only references independently of live documents. Update quota accounting for retained audited files of deleted projects, matching the approved design. Audit retention stays indefinite until a separate policy exists; no hidden purge job is introduced.
- [x] Run `pnpm exec vitest run apps/web/test/admin-revisies.test.ts apps/web/test/bestanden-opruimen.test.ts apps/web/test/bestanden-opslagruimte.test.ts apps/web/test/bestanden-opslag.test.ts`; require zero failures, then commit `fix(SB-5): preserve support audit evidence during cleanup`.

### Task 8: Admin shell, overview, lists, detail forms, notes, and audit UI

**Files:** Create `app/layouts/admin.vue`, `app/composables/useAdminApi.ts`, `app/composables/useAdminZoeken.ts`, `app/components/admin/AdminZoeken.vue`, `AdminLijst.vue`, `AdminToegang.vue`, `AdminNotities.vue`, `AdminAudit.vue`, `AdminCorrectieFormulier.vue`, and pages `admin/index.vue`, `admin/gebruikers/index.vue`, `admin/gebruikers/[id].vue`, `admin/organisaties/index.vue`, `admin/organisaties/[id].vue`, `admin/projecten/index.vue`, `admin/projecten/[id].vue`, `admin/audit/index.vue`, `admin/audit/[id].vue`. Add `test/admin-client.test.ts`, `test/admin-zoeken-client.test.ts`, `e2e/admin-dashboard.spec.ts`; extend locale files.

**Interfaces:** `maakAdminApi(haal: ProjectenFetch, gebruikerId: string)` provides typed methods matching Tasks 3–6 endpoints and always includes the expected-user header; mutations preserve a UUID across retries until the payload/operation changes. `useAdminZoeken` owns query, pending/error state, grouped results, cancellation/generation checks, and clearing on account changes. Shared list and form components receive explicit DTOs/actions rather than inferring active organisation.

- [x] Write client tests asserting correct explicit target URLs, expected-user headers, same mutation ID on retry/different ID on payload change, server errors preserving form values, rejected stale search responses, and clearing results after sign-out. Add an E2E flow for superuser-without-company navigation, search, record edit, access controls, notes, history, and ordinary-user denial.
- [x] Run the client tests first and observe failures. Load Impeccable craft-floor before UI edits; use the user's approved written interface direction and existing blue/slate Nuxt UI composition. Record a route surface brief; no mockup round or redesign is needed because the user chose written design and approved it.
- [x] Implement the admin layout, global search, all list/detail routes, empty/error/loading states, and URL-backed list filters. Add the access explanation, local trial/free-access controls with reason and Stripe acknowledgements, subscription/customer links, support notes and due reminders, and audit before/after detail. No raw user text is rendered as HTML. Add corresponding Dutch, Belgian French, and British English text as the UI is built.
- [x] Audit detail shows collapsed correction sessions and individual revision entries, loads large revisions only when opened, and presents field/path changes without freezing on large arrays. Project detail shows deleted state, related company, exports, and read-only/editor links.
- [x] Run `pnpm exec vitest run apps/web/test/admin-client.test.ts apps/web/test/admin-zoeken-client.test.ts apps/web/test/vertalingen.test.ts apps/web/test/foutcodes.test.ts`, then `pnpm --filter @elentrik/web exec playwright test admin-dashboard.spec.ts`; require the relevant checks to pass, then commit `feat(SB-5): build the administration workspace`.

### Task 9: Shared editor in explicit support context

**Files:** Extract `app/components/editor/ProjectEditor.vue` from `app/pages/projecten/[id].vue`; create `app/editor/context.ts`, `app/composables/useAdminProjectApi.ts`, `app/components/admin/SupportBanner.vue`, `app/pages/admin/projecten/[id]/bewerken.vue`, `test/admin-editor.test.ts`, `test/admin-editor-api.test.ts`, `e2e/admin-projectcorrectie.spec.ts`. Modify `useProjectenApi.ts`, `useBestandenApi.ts`, `useExportsApi.ts`, `useAutosave.ts`, `concepten.ts`, `EditorBovenbalk.vue`, `ConflictDialoog.vue`, `PlanCanvas.vue`, and plan-add/draw components that directly construct APIs; extend relevant existing editor/recovery tests and locale files.

**Interfaces:** Provide `EditorContext` through a typed injection key: `{ modus: "klant" | "admin"; projectId: string; gebruikerId: string; terug: string; projecten: Pick<ProjectenApi, "haal" | "bewaar">; bestanden: BestandenApi; exportLijst: (id: string) => Promise<ExportInfo[]>; bestandUrl: (id: string) => string; mogelijkheden: { schrijven: boolean; dupliceren: boolean; nieuwProject: boolean; exporteren: boolean } }`. Customer-specific operations remain available in the customer context, with no fake admin implementations. Extend `ConceptPlek` and `nieuwsteConcept` with optional mode defaulting to `klant`, preserving old customer keys and claiming legacy drafts only in customer mode. Make autosave duplication/new-project callbacks optional and guard their commands.

- [x] Write tests for customer/admin transport isolation, file URLs from nested components, read-only admin open, write only after reason/session creation, subscription-independent admin write capability, and no create/duplicate/export actions through buttons or shortcuts. Test old customer draft compatibility and strict separation of admin/customer draft recovery for the same user/project.
- [x] Add tests for expired/revoked correction returning read-only state with local work retained, changed login not restarting saves, pending autosave completed before explicit session completion, and retry IDs tied to immutable save payloads. Conflict UI offers load-latest or local JSON download, preserving locally referenced plan IDs with an explanation that the download is not a full file archive.
- [x] Run `pnpm exec vitest run apps/web/test/admin-editor.test.ts apps/web/test/admin-editor-api.test.ts`; observe failures.
- [x] Extract the editor without changing customer behaviour, inject all relevant APIs, add explicit support capabilities/banner/session lifecycle, and route back to the correct admin detail. Avoid relying on browser query parameters for permission or correction reasons. Prevent unmount autosave after a correction has ended; a reload requires a new correction session before saving recovered work.
- [x] Implement admin project transport with immutable pending mutation envelopes so an uncertain save cannot change payload under the same UUID. Preserve the existing version-conflict and account-change pathways. Disable unsupported recovery actions in both display and command handlers; file upload/read failures preserve user work.
- [x] Run `pnpm exec vitest run apps/web/test/admin-editor.test.ts apps/web/test/admin-editor-api.test.ts apps/web/test/autosave.test.ts apps/web/test/concepten.test.ts apps/web/test/projecten-api.test.ts apps/web/test/plan-tekenen.test.ts apps/web/test/plan-opladen.test.ts apps/web/test/plan-bediening.test.ts apps/web/test/situatie-store.test.ts apps/web/test/situatie-sneltoetsen.test.ts apps/web/test/sneltoetsen.test.ts apps/web/test/sessie-store.test.ts apps/web/test/sessie-fouten.test.ts`. Run `pnpm --filter @elentrik/web exec playwright test admin-projectcorrectie.spec.ts editor.spec.ts project-verwijderd.spec.ts export.spec.ts`; require relevant checks to pass, then commit `feat(SB-5): enable audited corrections in the project editor`.

### Task 10: Complete verification, operator documentation, and review

**Files:** Complete `docs/admin-beheer.md`, update `docs/lokaal-en-online.md` with the admin entry/runbook link, maintain this plan's checkboxes, and add any missing acceptance checks to `e2e/admin-dashboard.spec.ts` / `admin-projectcorrectie.spec.ts`. Preserve the current branch and only stage feature files.

**Interfaces:** No new product APIs. Deliver migration/runbook instructions and a verified feature covering all 14 acceptance items from the design.

- [x] Check every acceptance item against its owning tasks/tests. Document superuser bootstrap/revocation, local trial/free-access semantics, Stripe subscription links, support-session expiry, audit retention/storage implications, and note visibility. Identify unverified environment-dependent checks explicitly.
- [x] Run `pnpm test`, `pnpm typecheck`, and `pnpm --filter @elentrik/web build`. Run the complete web Playwright suite against its configured isolated database/mail/PDF services. If infrastructure is absent, provision only the documented local test services; do not target another environment or quietly omit the failed check.
- [x] Inspect admin overview/details/editor at desktop and narrow widths, keyboard navigation, and theme behaviour. Run the Impeccable mechanical detector once over changed UI, then its required independent finish review using screenshots and the approved direction; fix material findings within the bounded workflow. Use the required code review workflow for the whole branch, particularly access, idempotency, editor extraction, and cleanup.
- [x] Re-run only checks affected by fixes, verify `git diff --check`, and record commands/results. Commit remaining feature changes with `feat(SB-5): finish admin dashboard verification and documentation` or a specific fix message as appropriate.
- [x] Follow finishing-a-development-branch for integration, preserving the repository's documented feature → `develop` → `staging` → `main` branch flow. If a PR is created, use Orca Linear's completion flow once: attach the PR, post the concise completion comment, and move SB-5 to its review state without regressing a completed/cancelled issue. Do not mark completion while required work remains.

## Plan self-review

Spec coverage: access/entry → Task 1; mutation/audit guarantees → Task 2; overview/lists/search/Stripe/explanations → Task 3; record corrections/free access/trial → Task 4; notes/follow-ups → Task 5; project sessions/saves/uploads → Task 6; retained files/history → Task 7; dashboard UI/translations → Task 8; complete project correction workflow → Task 9; operation/verification → Task 10. Review Focus cases are assigned to the relevant test steps. No proposed later feature (impersonation, customer timeline, project restoration, external bug intake, Stripe billing mutation) is added.

Execution method: native execution, explicitly approved by the user. One implementer keeps the API, schema and editor interfaces consistent; an independent whole-branch review follows the implementation.


## Verification and review record — 2026-11-03

- Final `pnpm test`: 170 functional files, 3,445 tests passed; five performance files/tests passed. No thresholds relaxed.
- `pnpm typecheck`: all packages passed after the review fixes. `pnpm --filter @elentrik/web build` passed on final implementation f6e8044 (1m 51s).
- Complete Playwright run: 73 cases exercised; 62 initially passed and 11 stale expectations failed. Baseline source verified the existing behaviour before correcting selectors. The affected 29-case run passed 28 including the new recovery case; its remaining circuit-table inspector expectation was corrected. The final 21-case editor/export/recovery/table run passed entirely. Together all 74 current browser cases have passing evidence. No test infrastructure targets production.
- Desktop 1440x1000 and mobile 390x844: ten captures inspected, keyboard entry and document overflow checked, light/dark company views checked. Mechanical detector ran once with no findings. Independent visual review requested compact mobile counts; the reviewer scored that fix resolved with disposition `ship` (fix-specific verdict). Incumbent DESIGN.md/design.json extracted and rechecked after final state changes.
- Independent whole-branch code review: uncertain autosave retries could conflict with an administrator's own earlier save. Fixed using immutable support snapshots and acknowledged counters; RED-to-GREEN integrated tests cover continued/in-flight edits, repeated lost responses, real third-party conflicts, rejected requests, reloads, and completion flushes.
- Wrong-project local recovery download was regraded Important: a previous document could be labelled as the newly requested project during loading. Browser RED-to-GREEN proves download stays disabled for a delayed/failed new document while refused-save recovery remains available for the loaded project.
- Integration target remains `develop`; no merge, push, production migration, account promotion, or deployment was performed. The user chooses the integration action at handoff.

### Rulings made during implementation

- page-middleware unavailable-state E2E coverage moves to Task 8, when admin pages exist; API remains covered now — costs delayed browser evidence only.
- serialize existing company settings/logo writers with the same organisation row lock as admin corrections — otherwise the precondition token cannot prevent a customer edit being overwritten — small extra transaction on these two existing write paths. No-op audit verification completed in actual domain edits (Task 2 helper intentionally does not emit audit itself).
- supplement the initial revision reference scan with a shared advisory lock and final reference check before destructive cleanup — a scan alone races an autosave committed during cleanup — support saves briefly serialize with each destructive cleanup transaction; no lock held for the full storage scan.
- use admin/projecten/[id]/index.vue for the project detail URL — this makes the support editor a sibling route instead of nesting it inside a detail page with duplicate requests — URL and approved flow stay identical. Add contextual membership role to user summaries when filtered by company, to fulfill the specified member-role display.
- isolate Playwright Postgres on fixed localhost port 55432 and Mailpit on 8026/1026 — the previous inbox cleanup affected development mail and Windows reserves 5432 — costs two dedicated local test services; database guard still rejects other destinations.
- route existing nested plan components through the typed context inside useBestandenApi, and mount the existing export dialog only for customer capabilities — avoids fake unsupported export implementations and duplicated context plumbing — all nested plan reads/uploads covered by unit injection and browser upload checks.
- update stale customer E2E expectations to existing product behaviour (rail creation already adds A1; property inspector opens explicitly; dirty-only company save; current electrical-error labels and status selectors) — unchanged production sources and existing unit tests confirm these behaviours — tests now cover the current flow rather than the previous UI.
- update remaining stale company E2E selectors to the existing account-menu navigation, dirty-only save state and inline saved status — git show 9c2aefc confirms these predate SB-5; full browser RED demonstrates stale expectations — test-only changes, no customer behaviour change.
- align kringenlijst E2E with its nine pre-existing columns and wait for hydration after the raw SSR-cookie response before opening the account menu — baseline source proves the columns, browser trace shows the click before hydration; preserve the cookie assertion itself — test-only maintenance, no runtime changes.
- include pre-existing role-change confirmation and explicit property/findings-panel opening in remaining organisation/language E2E tests — browser traces stop at the existing confirmation/hidden inspector, baseline code confirms controls — tests now exercise current intended flows; runtime unchanged.
- production substring-search latency and long-term revision growth remain unmeasured — bounded queries and tested retention are shipped without production capacity promises — larger deployments may need measured indexing/storage policy.
- visual polish is assessed by the separate Impeccable reviewer — code review covers functional invariants; supplied captures cover stated desktop/mobile/theme scope — unpictured states are not independently visually certified.

### Deferred minor

- With billing globally disabled, skipped payment-attention groups still display zero rather than being omitted. Local access and Stripe behaviour are unaffected.

Temporary verification logs remain in the ignored task workspace: automatic approval review rejected their cleanup with `blocked by policy`. No source files or feature commits were affected.
